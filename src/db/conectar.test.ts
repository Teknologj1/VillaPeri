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

/**
 * Esperar por conexão TEM DE TER PRAZO, e o pool TEM DE TER FOLGA.
 *
 * Em modo transação o pooler segura a conexão do servidor até a transação
 * terminar. Quando a aplicação morre entre o `begin` e o resto — função
 * serverless congelada, requisição abortada pelo visitante —, aquela conexão
 * fica `idle in transaction` e o pool do cliente que a tinha não recupera.
 *
 * Com `max: 1`, que era o valor em produção, a instância quente ficava com a
 * única conexão presa e TODA requisição que caísse nela travava para sempre,
 * sem chegar ao banco e sem erro em log nenhum: a página respondia 200,
 * mandava o shell e não fechava a conexão. Diagnosticado no
 * `pg_stat_activity` de produção, com a consulta `begin` parada há quatro
 * minutos.
 *
 * `connect_timeout` é o que transforma espera infinita em erro visível, que é
 * a diferença entre um defeito achável e este, que levou horas.
 */
describe("resiliência do pool", () => {
  const fonte = readFileSync("src/db/client.ts", "utf8");

  it("tem folga para uma conexão perdida", () => {
    const producao = /max:\s*env\.NODE_ENV === "production" \? (\d+)/.exec(fonte);
    expect(producao, "não achei o `max` de produção em client.ts").not.toBeNull();
    expect(
      Number(producao![1]),
      "com uma conexão só, uma transação pendurada trava a instância inteira, " +
        "para sempre, sem erro",
    ).toBeGreaterThan(1);
  });

  it("não espera por conexão para sempre", () => {
    expect(
      /connect_timeout:\s*\d+/.test(fonte),
      "sem connect_timeout, pool esgotado é espera infinita: a requisição " +
        "nunca falha, nunca responde, e nada aparece em log",
    ).toBe(true);
  });

  it("devolve conexão ociosa", () => {
    expect(/idle_timeout:\s*\d+/.test(fonte)).toBe(true);
  });
});

/**
 * E a rede de segurança do lado do banco, que vale mesmo com bug no cliente.
 */
describe("bootstrap do banco gerenciado", () => {
  const fonte = readFileSync("scripts/bootstrap-remoto.ts", "utf8");

  it("põe prazo em transação pendurada do papel da aplicação", () => {
    expect(
      /villaperi_app\s+set idle_in_transaction_session_timeout/.test(fonte),
      "é o que transforma `quebrado para sempre` em `quebrado por 20 segundos`",
    ).toBe(true);
  });

  it("e confere que o prazo ficou lá", () => {
    expect(fonte).toContain("idle_in_transaction_session_timeout=%");
  });
});
