import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Invariante estrutural: toda tabela que tem dono precisa ter isolamento.
 *
 * Este teste existe porque o erro é de omissão, e omissão não aparece. Criar
 * uma tabela nova e esquecer a política não quebra nada: as telas funcionam,
 * as consultas respondem, os testes de negócio passam — e aquela tabela fica
 * legível por qualquer anfitrião. O sintoma só apareceria quando houvesse um
 * segundo anfitrião, com dados reais dentro.
 *
 * Em vez de confiar em revisão, o CI falha aqui e diz o nome da tabela.
 */

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) throw new Error("DATABASE_URL_MIGRATOR é necessária nos testes.");
const cliente = postgres(url, { max: 1 });
const db = drizzle(cliente);

afterAll(async () => {
  await cliente.end();
});

/** Tabelas sem coluna de dono, por decisão explícita. */
const SEM_DONO_POR_DECISAO = new Set([
  // A raiz do isolamento. Não tem `anfitriao_id` porque ELA é o anfitrião: a
  // política dela compara `id`. Verificada à parte, no teste da raiz.
  "anfitriao",
  // Dado de referência compartilhado entre anfitriões: todo mundo lê os
  // planos, só o owner escreve.
  "plano",
  // Controle interno do drizzle-kit.
  "__drizzle_migrations",

  // Tabelas do Better Auth. Ficam fora do isolamento porque o login acontece
  // ANTES de existir contexto de anfitrião: é preciso achar a pessoa pelo
  // e-mail para só então descobrir de quem ela é. Quem carrega o anfitrião é
  // `membro`, essa sim isolada.
  //
  // O preço disso é que nenhuma rota pode devolver linha destas tabelas sem
  // antes resolver o membro — por isso `sessaoAtual()` é o único caminho.
  "user",
  "session",
  "account",
  "verification",
  "two_factor",
]);

type Linha = {
  tabela: string;
  tem_anfitriao: boolean;
  rls_ligado: boolean;
  rls_forcado: boolean;
  politicas: number;
};

async function inventario(): Promise<Linha[]> {
  return db.execute<Linha>(sql`
    select
      c.relname::text as tabela,
      exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'anfitriao_id' and not a.attisdropped
      ) as tem_anfitriao,
      c.relrowsecurity   as rls_ligado,
      c.relforcerowsecurity as rls_forcado,
      (select count(*)::int from pg_policy p where p.polrelid = c.oid) as politicas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `);
}

describe("cobertura de RLS", () => {
  it("encontrou tabelas para verificar", async () => {
    const linhas = await inventario();
    expect(linhas.length).toBeGreaterThan(5);
  });

  it("toda tabela com anfitriao_id tem RLS ligado", async () => {
    const faltando = (await inventario())
      .filter((l) => l.tem_anfitriao && !l.rls_ligado)
      .map((l) => l.tabela);
    expect(faltando).toEqual([]);
  });

  it("toda tabela com anfitriao_id tem FORCE ROW LEVEL SECURITY", async () => {
    const faltando = (await inventario())
      .filter((l) => l.tem_anfitriao && !l.rls_forcado)
      .map((l) => l.tabela);
    expect(faltando).toEqual([]);
  });

  it("toda tabela com anfitriao_id tem ao menos uma política", async () => {
    const faltando = (await inventario())
      .filter((l) => l.tem_anfitriao && l.politicas === 0)
      .map((l) => l.tabela);
    expect(faltando).toEqual([]);
  });

  it("a tabela raiz `anfitriao` também está protegida, pela coluna id", async () => {
    // Está na lista de exceções acima por não ter `anfitriao_id`; sem este
    // teste, a exceção a tiraria de toda verificação — e ela é justamente a
    // tabela que diz quem são os anfitriões.
    const raiz = (await inventario()).find((l) => l.tabela === "anfitriao");
    expect(raiz).toBeDefined();
    expect(raiz?.rls_ligado).toBe(true);
    expect(raiz?.rls_forcado).toBe(true);
    expect(raiz?.politicas).toBeGreaterThan(0);
  });

  it("nenhuma tabela ficou sem dono por descuido", async () => {
    // Uma tabela de domínio sem anfitriao_id é dado compartilhado entre
    // anfitriões. Às vezes é certo (planos); quase sempre é esquecimento.
    // Entrar na lista obriga a decidir de propósito.
    const semDono = (await inventario())
      .filter((l) => !l.tem_anfitriao && !SEM_DONO_POR_DECISAO.has(l.tabela))
      .map((l) => l.tabela);
    expect(semDono).toEqual([]);
  });
});
