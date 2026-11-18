import { sql } from "drizzle-orm";

import { db } from "./client";

/**
 * Verifica que a conexão da aplicação é mesmo incapaz de furar o isolamento
 * por anfitrião.
 *
 * Existe porque a falha aqui é silenciosa. Se `DATABASE_URL` apontar para a
 * conexão de migração — e as duas strings ficam lado a lado no `.env` —, a
 * aplicação sobe, todas as telas funcionam, todos os testes de negócio passam,
 * e o isolamento simplesmente não existe. Nenhum erro, nenhum log. Só um
 * anfitrião enxergando os dados de outro no dia em que houver um segundo.
 *
 * Duas condições, as duas necessárias:
 *
 * 1. O papel não pode ter BYPASSRLS, que ignora toda política.
 * 2. O papel não pode ser dono das tabelas: o dono ignora RLS a menos que a
 *    tabela tenha FORCE, e depender só do FORCE é depender de ninguém ter
 *    esquecido de aplicá-lo numa tabela nova.
 */
export type RelatorioIsolamento = {
  papel: string;
  temBypassRls: boolean;
  tabelasQuePossui: string[];
  seguro: boolean;
};

export async function inspecionarIsolamento(): Promise<RelatorioIsolamento> {
  const [papelInfo] = await db.execute<{
    papel: string;
    bypass_rls: boolean | null;
  }>(sql`
    select
      current_user::text as papel,
      (select rolbypassrls from pg_roles where rolname = current_user) as bypass_rls
  `);

  const possuidas = await db.execute<{ tabela: string }>(sql`
    select c.relname::text as tabela
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles r on r.oid = c.relowner
    where n.nspname = 'public'
      and c.relkind = 'r'
      and r.rolname = current_user
    order by c.relname
  `);

  const papel = papelInfo?.papel ?? "desconhecido";
  const temBypassRls = papelInfo?.bypass_rls === true;
  const tabelasQuePossui = possuidas.map((l) => l.tabela);

  return {
    papel,
    temBypassRls,
    tabelasQuePossui,
    seguro: !temBypassRls && tabelasQuePossui.length === 0,
  };
}

/** Versão que levanta erro. Use em verificação de saúde e no CI. */
export async function verificarIsolamento(): Promise<void> {
  const r = await inspecionarIsolamento();
  if (r.seguro) return;

  const motivos: string[] = [];
  if (r.temBypassRls) {
    motivos.push(
      `o papel "${r.papel}" tem BYPASSRLS, que ignora todas as políticas de isolamento`,
    );
  }
  if (r.tabelasQuePossui.length > 0) {
    motivos.push(
      `o papel "${r.papel}" é dono de ${r.tabelasQuePossui.length} tabela(s) ` +
        `(${r.tabelasQuePossui.slice(0, 3).join(", ")}${r.tabelasQuePossui.length > 3 ? "…" : ""}), ` +
        `e o dono ignora RLS`,
    );
  }

  throw new Error(
    `DATABASE_URL não pode ser usada pela aplicação: ${motivos.join("; ")}.\n` +
      `Isso aponta para a conexão de migração. A aplicação usa "villaperi_app"; ` +
      `"villaperi_owner" é só para db:migrate.`,
  );
}
