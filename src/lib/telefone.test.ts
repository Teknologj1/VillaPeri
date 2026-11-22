import { describe, expect, it } from "vitest";

import { apenasDigitos, formatarTelefone } from "./telefone";

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
