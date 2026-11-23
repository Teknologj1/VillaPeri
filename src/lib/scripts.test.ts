import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Os scripts de verificação, conferidos aqui porque o erro deles só aparece
 * em máquina limpa.
 *
 * `PageProps`, `LayoutProps` e `RouteContext` não são importados de lugar
 * nenhum: o Next os escreve em `.next/types` quando roda `next dev`,
 * `next build` ou `next typegen`. Quem já rodou o servidor uma vez tem o
 * diretório pronto e nunca vê o problema — `tsc --noEmit` passa.
 *
 * No CI, que começa de um clone vazio, `.next` não existe. `npm run typecheck`
 * rodava antes de `npm run build`, então o tsc procurava tipos que ninguém
 * havia gerado e o trabalho falhava com vinte e quatro "Cannot find name
 * 'PageProps'" — num código que compila sem um arranhão aqui.
 *
 * A correção é o `typecheck` gerar os tipos ele mesmo, como a documentação do
 * Next recomenda (`next typegen && tsc --noEmit`). Este teste existe para que
 * ninguém volte ao `tsc` pelado achando que simplificou.
 */
const pacote = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

describe("script de typecheck", () => {
  it("gera os tipos de rota antes de chamar o tsc", () => {
    const script = pacote.scripts.typecheck ?? "";

    expect(script, "não existe script `typecheck` no package.json").not.toBe("");

    const geracao = script.indexOf("next typegen");
    const checagem = script.indexOf("tsc");

    expect(
      geracao,
      "`typecheck` precisa rodar `next typegen`: sem ele, numa máquina sem " +
        "`.next` — todo CI, todo clone novo — o tsc não acha PageProps, " +
        "LayoutProps nem RouteContext, e falha num código correto.",
    ).toBeGreaterThanOrEqual(0);

    expect(
      checagem,
      "`typecheck` precisa rodar o tsc; gerar tipos sem conferir nada não " +
        "verifica coisa alguma.",
    ).toBeGreaterThanOrEqual(0);

    expect(
      geracao,
      "a geração dos tipos vem ANTES do tsc, senão ela não serve para esta " +
        "execução.",
    ).toBeLessThan(checagem);
  });
});

/**
 * O CI chama os scripts do package.json, não comandos próprios.
 *
 * Se o workflow rodasse `npx tsc --noEmit` direto, a correção acima não
 * valeria para ele: voltaríamos a ter uma verificação local que passa e um CI
 * que falha — exatamente a divergência que originou o problema.
 */
describe("workflow do CI", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");

  it("verifica tipos pelo script, não por um tsc solto", () => {
    expect(ci).toContain("npm run typecheck");

    const tscSolto = /^\s*-\s*run:\s*(npx\s+)?tsc\b/m;
    expect(
      tscSolto.test(ci),
      "o CI está chamando o tsc direto. Use `npm run typecheck`, que gera os " +
        "tipos de rota primeiro.",
    ).toBe(false);
  });

  it("roda o build, que é onde a Vercel quebra", () => {
    expect(ci).toContain("npm run build");
  });
});
