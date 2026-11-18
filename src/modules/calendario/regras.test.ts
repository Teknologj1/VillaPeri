import { describe, expect, it } from "vitest";

import { PADROES, type RegraEstadia, resolverRegras } from "./regras";

const PROPRIEDADE = "prop-1";
const TIPO = "tipo-1";
const UNIDADE = "unid-1";

function regra(parcial: Partial<RegraEstadia> & { id: string }): RegraEstadia {
  return {
    nome: parcial.id,
    propriedadeId: null,
    tipoId: null,
    unidadeId: null,
    vigenciaInicio: null,
    vigenciaFim: null,
    diasDaSemana: null,
    minimoDiarias: null,
    maximoDiarias: null,
    diasDeEntrada: null,
    antecedenciaMinimaHoras: null,
    janelaMaximaDias: null,
    intervaloLimpezaNoites: null,
    lacunaCurtaPermitida: null,
    prioridade: 0,
    ativa: true,
    ...parcial,
  };
}

const ctx = {
  noiteEntrada: "2026-12-11", // uma sexta
  propriedadeId: PROPRIEDADE,
  tipoId: TIPO,
};

describe("sem regras cadastradas", () => {
  it("usa padrões permissivos, para o sistema recém-instalado aceitar reservas", () => {
    const r = resolverRegras([], ctx);
    expect(r.minimoDiarias).toBe(PADROES.minimoDiarias);
    expect(r.maximoDiarias).toBeNull();
    expect(r.diasDeEntrada).toBeNull();
    expect(r.intervaloLimpezaNoites).toBe(0);
    expect(r.procedencia.minimoDiarias).toBe("padrão");
  });
});

describe("especificidade do escopo", () => {
  it("regra de tipo vence regra de propriedade", () => {
    const r = resolverRegras(
      [
        regra({ id: "casa", propriedadeId: PROPRIEDADE, minimoDiarias: 2 }),
        regra({ id: "chale", tipoId: TIPO, minimoDiarias: 3 }),
      ],
      ctx,
    );
    expect(r.minimoDiarias).toBe(3);
  });

  it("regra de unidade vence regra de tipo", () => {
    const r = resolverRegras(
      [
        regra({ id: "chale", tipoId: TIPO, minimoDiarias: 3 }),
        regra({ id: "chale-2", unidadeId: UNIDADE, minimoDiarias: 1 }),
      ],
      { ...ctx, unidadeId: UNIDADE },
    );
    expect(r.minimoDiarias).toBe(1);
  });

  it("ignora regra de outra unidade", () => {
    const r = resolverRegras(
      [regra({ id: "outra", unidadeId: "unid-99", minimoDiarias: 7 })],
      { ...ctx, unidadeId: UNIDADE },
    );
    expect(r.minimoDiarias).toBe(1);
  });
});

describe("resolução por campo", () => {
  it("regra específica sobrepõe só o campo que define", () => {
    // É o comportamento central. O proprietário cadastra "no réveillon o
    // mínimo é 5" sem repetir janela e antecedência; com resolução por regra
    // inteira, a regra geral sumiria silenciosamente naquele período.
    const r = resolverRegras(
      [
        regra({
          id: "geral",
          propriedadeId: PROPRIEDADE,
          minimoDiarias: 2,
          janelaMaximaDias: 180,
          antecedenciaMinimaHoras: 4,
          intervaloLimpezaNoites: 1,
        }),
        regra({
          id: "reveillon",
          propriedadeId: PROPRIEDADE,
          vigenciaInicio: "2026-12-28",
          vigenciaFim: "2027-01-02",
          minimoDiarias: 5,
          prioridade: 10,
        }),
      ],
      { ...ctx, noiteEntrada: "2026-12-30" },
    );

    expect(r.minimoDiarias).toBe(5);
    // Estes vêm da regra geral, que continua valendo.
    expect(r.janelaMaximaDias).toBe(180);
    expect(r.antecedenciaMinimaHoras).toBe(4);
    expect(r.intervaloLimpezaNoites).toBe(1);
  });

  it("diz de qual regra veio cada valor", () => {
    const r = resolverRegras(
      [
        regra({ id: "geral", propriedadeId: PROPRIEDADE, minimoDiarias: 2, janelaMaximaDias: 180 }),
        regra({
          id: "reveillon",
          nome: "Réveillon",
          propriedadeId: PROPRIEDADE,
          vigenciaInicio: "2026-12-28",
          vigenciaFim: "2027-01-02",
          minimoDiarias: 5,
          prioridade: 10,
        }),
      ],
      { ...ctx, noiteEntrada: "2026-12-30" },
    );

    expect(r.procedencia.minimoDiarias).toEqual({
      regraId: "reveillon",
      regraNome: "Réveillon",
    });
    expect(r.procedencia.janelaMaximaDias).toEqual({
      regraId: "geral",
      regraNome: "geral",
    });
  });
});

describe("vigência", () => {
  const reveillon = regra({
    id: "reveillon",
    propriedadeId: PROPRIEDADE,
    vigenciaInicio: "2026-12-28",
    vigenciaFim: "2027-01-02",
    minimoDiarias: 5,
  });

  it("aplica dentro do período", () => {
    expect(
      resolverRegras([reveillon], { ...ctx, noiteEntrada: "2026-12-30" }).minimoDiarias,
    ).toBe(5);
  });

  it("não aplica antes nem depois", () => {
    expect(
      resolverRegras([reveillon], { ...ctx, noiteEntrada: "2026-12-27" }).minimoDiarias,
    ).toBe(1);
    expect(
      resolverRegras([reveillon], { ...ctx, noiteEntrada: "2027-01-03" }).minimoDiarias,
    ).toBe(1);
  });

  it("inclui os extremos", () => {
    expect(
      resolverRegras([reveillon], { ...ctx, noiteEntrada: "2026-12-28" }).minimoDiarias,
    ).toBe(5);
    expect(
      resolverRegras([reveillon], { ...ctx, noiteEntrada: "2027-01-02" }).minimoDiarias,
    ).toBe(5);
  });

  it("vigência aberta de um lado vale indefinidamente para esse lado", () => {
    const aberta = regra({
      id: "alta",
      propriedadeId: PROPRIEDADE,
      vigenciaInicio: "2026-12-01",
      minimoDiarias: 3,
    });
    expect(
      resolverRegras([aberta], { ...ctx, noiteEntrada: "2030-06-01" }).minimoDiarias,
    ).toBe(3);
    expect(
      resolverRegras([aberta], { ...ctx, noiteEntrada: "2026-11-30" }).minimoDiarias,
    ).toBe(1);
  });
});

describe("dias da semana", () => {
  it("regra de fim de semana vale pela noite de entrada", () => {
    const fds = regra({
      id: "fds",
      propriedadeId: PROPRIEDADE,
      diasDaSemana: [5, 6],
      minimoDiarias: 2,
    });
    // 2026-12-11 é sexta; 2026-12-09 é quarta.
    expect(resolverRegras([fds], { ...ctx, noiteEntrada: "2026-12-11" }).minimoDiarias).toBe(2);
    expect(resolverRegras([fds], { ...ctx, noiteEntrada: "2026-12-09" }).minimoDiarias).toBe(1);
  });
});

describe("desempate", () => {
  it("prioridade maior vence no mesmo escopo", () => {
    const r = resolverRegras(
      [
        regra({ id: "a", propriedadeId: PROPRIEDADE, minimoDiarias: 2, prioridade: 1 }),
        regra({ id: "b", propriedadeId: PROPRIEDADE, minimoDiarias: 4, prioridade: 9 }),
      ],
      ctx,
    );
    expect(r.minimoDiarias).toBe(4);
  });

  it("com mesma prioridade, vence a vigência que começou mais tarde", () => {
    const r = resolverRegras(
      [
        regra({ id: "antiga", propriedadeId: PROPRIEDADE, vigenciaInicio: "2026-01-01", minimoDiarias: 2 }),
        regra({ id: "nova", propriedadeId: PROPRIEDADE, vigenciaInicio: "2026-11-01", minimoDiarias: 3 }),
      ],
      ctx,
    );
    expect(r.minimoDiarias).toBe(3);
  });

  it("escopo mais específico vence prioridade maior do escopo amplo", () => {
    const r = resolverRegras(
      [
        regra({ id: "casa", propriedadeId: PROPRIEDADE, minimoDiarias: 9, prioridade: 100 }),
        regra({ id: "chale", tipoId: TIPO, minimoDiarias: 2, prioridade: 0 }),
      ],
      ctx,
    );
    expect(r.minimoDiarias).toBe(2);
  });
});

describe("regra inativa", () => {
  it("é ignorada", () => {
    const r = resolverRegras(
      [regra({ id: "desligada", propriedadeId: PROPRIEDADE, minimoDiarias: 7, ativa: false })],
      ctx,
    );
    expect(r.minimoDiarias).toBe(1);
  });
});
