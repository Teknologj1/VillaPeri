import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Aplica as migrações sem abrir conexão Postgres.
 *
 * `npm run db:migrate` é o caminho normal e continua sendo. Este existe para
 * onde não há TCP até o banco — este ambiente, por exemplo, sai para a
 * internet por um proxy HTTPS que, por desenho, não tunela banco de dados.
 *
 * ## O registro é o mesmo do Drizzle, de propósito
 *
 * O migrador do Drizzle guarda o que aplicou em `drizzle.__drizzle_migrations`:
 * o `sha256` do ARQUIVO inteiro e o `when` do journal, e decide o que falta
 * comparando o `created_at` mais recente com o `when` de cada entrada.
 *
 * Este script escreve exatamente a mesma coisa (conferi em
 * `node_modules/drizzle-orm/pg-core/dialect.js`, em vez de supor). Então um
 * `npm run db:migrate` rodado depois, de uma máquina com TCP, vê as migrações
 * como aplicadas e não tenta de novo — que seria erro em cascata, com
 * `CREATE TABLE` sobre tabela que já existe.
 *
 * ## Cada migração vai numa requisição
 *
 * Uma requisição é uma transação implícita, então a migração é atômica: ou
 * todos os comandos dela entram, ou nenhum. O `set role villaperi_owner` abre
 * cada uma para que as tabelas nasçam do papel dono — a API do provedor roda
 * como `postgres`, e tabela criada por `postgres` deixaria o nosso desenho de
 * papéis pela metade.
 *
 * A maior migração tem 15 KB; o conjunto todo, 71 KB. Cabe.
 *
 * ## Uso
 *
 *   NODE_USE_ENV_PROXY=1 SUPABASE_PROJECT_REF=<ref> npx tsx scripts/migrar-via-api.ts
 *
 * `NODE_USE_ENV_PROXY=1` só é necessário atrás de um proxy: sem ele o `fetch`
 * embutido do Node ignora HTTPS_PROXY e falha com um `fetch failed` mudo.
 */

const PASTA = "./src/db/migrations";

type Entrada = { idx: number; when: number; tag: string };

function migracoes(): { tag: string; when: number; hash: string; sql: string }[] {
  const journal = JSON.parse(
    readFileSync(`${PASTA}/meta/_journal.json`, "utf8"),
  ) as { entries: Entrada[] };

  return journal.entries.map((e) => {
    const sql = readFileSync(`${PASTA}/${e.tag}.sql`, "utf8");
    return {
      tag: e.tag,
      when: e.when,
      // sha256 do arquivo INTEIRO, incluindo os marcadores de quebra e os
      // comentários. É assim que o Drizzle calcula; qualquer diferença aqui
      // faria o `db:migrate` normal achar que nada foi aplicado.
      hash: createHash("sha256").update(sql).digest("hex"),
      sql,
    };
  });
}

async function principal() {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!ref) {
    console.error(
      "Defina SUPABASE_PROJECT_REF. Para migrar por conexão direta, use\n" +
        "`npm run db:migrate`, que é o caminho normal.",
    );
    process.exit(1);
  }

  const { executorSupabase } = await import("./_executor-sql");
  const ex = executorSupabase(ref);

  // A mesma criação que o Drizzle faz antes de qualquer coisa — e COMO o
  // villaperi_owner.
  //
  // O `set role` não é detalhe: a API do provedor roda como `postgres`, e uma
  // tabela de controle criada por ele fica inacessível ao owner. O resultado é
  // uma migração que aplica o DDL inteiro e morre no registro, com
  // "permission denied for table __drizzle_migrations" — foi o que aconteceu na
  // primeira execução. A transação desfez tudo, o que salvou o banco, mas o
  // mesmo erro repetiria para sempre.
  //
  // É também o dono que um `db:migrate` por TCP criaria, já que ele conecta
  // como villaperi_owner. Os dois caminhos deixam o banco igual.
  await ex.rodar(`
    set role villaperi_owner;
    create schema if not exists drizzle;
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    );
  `);

  const [ultima] = await ex.consultar<{ created_at: string | null }>(
    `select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`,
  );
  const marca = ultima?.created_at == null ? null : Number(ultima.created_at);

  const todas = migracoes();
  // A MESMA regra do Drizzle: aplica o que tem `when` maior que a marca. Não é
  // "o que não está na tabela por hash" — se eu usasse outro critério, os dois
  // migradores discordariam sobre o que falta.
  const pendentes = todas.filter((m) => marca === null || marca < m.when);

  console.log(
    `${todas.length} migrações no journal, ${pendentes.length} pendentes` +
      (marca === null ? " (banco vazio)" : ` (última aplicada: ${marca})`),
  );

  for (const m of pendentes) {
    const comandos = m.sql
      .split("--> statement-breakpoint")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    const corpo = [
      "set role villaperi_owner;",
      ...comandos.map((c) => (c.endsWith(";") ? c : `${c};`)),
      `insert into drizzle.__drizzle_migrations ("hash","created_at") ` +
        `values ('${m.hash}', ${m.when});`,
    ].join("\n");

    process.stdout.write(`  ${m.tag} … `);
    await ex.rodar(corpo);
    console.log(`${comandos.length} comandos`);
  }

  if (pendentes.length === 0) {
    console.log("Nada a aplicar.");
    return;
  }

  // Confere que o banco ficou com o que se espera, em vez de confiar na
  // ausência de erro.
  const [contagem] = await ex.consultar<{ tabelas: number; registradas: number }>(
    `select
       (select count(*)::int from pg_tables where schemaname = 'public') as tabelas,
       (select count(*)::int from drizzle.__drizzle_migrations) as registradas`,
  );
  console.log(
    `\nAplicadas. ${contagem?.tabelas} tabelas em public, ` +
      `${contagem?.registradas} migrações registradas.`,
  );

  const alheias = await ex.consultar<{ tabela: string; dono: string }>(
    `select tablename as tabela, tableowner as dono
       from pg_tables
      where schemaname = 'public' and tableowner <> 'villaperi_owner'`,
  );
  if (alheias.length > 0) {
    // Não é fatal — o isolamento depende de o villaperi_app NÃO ser dono —,
    // mas é sinal de que o `set role` não pegou em alguma migração, e os
    // privilégios padrão do owner não valem para estas tabelas.
    console.warn(
      `\nAVISO: ${alheias.length} tabela(s) com outro dono: ` +
        alheias.map((t) => `${t.tabela} (${t.dono})`).join(", "),
    );
  }
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
