import { describe, expect, it } from "vitest";

import {
  comoNoite,
  diaDaSemana,
  diferencaEmDias,
  ehNoiteDeFimDeSemana,
  formatarInstante,
  formatarNoite,
  formatarNoiteCurta,
  formatarPeriodo,
  hojeNaPropriedade,
  horasAteCheckin,
  instanteNaPropriedade,
  noitesDaEstadia,
  somarDias,
} from "./data";

const SP = "America/Sao_Paulo";

describe("hojeNaPropriedade", () => {
  it("usa o dia do fuso da propriedade, não o do servidor em UTC", () => {
    // 19/11 à 01h UTC é ainda 18/11, às 22h, em Pirenópolis (UTC−3).
    // Este é o bug que faria a lista "Hoje na casa" mostrar as chegadas de
    // amanhã durante toda a noite.
    const agora = new Date("2026-11-19T01:00:00Z");
    expect(hojeNaPropriedade(SP, agora)).toBe("2026-11-18");
  });

  it("vira o dia na hora certa do fuso local", () => {
    // 03h UTC = meia-noite em ponto em São Paulo.
    expect(hojeNaPropriedade(SP, new Date("2026-11-19T02:59:59Z"))).toBe("2026-11-18");
    expect(hojeNaPropriedade(SP, new Date("2026-11-19T03:00:00Z"))).toBe("2026-11-19");
  });

  it("atravessa a virada do ano corretamente", () => {
    expect(hojeNaPropriedade(SP, new Date("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
  });

  it("recusa um fuso inexistente em vez de cair no do servidor", () => {
    expect(() => hojeNaPropriedade("Nao/Existe")).toThrow();
  });
});

describe("noitesDaEstadia", () => {
  it("é aberto à direita: a noite do check-out fica livre", () => {
    // Entrada 10, saída 13 = três noites. O dia 13 não entra.
    expect(noitesDaEstadia("2026-12-10", "2026-12-13")).toEqual([
      "2026-12-10",
      "2026-12-11",
      "2026-12-12",
    ]);
  });

  it("uma noite é o mínimo", () => {
    expect(noitesDaEstadia("2026-12-10", "2026-12-11")).toEqual(["2026-12-10"]);
  });

  it("recusa saída igual ou anterior à entrada", () => {
    expect(() => noitesDaEstadia("2026-12-10", "2026-12-10")).toThrow();
    expect(() => noitesDaEstadia("2026-12-10", "2026-12-09")).toThrow();
  });

  it("atravessa virada de mês e de ano", () => {
    expect(noitesDaEstadia("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ]);
  });

  it("conta certo no réveillon, o período mais caro do ano", () => {
    expect(noitesDaEstadia("2026-12-28", "2027-01-04")).toHaveLength(7);
  });
});

describe("somarDias e diferencaEmDias", () => {
  it("soma e subtrai atravessando meses", () => {
    expect(somarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(somarDias("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("acerta fevereiro em ano bissexto", () => {
    // 2028 é bissexto; 2027 não é.
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDias("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("não perde nem ganha dia em mudança de horário de verão", () => {
    // A aritmética roda em UTC justamente para isto. Em outubro de 2026, um
    // fuso com horário de verão teria um dia de 23 horas.
    expect(diferencaEmDias("2026-10-01", "2026-11-01")).toBe(31);
    expect(somarDias("2026-10-17", 1)).toBe("2026-10-18");
  });

  it("devolve diferença negativa quando a ordem se inverte", () => {
    expect(diferencaEmDias("2026-12-13", "2026-12-10")).toBe(-3);
  });
});

describe("diaDaSemana e fim de semana", () => {
  it("identifica o dia da semana", () => {
    expect(diaDaSemana("2026-11-18")).toBe(3); // quarta
    expect(diaDaSemana("2026-11-20")).toBe(5); // sexta
    expect(diaDaSemana("2026-11-21")).toBe(6); // sábado
    expect(diaDaSemana("2026-11-22")).toBe(0); // domingo
  });

  it("usa sexta e sábado como padrão", () => {
    expect(ehNoiteDeFimDeSemana("2026-11-20")).toBe(true); // sexta
    expect(ehNoiteDeFimDeSemana("2026-11-21")).toBe(true); // sábado
    expect(ehNoiteDeFimDeSemana("2026-11-22")).toBe(false); // domingo
    expect(ehNoiteDeFimDeSemana("2026-11-19")).toBe(false); // quinta
  });

  it("respeita uma lista configurada pelo proprietário", () => {
    // Alta temporada em que domingo também conta como fim de semana.
    const config = [5, 6, 0];
    expect(ehNoiteDeFimDeSemana("2026-11-22", config)).toBe(true);
    expect(ehNoiteDeFimDeSemana("2026-11-19", config)).toBe(false);
  });
});

describe("instanteNaPropriedade e horasAteCheckin", () => {
  it("resolve a hora local para o instante certo em UTC−3", () => {
    // Check-in das 14h de 11/12/2026 em Pirenópolis = 17h UTC.
    expect(instanteNaPropriedade("2026-12-11", "14:00", SP).toISOString()).toBe(
      "2026-12-11T17:00:00.000Z",
    );
  });

  it("acerta meia-noite, que é o caso que mais quebra", () => {
    expect(instanteNaPropriedade("2026-12-11", "00:00", SP).toISOString()).toBe(
      "2026-12-11T03:00:00.000Z",
    );
  });

  it("acerta num fuso com horário de verão, dos dois lados da virada", () => {
    // Nova York: UTC−5 no inverno, UTC−4 no verão. O mesmo "12:00" local
    // cai em instantes diferentes, e é por isso que o cálculo tem duas passadas.
    const NY = "America/New_York";
    expect(instanteNaPropriedade("2026-01-15", "12:00", NY).toISOString()).toBe(
      "2026-01-15T17:00:00.000Z",
    );
    expect(instanteNaPropriedade("2026-07-15", "12:00", NY).toISOString()).toBe(
      "2026-07-15T16:00:00.000Z",
    );
  });

  it("conta as horas que faltam para o check-in", () => {
    const agora = new Date("2026-12-11T07:00:00Z"); // 04h em Pirenópolis
    expect(horasAteCheckin("2026-12-11", "14:00", SP, agora)).toBe(10);
  });

  it("devolve negativo quando o check-in já passou", () => {
    const agora = new Date("2026-12-11T20:00:00Z"); // 17h local
    expect(horasAteCheckin("2026-12-11", "14:00", SP, agora)).toBe(-3);
  });
});

describe("comoNoite", () => {
  it("aceita o formato correto", () => {
    expect(comoNoite("2026-12-25")).toBe("2026-12-25");
  });

  it("recusa formatos que silenciosamente viram outra data", () => {
    expect(() => comoNoite("25/12/2026")).toThrow();
    expect(() => comoNoite("2026-12-25T10:00:00Z")).toThrow();
    expect(() => comoNoite("2026-13-01")).toThrow();
    expect(() => comoNoite("")).toThrow();
  });
});

// ---------------------------------------------------------------------------

describe("como a data aparece na tela", () => {
  it("formata a noite sem passar por Date, para não perder o dia", () => {
    // 2026-12-11 formatado no fuso do servidor (UTC-3 ou qualquer um a oeste)
    // viraria 10/12. A noite é uma string sem fuso: só se recorta.
    expect(formatarNoite("2026-12-11")).toBe("11/12/2026");
    expect(formatarNoite("2026-01-01")).toBe("01/01/2026");
    expect(formatarNoite("2026-12-11", false)).toBe("11/12");
  });

  it("acerta o dia da semana — 0 é domingo", () => {
    // 11/12/2026 é uma sexta-feira.
    expect(formatarNoiteCurta("2026-12-11")).toBe("sex, 11 dez");
    // 13/12/2026 é domingo: o índice 0 da lista.
    expect(formatarNoiteCurta("2026-12-13")).toBe("dom, 13 dez");
    expect(formatarNoiteCurta("2026-12-12")).toBe("sáb, 12 dez");
  });

  it("conta as noites do período, com o plural certo", () => {
    expect(formatarPeriodo("2026-12-11", "2026-12-14")).toBe(
      "11/12/2026 a 14/12/2026 · 3 noites",
    );
    expect(formatarPeriodo("2026-12-11", "2026-12-12")).toBe(
      "11/12/2026 a 12/12/2026 · 1 noite",
    );
  });

  it("formata o instante no fuso da propriedade, não no do servidor", () => {
    // 23h de Brasília é 02h do dia seguinte em UTC. Quem formatar em UTC
    // mostra a data errada no registro de auditoria.
    const instante = new Date("2026-12-12T02:30:00Z");
    expect(formatarInstante(instante, "America/Sao_Paulo")).toBe(
      "11/12/2026, 23:30",
    );
  });
});
