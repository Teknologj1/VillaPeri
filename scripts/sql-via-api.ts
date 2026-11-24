import { readFileSync, statSync } from "node:fs";
import { parseArgs } from "node:util";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Aplica um arquivo `.sql` num banco sem abrir conexão Postgres.
 *
 * Irmão do `migrar-via-api.ts`, para o que não é migração: a carga da semente,
 * uma correção pontual, o primeiro usuário. Existe pela mesma razão — este
 * ambiente sai para a internet por um proxy HTTPS que, por desenho, não tunela
 * banco de dados.
 *
 * Roda tudo COMO `villaperi_owner`, não como o papel do provedor. São duas
 * coisas de uma vez: as tabelas e linhas nascem do dono certo, e o
 * `BYPASSRLS` dele é o que permite inserir a primeira linha de `anfitriao` —
 * que é justamente quem define o contexto que as políticas de RLS leem. Com o
 * papel do provedor, a carga da semente pararia na primeira linha.
 *
 * Uma requisição = uma transação, então o arquivo entra inteiro ou não entra.
 * Arquivos grandes podem ser divididos com `--pedacos`, e aí a atomicidade
 * passa a ser por pedaço: use só se a API recusar o tamanho.
 *
 * ## Uso
 *
 *   NODE_USE_ENV_PROXY=1 SUPABASE_PROJECT_REF=<ref> \
 *     npx tsx scripts/sql-via-api.ts --arquivo semente.sql
 *
 * `NODE_USE_ENV_PROXY=1` só atrás de um proxy: sem ele o `fetch` embutido do
 * Node ignora HTTPS_PROXY e falha com um `fetch failed` mudo.
 */

/** Linhas que o pg_dump põe no cabeçalho e que não queremos reexecutar. */
function limpar(sql: string): string {
  return sql
    .split("\n")
    .filter((linha) => {
      const l = linha.trim();
      if (l.startsWith("--") || l === "") return false;
      // `SET` de sessão do pg_dump (statement_timeout, client_encoding, …) e o
      // `set_config('search_path', '', false)`: inofensivos, mas confundem a
      // leitura do erro quando algo falha, e o search_path vazio quebraria o
      // `set role` se viesse antes dele.
      if (/^SET\s/i.test(l)) return false;
      if (/^SELECT pg_catalog\.set_config/i.test(l)) return false;
      // Metacomandos de psql, não SQL. O pg_dump recente emite `\restrict` e
      // `\unrestrict` em volta do despejo — uma proteção do psql contra
      // injeção por nome de objeto. Enviados ao servidor, dão
      // `syntax error at or near "\"`.
      if (l.startsWith("\\")) return false;
      return true;
    })
    .join("\n");
}

/** Divide em N pedaços, sempre no fim de um comando. */
function emPedacos(sql: string, quantos: number): string[] {
  if (quantos <= 1) return [sql];
  const comandos = sql.split(/;\s*\n/).filter((c) => c.trim().length > 0);
  const porPedaco = Math.ceil(comandos.length / quantos);
  const pedacos: string[] = [];
  for (let i = 0; i < comandos.length; i += porPedaco) {
    pedacos.push(`${comandos.slice(i, i + porPedaco).join(";\n")};`);
  }
  return pedacos;
}

async function principal() {
  const { values } = parseArgs({
    options: {
      arquivo: { type: "string" },
      pedacos: { type: "string", default: "1" },
      "sem-set-role": { type: "boolean", default: false },
    },
  });

  if (!values.arquivo) {
    console.error("Uso: npx tsx scripts/sql-via-api.ts --arquivo caminho.sql");
    process.exit(1);
  }

  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!ref) {
    console.error("Defina SUPABASE_PROJECT_REF.");
    process.exit(1);
  }

  const bruto = readFileSync(values.arquivo, "utf8");
  const sql = limpar(bruto);
  const tamanho = statSync(values.arquivo).size;

  const { executorSupabase } = await import("./_executor-sql");
  const ex = executorSupabase(ref);

  const prefixo = values["sem-set-role"] ? "" : "set role villaperi_owner;\n";
  const pedacos = emPedacos(sql, Number(values.pedacos));

  console.log(
    `${values.arquivo}: ${tamanho} bytes, ${pedacos.length} ` +
      `${pedacos.length === 1 ? "requisição" : "requisições"}`,
  );

  for (const [i, pedaco] of pedacos.entries()) {
    process.stdout.write(`  ${i + 1}/${pedacos.length} … `);
    await ex.rodar(prefixo + pedaco);
    console.log("ok");
  }
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
