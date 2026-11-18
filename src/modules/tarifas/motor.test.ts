import { describe, expect, it } from "vitest";

import {
  type Catalogo,
  type PedidoDePreco,
  type RegraTarifa,
  SemTarifaError,
  orcar,
} from "./motor";

const PROP = "prop-1";
const TIPO = "tipo-1";
const UNID = "unid-1";

/** R$ 800 em dias de semana, R$ 1.000 em fins de semana. */
const SEMANA = 80_000;
const FDS = 100_000;

function regra(p: Partial<RegraTarifa> & { id: string; nivel: RegraTarifa["nivel"] }): RegraTarifa {
  return {
    nome: p.id,
    propriedadeId: PROP,
    tipoId: null,
    unidadeId: null,
    vigenciaInicio: null,
    vigenciaFim: null,
    precoSemanaCentavos: null,
    precoFimDeSemanaCentavos: null,
    precoFixoCentavos: null,
    ajustePontosBase: null,
    valorPessoaExtraCentavos: null,
    valorCriancaCentavos: null,
    aplicaNaVespera: false,
    prioridade: 0,
    ativa: true,
    ...p,
  };
}

const PADRAO = regra({
  id: "padrao",
  nome: "Diária padrão",
  nivel: "padrao",
  precoSemanaCentavos: SEMANA,
  precoFimDeSemanaCentavos: FDS,
});

function catalogo(ajustes: Partial<Catalogo> = {}): Catalogo {
  return {
    regras: [PADRAO],
    feriados: [],
    extras: [],
    descontosEstadiaLonga: [],
    ...ajustes,
  };
}

function pedido(ajustes: Partial<PedidoDePreco> = {}): PedidoDePreco {
  return {
    // 11/12 sexta, 12/12 sábado, 13/12 domingo.
    noites: ["2026-12-11", "2026-12-12", "2026-12-13"],
    adultos: 2,
    criancas: 0,
    tipo: { id: TIPO, modoPreco: "acomodacao", ocupacaoBase: 4 },
    propriedadeId: PROP,
    ...ajustes,
  };
}

describe("diária padrão", () => {
  it("cobra fim de semana nas sextas e sábados, semana no resto", () => {
    const o = orcar(pedido(), catalogo());
    expect(o.noites.map((n) => n.precoCentavos)).toEqual([FDS, FDS, SEMANA]);
    expect(o.subtotalNoitesCentavos).toBe(280_000);
    expect(o.totalCentavos).toBe(280_000);
  });

  it("diz qual regra gerou cada noite", () => {
    const o = orcar(pedido(), catalogo());
    expect(o.noites.every((n) => n.regraNome === "Diária padrão")).toBe(true);
    expect(o.noites.every((n) => n.nivel === "padrao")).toBe(true);
  });

  it("respeita a lista configurável de fim de semana", () => {
    // Alta temporada em que domingo também é fim de semana.
    const o = orcar(pedido(), catalogo({ diasFimDeSemana: [5, 6, 0] }));
    expect(o.noites.map((n) => n.precoCentavos)).toEqual([FDS, FDS, FDS]);
  });

  it("usa o preço de semana quando só ele está cadastrado", () => {
    const o = orcar(
      pedido(),
      catalogo({
        regras: [
          regra({ id: "p", nivel: "padrao", precoSemanaCentavos: SEMANA }),
        ],
      }),
    );
    expect(o.noites.map((n) => n.precoCentavos)).toEqual([SEMANA, SEMANA, SEMANA]);
  });

  it("recusa cotar quando não há diária cadastrada, em vez de cobrar zero", () => {
    // Devolver zero seria pior que falhar: o site mostraria "R$ 0,00" como
    // se fosse uma oferta.
    expect(() => orcar(pedido(), catalogo({ regras: [] }))).toThrow(SemTarifaError);
  });
});

describe("pilha de prioridade", () => {
  const temporada = regra({
    id: "alta",
    nome: "Alta temporada",
    nivel: "temporada",
    vigenciaInicio: "2026-12-01",
    vigenciaFim: "2027-01-31",
    precoSemanaCentavos: 120_000,
    precoFimDeSemanaCentavos: 150_000,
  });

  it("temporada vence a diária padrão", () => {
    const o = orcar(pedido(), catalogo({ regras: [PADRAO, temporada] }));
    expect(o.noites.map((n) => n.precoCentavos)).toEqual([150_000, 150_000, 120_000]);
    expect(o.noites[0]?.regraNome).toBe("Alta temporada");
  });

  it("temporada fora da vigência não se aplica", () => {
    const o = orcar(
      pedido({ noites: ["2026-11-19"] }),
      catalogo({ regras: [PADRAO, temporada] }),
    );
    expect(o.noites[0]?.regraNome).toBe("Diária padrão");
  });

  it("feriado com preço fixo vence a temporada", () => {
    const o = orcar(
      pedido({ noites: ["2026-12-25"] }),
      catalogo({
        regras: [
          PADRAO,
          temporada,
          regra({
            id: "fer",
            nome: "Feriado",
            nivel: "feriado",
            precoFixoCentavos: 200_000,
          }),
        ],
        feriados: [{ data: "2026-12-25", nome: "Natal", valeNaVespera: false }],
      }),
    );
    expect(o.noites[0]?.precoCentavos).toBe(200_000);
    expect(o.noites[0]?.nivel).toBe("feriado");
  });

  it("feriado com ajuste percentual incide sobre a base da temporada", () => {
    // 25/12/2026 é uma sexta: base de alta temporada = 150.000. +30% = 195.000.
    const o = orcar(
      pedido({ noites: ["2026-12-25"] }),
      catalogo({
        regras: [
          PADRAO,
          temporada,
          regra({ id: "fer", nivel: "feriado", ajustePontosBase: 3_000 }),
        ],
        feriados: [{ data: "2026-12-25", nome: "Natal", valeNaVespera: false }],
      }),
    );
    expect(o.noites[0]?.precoCentavos).toBe(195_000);
  });

  it("regra de feriado não se aplica a noite que não é feriado", () => {
    const o = orcar(
      pedido({ noites: ["2026-12-11"] }),
      catalogo({
        regras: [
          PADRAO,
          regra({ id: "fer", nivel: "feriado", precoFixoCentavos: 999_999 }),
        ],
        feriados: [],
      }),
    );
    expect(o.noites[0]?.precoCentavos).toBe(FDS);
  });

  it("véspera de feriado cobra como feriado quando configurado", () => {
    const o = orcar(
      pedido({ noites: ["2026-12-24"] }),
      catalogo({
        regras: [
          PADRAO,
          regra({ id: "fer", nivel: "feriado", precoFixoCentavos: 200_000 }),
        ],
        feriados: [{ data: "2026-12-25", nome: "Natal", valeNaVespera: true }],
      }),
    );
    expect(o.noites[0]?.precoCentavos).toBe(200_000);
    expect(o.noites[0]?.feriado).toBe("Véspera de Natal");
  });

  it("data especial vence tudo, inclusive feriado", () => {
    const o = orcar(
      pedido({ noites: ["2026-12-31"] }),
      catalogo({
        regras: [
          PADRAO,
          temporada,
          regra({ id: "fer", nivel: "feriado", precoFixoCentavos: 200_000 }),
          regra({
            id: "rev",
            nome: "Réveillon",
            nivel: "especial",
            vigenciaInicio: "2026-12-28",
            vigenciaFim: "2027-01-02",
            precoFixoCentavos: 350_000,
          }),
        ],
        feriados: [{ data: "2026-12-31", nome: "Véspera de Ano-Novo", valeNaVespera: false }],
      }),
    );
    expect(o.noites[0]?.precoCentavos).toBe(350_000);
    expect(o.noites[0]?.regraNome).toBe("Réveillon");
  });
});

describe("especificidade do escopo", () => {
  it("regra de tipo vence regra de propriedade no mesmo nível", () => {
    const o = orcar(
      pedido({ noites: ["2026-12-11"] }),
      catalogo({
        regras: [
          PADRAO,
          regra({
            id: "tipo",
            nivel: "padrao",
            propriedadeId: null,
            tipoId: TIPO,
            precoSemanaCentavos: 60_000,
            precoFimDeSemanaCentavos: 70_000,
          }),
        ],
      }),
    );
    expect(o.noites[0]?.precoCentavos).toBe(70_000);
  });

  it("regra de unidade vence regra de tipo", () => {
    const o = orcar(
      pedido({ noites: ["2026-12-11"], unidadeId: UNID }),
      catalogo({
        regras: [
          PADRAO,
          regra({
            id: "tipo",
            nivel: "padrao",
            propriedadeId: null,
            tipoId: TIPO,
            precoFimDeSemanaCentavos: 70_000,
            precoSemanaCentavos: 60_000,
          }),
          regra({
            id: "unid",
            nivel: "padrao",
            propriedadeId: null,
            unidadeId: UNID,
            precoFimDeSemanaCentavos: 50_000,
            precoSemanaCentavos: 40_000,
          }),
        ],
      }),
    );
    expect(o.noites[0]?.precoCentavos).toBe(50_000);
  });

  it("ignora regra inativa", () => {
    const o = orcar(
      pedido({ noites: ["2026-12-11"] }),
      catalogo({
        regras: [
          PADRAO,
          regra({
            id: "off",
            nivel: "especial",
            precoFixoCentavos: 1,
            ativa: false,
          }),
        ],
      }),
    );
    expect(o.noites[0]?.precoCentavos).toBe(FDS);
  });
});

describe("preço por ocupação", () => {
  const comOcupacao = catalogo({
    regras: [
      regra({
        id: "padrao",
        nivel: "padrao",
        precoSemanaCentavos: SEMANA,
        precoFimDeSemanaCentavos: FDS,
        valorPessoaExtraCentavos: 10_000,
        valorCriancaCentavos: 5_000,
      }),
    ],
  });

  const tipoOcupacao = { id: TIPO, modoPreco: "ocupacao" as const, ocupacaoBase: 4 };

  it("não cobra adicional dentro da ocupação base", () => {
    const o = orcar(pedido({ adultos: 4, tipo: tipoOcupacao }), comOcupacao);
    expect(o.adicionalOcupacaoCentavos).toBe(0);
  });

  it("cobra por adulto além da base, por noite", () => {
    // 7 adultos = 3 extras; 3 noites; R$ 100 por pessoa-noite.
    const o = orcar(pedido({ adultos: 7, tipo: tipoOcupacao }), comOcupacao);
    expect(o.adicionalOcupacaoCentavos).toBe(3 * 3 * 10_000);
  });

  it("cobra criança pelo valor de criança", () => {
    const o = orcar(
      pedido({ adultos: 4, criancas: 2, tipo: tipoOcupacao }),
      comOcupacao,
    );
    expect(o.adicionalOcupacaoCentavos).toBe(2 * 3 * 5_000);
  });

  it("no modo por acomodação, número de pessoas não muda o preço", () => {
    const dois = orcar(pedido({ adultos: 2 }), comOcupacao);
    const onze = orcar(pedido({ adultos: 11 }), comOcupacao);
    expect(dois.totalCentavos).toBe(onze.totalCentavos);
  });

  it("o adicional entra no total", () => {
    const o = orcar(pedido({ adultos: 7, tipo: tipoOcupacao }), comOcupacao);
    expect(o.totalCentavos).toBe(280_000 + 90_000);
  });
});

describe("descontos", () => {
  it("aplica o desconto de estadia longa sobre noites mais ocupação", () => {
    const o = orcar(
      pedido(),
      catalogo({ descontosEstadiaLonga: [{ noitesMinimas: 3, percentualPontosBase: 1_000 }] }),
    );
    expect(o.descontoEstadiaLongaCentavos).toBe(28_000); // 10% de 280.000
    expect(o.totalCentavos).toBe(252_000);
  });

  it("não aplica abaixo do mínimo de noites", () => {
    const o = orcar(
      pedido(),
      catalogo({ descontosEstadiaLonga: [{ noitesMinimas: 7, percentualPontosBase: 1_500 }] }),
    );
    expect(o.descontoEstadiaLongaCentavos).toBe(0);
  });

  it("entre faixas alcançadas, vale a mais vantajosa", () => {
    const o = orcar(
      pedido(),
      catalogo({
        descontosEstadiaLonga: [
          { noitesMinimas: 2, percentualPontosBase: 500 },
          { noitesMinimas: 3, percentualPontosBase: 1_200 },
        ],
      }),
    );
    expect(o.descontoEstadiaLongaCentavos).toBe(33_600); // 12%
  });

  it("cupom percentual incide depois do desconto de estadia longa", () => {
    const o = orcar(
      pedido({ cupom: { codigo: "X", tipo: "percentual", valor: 1_000 } }),
      catalogo({ descontosEstadiaLonga: [{ noitesMinimas: 3, percentualPontosBase: 1_000 }] }),
    );
    // 280.000 − 10% = 252.000; depois −10% = 25.200.
    expect(o.descontoCupomCentavos).toBe(25_200);
    expect(o.totalCentavos).toBe(226_800);
  });

  it("cupom de valor fixo nunca desconta mais que o próprio subtotal", () => {
    const o = orcar(
      pedido({ cupom: { codigo: "X", tipo: "valor", valor: 999_999_999 } }),
      catalogo(),
    );
    expect(o.descontoCupomCentavos).toBe(280_000);
    expect(o.totalCentavos).toBe(0);
  });

  it("desconto manual da recepção entra depois do cupom", () => {
    const o = orcar(pedido({ descontoManualPontosBase: 500 }), catalogo());
    expect(o.descontoManualCentavos).toBe(14_000); // 5% de 280.000
    expect(o.totalCentavos).toBe(266_000);
  });
});

describe("extras e taxas", () => {
  const extras = [
    { id: "limpeza", nome: "Taxa de limpeza", valorCentavos: 15_000, cobranca: "estadia" as const, obrigatorio: true },
    { id: "cafe", nome: "Café da manhã", valorCentavos: 4_000, cobranca: "pessoa_noite" as const, obrigatorio: false },
    { id: "pet", nome: "Pet", valorCentavos: 5_000, cobranca: "estadia" as const, obrigatorio: false },
    { id: "lenha", nome: "Lenha", valorCentavos: 3_000, cobranca: "noite" as const, obrigatorio: false },
  ];

  it("cobra o obrigatório sem o hóspede escolher", () => {
    const o = orcar(pedido(), catalogo({ extras }));
    expect(o.extras).toEqual([{ nome: "Taxa de limpeza", valorCentavos: 15_000 }]);
    expect(o.totalCentavos).toBe(295_000);
  });

  it("cobra por pessoa e por noite quando é o caso", () => {
    // Café: 2 pessoas × 3 noites × R$ 40.
    const o = orcar(
      pedido({ extrasEscolhidos: ["cafe"] }),
      catalogo({ extras }),
    );
    expect(o.extras).toContainEqual({ nome: "Café da manhã", valorCentavos: 24_000 });
  });

  it("cobra por noite", () => {
    const o = orcar(pedido({ extrasEscolhidos: ["lenha"] }), catalogo({ extras }));
    expect(o.extras).toContainEqual({ nome: "Lenha", valorCentavos: 9_000 });
  });

  it("extras entram DEPOIS dos descontos, não antes", () => {
    // É a ordem da especificação: um cupom de 10% não desconta a taxa de
    // limpeza. Com a ordem invertida o total daria 265.500.
    const o = orcar(
      pedido({ cupom: { codigo: "X", tipo: "percentual", valor: 1_000 } }),
      catalogo({ extras }),
    );
    expect(o.totalCentavos).toBe(280_000 - 28_000 + 15_000);
  });
});

describe("sinal e saldo", () => {
  it("calcula sinal como percentual do total e saldo como o resto", () => {
    const o = orcar(pedido({ sinalPontosBase: 3_000 }), catalogo());
    expect(o.sinalCentavos).toBe(84_000); // 30% de 280.000
    expect(o.saldoCentavos).toBe(196_000);
    expect(o.sinalCentavos + o.saldoCentavos).toBe(o.totalCentavos);
  });

  it("sem sinal configurado, o saldo é o total", () => {
    const o = orcar(pedido(), catalogo());
    expect(o.sinalCentavos).toBe(0);
    expect(o.saldoCentavos).toBe(o.totalCentavos);
  });
});

describe("dinheiro", () => {
  it("nenhum valor do orçamento sai fracionado", () => {
    // Percentuais quebrados em todas as etapas ao mesmo tempo.
    const o = orcar(
      pedido({
        noites: ["2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14", "2026-12-15"],
        adultos: 7,
        criancas: 1,
        tipo: { id: TIPO, modoPreco: "ocupacao", ocupacaoBase: 4 },
        cupom: { codigo: "X", tipo: "percentual", valor: 733 },
        descontoManualPontosBase: 317,
        sinalPontosBase: 3_333,
      }),
      catalogo({
        regras: [
          regra({
            id: "p",
            nivel: "padrao",
            precoSemanaCentavos: 79_997,
            precoFimDeSemanaCentavos: 100_003,
            valorPessoaExtraCentavos: 9_999,
            valorCriancaCentavos: 4_999,
          }),
          regra({ id: "f", nivel: "feriado", ajustePontosBase: 1_733 }),
        ],
        feriados: [{ data: "2026-12-14", nome: "Teste", valeNaVespera: true }],
        descontosEstadiaLonga: [{ noitesMinimas: 5, percentualPontosBase: 1_234 }],
        extras: [
          { id: "t", nome: "Taxa", valorCentavos: 7_777, cobranca: "pessoa_noite", obrigatorio: true },
        ],
      }),
    );

    const inteiros = [
      o.subtotalNoitesCentavos,
      o.adicionalOcupacaoCentavos,
      o.descontoEstadiaLongaCentavos,
      o.descontoCupomCentavos,
      o.descontoManualCentavos,
      o.extrasCentavos,
      o.totalCentavos,
      o.sinalCentavos,
      o.saldoCentavos,
      ...o.noites.map((n) => n.precoCentavos),
    ];
    for (const v of inteiros) expect(Number.isInteger(v)).toBe(true);
  });

  it("sinal mais saldo sempre fecha o total", () => {
    for (const pontos of [1_000, 2_500, 3_333, 5_000, 10_000]) {
      const o = orcar(pedido({ sinalPontosBase: pontos }), catalogo());
      expect(o.sinalCentavos + o.saldoCentavos).toBe(o.totalCentavos);
    }
  });
});
