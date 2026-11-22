import { describe, expect, it } from "vitest";

import {
  apenasDigitos,
  formatarTelefone,
  mesmoTelefone,
  telefoneCanonico,
} from "./telefone";

describe("formatarTelefone", () => {
  it("formata celular e fixo brasileiros", () => {
    expect(formatarTelefone("62988001004")).toBe("(62) 98800-1004");
    expect(formatarTelefone("6232411234")).toBe("(62) 3241-1234");
  });

  it("tira o 55 da frente e devolve com o +55", () => {
    expect(formatarTelefone("5562988001004")).toBe("+55 (62) 98800-1004");
    expect(formatarTelefone("556232411234")).toBe("+55 (62) 3241-1234");
  });

  it("aceita o que já veio pontuado", () => {
    expect(formatarTelefone("(62) 98800-1004")).toBe("(62) 98800-1004");
    expect(formatarTelefone("62 9 8800 1004")).toBe("(62) 98800-1004");
  });

  it("devolve como veio o que não reconhece", () => {
    // Melhor um número estrangeiro feio que um brasileiro inventado: a casa
    // recebe hóspede de fora, e um DDD inventado não liga para ninguém.
    expect(formatarTelefone("+351 912 345 678")).toBe("+351 912 345 678");
    expect(formatarTelefone("123")).toBe("123");
  });

  it("devolve null para vazio", () => {
    expect(formatarTelefone(null)).toBeNull();
    expect(formatarTelefone("")).toBeNull();
  });
});

describe("apenasDigitos", () => {
  it("deixa o número do jeito que o wa.me aceita", () => {
    expect(apenasDigitos("+55 (62) 98800-1004")).toBe("5562988001004");
  });
});

describe("telefoneCanonico", () => {
  it("põe o 55 em número nacional, escrito de qualquer jeito", () => {
    // Sem isto, o mesmo hóspede vira duas fichas: uma do formulário do site
    // e outra da API do WhatsApp.
    for (const escrito of [
      "62988887777",
      "(62) 98888-7777",
      "62 9 8888 7777",
      "62-98888-7777",
    ]) {
      expect(telefoneCanonico(escrito)).toBe("5562988887777");
    }
  });

  it("não mexe no que já tem código de país", () => {
    expect(telefoneCanonico("5562988887777")).toBe("5562988887777");
    expect(telefoneCanonico("+55 62 98888-7777")).toBe("5562988887777");
  });

  it("não inventa código de país para número estrangeiro", () => {
    // 351 912 345 678 tem 12 dígitos: já vem com o país. Pôr 55 na frente
    // criaria um número que não liga para ninguém.
    expect(telefoneCanonico("+351 912 345 678")).toBe("351912345678");
  });

  it("fixo nacional de 10 dígitos também ganha o 55", () => {
    expect(telefoneCanonico("6232411234")).toBe("556232411234");
  });
});

describe("mesmoTelefone", () => {
  it("reconhece o mesmo número escrito de jeitos diferentes", () => {
    expect(mesmoTelefone("62988887777", "+55 (62) 98888-7777")).toBe(true);
    expect(mesmoTelefone("5562988887777", "62988887777")).toBe(true);
  });

  it("não confunde números diferentes", () => {
    expect(mesmoTelefone("62988887777", "62988887778")).toBe(false);
  });

  it("vazio nunca é igual a nada — nem a outro vazio", () => {
    // Duas fichas sem telefone não são a mesma pessoa, e tratá-las como
    // iguais juntaria hóspedes distintos numa ficha só.
    expect(mesmoTelefone(null, null)).toBe(false);
    expect(mesmoTelefone("", "")).toBe(false);
    expect(mesmoTelefone("62988887777", null)).toBe(false);
  });
});
