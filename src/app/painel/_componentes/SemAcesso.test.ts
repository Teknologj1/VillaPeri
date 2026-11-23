import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * `SemAcesso` aparece sempre dentro da `main` da página que o usa — onze
 * lugares, todos assim. Enquanto ele próprio era uma `main` com `h1`, cada
 * uma dessas páginas servia, para quem não tem permissão, duas marcas de
 * conteúdo principal uma dentro da outra e dois `h1`.
 *
 * Nada disso falha no build, no lint ou no typecheck: é HTML válido para o
 * compilador e inválido para a especificação. Apareceu num seletor de teste
 * que casou com duas `main` ao mesmo tempo.
 *
 * O teste é sobre o texto do componente porque o projeto não tem renderização
 * de React nos testes de unidade, e montar essa infraestrutura para checar uma
 * tag seria desproporcional. Vale o que diz: o componente não abre `main` nem
 * `h1`.
 */
const fonte = readFileSync("src/app/painel/_componentes/SemAcesso.tsx", "utf8");

describe("SemAcesso", () => {
  it("não abre uma segunda <main>", () => {
    expect(
      /<main[\s>]/.test(fonte),
      "SemAcesso é usado DENTRO da <main> de cada página do painel. Uma " +
        "<main> aqui aninha duas marcas de conteúdo principal.",
    ).toBe(false);
  });

  it("não abre um segundo <h1>", () => {
    expect(
      /<h1[\s>]/.test(fonte),
      "a página que usa SemAcesso já tem o <h1> dela; aqui o título é <h2>.",
    ).toBe(false);
  });

  it("continua nomeando o módulo e oferecendo a volta", () => {
    // O valor desta tela é dizer QUAL módulo faltou — é o que vira pedido ao
    // proprietário em vez de "o sistema está quebrado".
    expect(fonte).toContain("{modulo}");
    expect(fonte).toContain('href="/painel"');
  });
});
