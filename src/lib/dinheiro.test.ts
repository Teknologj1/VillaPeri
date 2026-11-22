import { describe, expect, it } from "vitest";

import {
  ajustar,
  aplicarPercentual,
  arredondarCentavos,
  centavosDeTexto,
  formatarReais,
} from "./dinheiro";

describe("arredondarCentavos", () => {
  it("arredonda meio para cima", () => {
    expect(arredondarCentavos(2.5)).toBe(3);
    expect(arredondarCentavos(2.4)).toBe(2);
    expect(arredondarCentavos(3.5)).toBe(4);
  });

  it("arredonda negativo meio para cima em valor absoluto", () => {
    // Math.round(-2.5) em JavaScript é -2. Aqui tem de ser -3, senão um
    // reembolso de meio centavo favorece sempre o mesmo lado.
    expect(arredondarCentavos(-2.5)).toBe(-3);
    expect(arredondarCentavos(-2.4)).toBe(-2);
  });

  it("mantém inteiros e zero", () => {
    expect(arredondarCentavos(1500)).toBe(1500);
    expect(arredondarCentavos(0)).toBe(0);
  });

  it("recusa valor não finito em vez de propagar NaN", () => {
    expect(() => arredondarCentavos(NaN)).toThrow();
    expect(() => arredondarCentavos(Infinity)).toThrow();
  });
});

describe("aplicarPercentual", () => {
  it("calcula percentual de um valor em centavos", () => {
    expect(aplicarPercentual(10_000, 15)).toBe(1_500);
    expect(aplicarPercentual(10_000, 100)).toBe(10_000);
    expect(aplicarPercentual(10_000, 0)).toBe(0);
  });

  it("arredonda o resultado para centavo inteiro", () => {
    // 33% de R$ 100,01 = 3300,33 centavos
    expect(aplicarPercentual(10_001, 33)).toBe(3_300);
    // 50% de R$ 0,05 = 2,5 centavos -> 3
    expect(aplicarPercentual(5, 50)).toBe(3);
  });

  it("nunca devolve fração de centavo", () => {
    for (let base = 1; base <= 500; base++) {
      for (const pct of [7, 12.5, 33, 71.3]) {
        expect(Number.isInteger(aplicarPercentual(base, pct))).toBe(true);
      }
    }
  });
});

describe("ajustar", () => {
  it("soma o ajuste ao valor base", () => {
    // Regra de feriado: "20% sobre a base" de uma diária de R$ 400,00
    expect(ajustar(40_000, 20)).toBe(48_000);
  });

  it("desconta com percentual negativo", () => {
    expect(ajustar(40_000, -10)).toBe(36_000);
  });

  it("devolve a base com ajuste zero", () => {
    expect(ajustar(40_000, 0)).toBe(40_000);
  });
});

describe("formatarReais", () => {
  it("formata no padrão brasileiro", () => {
    //   é o espaço não separável que o Intl usa depois do "R$".
    expect(formatarReais(123_456)).toBe("R$ 1.234,56");
    expect(formatarReais(0)).toBe("R$ 0,00");
  });
});

// ---------------------------------------------------------------------------

describe("centavosDeTexto", () => {
  it("lê o que a recepção digita no teclado brasileiro", () => {
    expect(centavosDeTexto("1.234,56")).toBe(123_456);
    expect(centavosDeTexto("543")).toBe(54_300);
    expect(centavosDeTexto("543,00")).toBe(54_300);
    expect(centavosDeTexto("1.500")).toBe(150_000);
    expect(centavosDeTexto("R$ 1.375,00")).toBe(137_500);
    expect(centavosDeTexto(" 110 ")).toBe(11_000);
  });

  it("lê também o que vem copiado de planilha", () => {
    expect(centavosDeTexto("1234.56")).toBe(123_456);
    expect(centavosDeTexto("0.07")).toBe(7);
    // Em float isto daria 7.000000000000001.
    expect(Number.isInteger(centavosDeTexto("0.07"))).toBe(true);
  });

  it("não confunde um ponto decimal com separador de milhar", () => {
    // Quem copia "1.5" de planilha quer um e meio, não mil e quinhentos.
    expect(centavosDeTexto("1.5")).toBe(150);
    expect(centavosDeTexto("1.50")).toBe(150);
    // Com três casas depois do ponto, é milhar.
    expect(centavosDeTexto("1.500")).toBe(150_000);
    expect(centavosDeTexto("1.234.567")).toBe(123_456_700);
  });

  it("aceita negativo, que é como o reembolso entra", () => {
    expect(centavosDeTexto("-300,00")).toBe(-30_000);
    expect(centavosDeTexto("-0.01")).toBe(-1);
  });

  it("devolve null para o que não é valor, em vez de NaN", () => {
    // NaN seguiria adiante e gravaria lixo na tabela de pagamentos.
    for (const lixo of ["", " ", "-", "abc", "1,234,56", "1.2.3", "12,345", "R$"]) {
      expect(centavosDeTexto(lixo)).toBeNull();
    }
  });

  it("ida e volta com formatarReais", () => {
    for (const centavos of [0, 1, 7, 54_300, 137_500, 150_000, 123_456]) {
      expect(centavosDeTexto(formatarReais(centavos))).toBe(centavos);
    }
  });
});
