import { describe, expect, it } from "vitest";

import {
  type StatusReserva,
  TransicaoInvalidaError,
  destinosDe,
  devolucaoAoCancelar,
  ehFinal,
  exigirTransicao,
  podeIrPara,
  seguraNoites,
} from "./status";

const TODOS: StatusReserva[] = [
  "pre_reserva",
  "aguardando_aprovacao",
  "confirmada",
  "hospedado",
  "concluida",
  "cancelada",
  "no_show",
];

describe("caminhos da reserva", () => {
  it("segue o fluxo normal: pré-reserva, confirmada, hospedado, concluída", () => {
    expect(podeIrPara("pre_reserva", "confirmada")).toBe(true);
    expect(podeIrPara("confirmada", "hospedado")).toBe(true);
    expect(podeIrPara("hospedado", "concluida")).toBe(true);
  });

  it("desvia para aprovação quando o desconto passa do limite", () => {
    expect(podeIrPara("pre_reserva", "aguardando_aprovacao")).toBe(true);
    expect(podeIrPara("aguardando_aprovacao", "confirmada")).toBe(true);
    expect(podeIrPara("aguardando_aprovacao", "cancelada")).toBe(true);
  });

  it("não pula etapas", () => {
    // Não se faz check-in de uma pré-reserva sem confirmar.
    expect(podeIrPara("pre_reserva", "hospedado")).toBe(false);
    // Nem se conclui sem o hóspede ter entrado.
    expect(podeIrPara("confirmada", "concluida")).toBe(false);
  });

  it("não cancela estadia em curso", () => {
    // Com o hóspede na casa, o caminho é a saída antecipada, que mexe nas
    // datas — não um cancelamento, que apagaria a estadia que aconteceu.
    expect(podeIrPara("hospedado", "cancelada")).toBe(false);
    expect(destinosDe("hospedado")).toEqual(["concluida"]);
  });

  it("no-show só vem de uma reserva confirmada", () => {
    expect(podeIrPara("confirmada", "no_show")).toBe(true);
    expect(podeIrPara("pre_reserva", "no_show")).toBe(false);
    expect(podeIrPara("hospedado", "no_show")).toBe(false);
  });

  it("os finais não voltam atrás", () => {
    for (const final of ["concluida", "cancelada", "no_show"] as const) {
      expect(ehFinal(final)).toBe(true);
      expect(destinosDe(final)).toEqual([]);
      for (const destino of TODOS) {
        expect(podeIrPara(final, destino)).toBe(false);
      }
    }
  });

  it("nenhum status volta para si mesmo", () => {
    for (const s of TODOS) expect(podeIrPara(s, s)).toBe(false);
  });

  it("exigirTransicao explica o que seria possível", () => {
    expect(() => exigirTransicao("pre_reserva", "confirmada")).not.toThrow();

    const erro = (() => {
      try {
        exigirTransicao("confirmada", "concluida");
      } catch (e) {
        return e as TransicaoInvalidaError;
      }
    })()!;
    expect(erro).toBeInstanceOf(TransicaoInvalidaError);
    expect(erro.message).toContain("hospedado");
  });
});

describe("quais status seguram noites", () => {
  it("segura da pré-reserva até a conclusão", () => {
    expect(seguraNoites("pre_reserva")).toBe(true);
    expect(seguraNoites("aguardando_aprovacao")).toBe(true);
    expect(seguraNoites("confirmada")).toBe(true);
    expect(seguraNoites("hospedado")).toBe(true);
  });

  it("concluída continua segurando: a estadia aconteceu", () => {
    // Liberar aqui faria o calendário esquecer que a casa esteve ocupada, e
    // o relatório de ocupação sairia errado.
    expect(seguraNoites("concluida")).toBe(true);
  });

  it("cancelada e no-show liberam", () => {
    expect(seguraNoites("cancelada")).toBe(false);
    expect(seguraNoites("no_show")).toBe(false);
  });
});

describe("devolução ao cancelar", () => {
  // A política da Villa Peri: devolução integral com 7 dias ou mais.
  const FAIXAS = [{ diasAntes: 7, percentualPontosBase: 10_000 }];

  it("devolve tudo dentro do prazo", () => {
    const r = devolucaoAoCancelar(FAIXAS, 10, 50_000);
    expect(r.percentualPontosBase).toBe(10_000);
    expect(r.devolverCentavos).toBe(50_000);
  });

  it("devolve tudo exatamente no limite do prazo", () => {
    expect(devolucaoAoCancelar(FAIXAS, 7, 50_000).devolverCentavos).toBe(50_000);
  });

  it("não devolve nada abaixo do prazo", () => {
    const r = devolucaoAoCancelar(FAIXAS, 6, 50_000);
    expect(r.percentualPontosBase).toBe(0);
    expect(r.devolverCentavos).toBe(0);
  });

  it("devolve sobre o que foi pago, não sobre o total", () => {
    // Quem só deu o sinal não recebe de volta mais do que deu.
    expect(devolucaoAoCancelar(FAIXAS, 30, 16_290).devolverCentavos).toBe(16_290);
  });

  it("com várias faixas, vale a mais exigente que a antecedência alcança", () => {
    const faixas = [
      { diasAntes: 30, percentualPontosBase: 10_000 },
      { diasAntes: 7, percentualPontosBase: 5_000 },
    ];
    expect(devolucaoAoCancelar(faixas, 40, 100_000).devolverCentavos).toBe(100_000);
    expect(devolucaoAoCancelar(faixas, 30, 100_000).devolverCentavos).toBe(100_000);
    expect(devolucaoAoCancelar(faixas, 29, 100_000).devolverCentavos).toBe(50_000);
    expect(devolucaoAoCancelar(faixas, 3, 100_000).devolverCentavos).toBe(0);
  });

  it("cancelamento depois da entrada não devolve", () => {
    expect(devolucaoAoCancelar(FAIXAS, -2, 50_000).devolverCentavos).toBe(0);
  });

  it("nunca devolve fração de centavo", () => {
    const faixas = [{ diasAntes: 0, percentualPontosBase: 3_333 }];
    for (const pago of [1, 7, 99, 16_291, 543_21]) {
      const r = devolucaoAoCancelar(faixas, 1, pago);
      expect(Number.isInteger(r.devolverCentavos)).toBe(true);
      expect(r.devolverCentavos).toBeLessThanOrEqual(pago);
    }
  });
});
