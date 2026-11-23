import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `prepare: false` é requisito do provedor, não preferência.
 *
 * Em produção a conexão passa por um pooler em modo transação (Supavisor no
 * Supabase), que não aceita prepared statements nomeados. O padrão da
 * biblioteca é `true`. A consequência é cruel: contra o Postgres local tudo
 * passa — build, lint, 380 testes — e em produção nada conecta.
 *
 * Era o estado do código antes deste teste: `src/db/client.ts` tinha a opção,
 * e as migrações, o seed e os três scripts de linha de comando abriam cada um
 * o seu `postgres(...)` sem ela. Ninguém notaria até o primeiro `db:migrate`
 * contra o Supabase, com o banco de produção já criado e vazio.
 *
 * Agora há uma fábrica só, e este teste é o que impede a sexta cópia.
 */
const PERMITIDOS = new Set([
  "src/db/conectar.ts",
  // `client.ts` tem a criação preguiçosa própria, por causa do `next build`:
  // ele avalia os módulos de toda rota, e construir a conexão no topo do
  // arquivo derruba o build num ambiente sem banco. A opção está lá, e o
  // terceiro teste deste arquivo confere.
  "src/db/client.ts",
]);

/** Arquivos de teste podem abrir a conexão deles: rodam contra o Postgres local. */
function ehTeste(caminho: string): boolean {
  return /\.(int\.)?test\.ts$/.test(caminho);
}

function arquivosTs(raiz: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === "node_modules" || nome === ".next") continue;
      achados.push(...arquivosTs(caminho));
    } else if (nome.endsWith(".ts")) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe("conexão com o banco", () => {
  it("só é aberta pela fábrica", () => {
    const culpados: string[] = [];

    for (const caminho of [...arquivosTs("src"), ...arquivosTs("scripts")]) {
      if (PERMITIDOS.has(caminho) || ehTeste(caminho)) continue;
      const fonte = readFileSync(caminho, "utf8");
      // `postgres(` como chamada, não como parte de "drizzle-orm/postgres-js".
      if (/\bpostgres\(/.test(fonte)) culpados.push(caminho);
    }

    expect(
      culpados,
      "estes arquivos abrem conexão por fora de src/db/conectar.ts. Sem " +
        "`prepare: false` eles funcionam contra o Postgres local e falham " +
        "contra o pooler em modo transação do provedor — em produção, no " +
        "primeiro comando.",
    ).toEqual([]);
  });

  it("a fábrica desliga os prepared statements", () => {
    const fonte = readFileSync("src/db/conectar.ts", "utf8");
    expect(fonte).toMatch(/prepare:\s*false/);
  });

  it("e o cliente da aplicação também", () => {
    // `client.ts` não usa a fábrica: ele tem a própria criação preguiçosa,
    // por causa do `next build`. A opção tem de estar lá também.
    const fonte = readFileSync("src/db/client.ts", "utf8");
    expect(fonte).toMatch(/prepare:\s*false/);
  });
});
