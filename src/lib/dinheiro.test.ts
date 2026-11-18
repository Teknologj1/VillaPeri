import { describe, expect, it } from "vitest";

import {
  ajustar,
  aplicarPercentual,
  arredondarCentavos,
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
