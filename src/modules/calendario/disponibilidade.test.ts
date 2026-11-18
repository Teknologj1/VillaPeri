import { describe, expect, it } from "vitest";

import {
  type EntradaConsulta,
  type MotivoIndisponivel,
  consultarDisponibilidade,
} from "./disponibilidade";
import type { RegraEstadia } from "./regras";

const PROP = "prop-1";
const CHALE = "tipo-chale";
const SUITE = "tipo-suite";

function regra(p: Partial<RegraEstadia> & { id: string }): RegraEstadia {
  return {
    nome: p.id,
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
    ...p,
  };
}

function consulta(ajustes: Partial<EntradaConsulta> = {}) {
  const base: EntradaConsulta = {
    // 11/12/2026 é uma sexta-feira.
    pedido: { entrada: "2026-12-11", saida: "2026-12-14", adultos: 2, criancas: 0 },
    propriedadeId: PROP,
    tipos: [
      { id: CHALE, nome: "Chalé", capacidade: 4 },
      { id: SUITE, nome: "Suíte", capacidade: 2 },
    ],
    unidades: [
      { id: "chale-1", tipoId: CHALE, ativa: true },
      { id: "chale-2", tipoId: CHALE, ativa: true },
      { id: "suite-1", tipoId: SUITE, ativa: true },
    ],
    ocupadas: [],
    regras: [],
    hoje: "2026-11-18",
    horasAteCheckin: 24 * 23,
    ...ajustes,
  };
  return consultarDisponibilidade(base);
}

function ofertaDe(r: ReturnType<typeof consulta>, tipoId: string) {
  const o = r.ofertas.find((x) => x.tipoId === tipoId);
  if (!o) throw new Error(`Tipo ${tipoId} não veio na resposta`);
  return o;
}

function codigos(motivos: MotivoIndisponivel[]) {
  return motivos.map((m) => m.codigo);
}

describe("caso simples", () => {
  it("devolve as noites da estadia, aberto à direita", () => {
    const r = consulta();
    expect(r.noites).toEqual(["2026-12-11", "2026-12-12", "2026-12-13"]);
  });

  it("oferece todas as unidades livres do tipo", () => {
    const o = ofertaDe(consulta(), CHALE);
    expect(o.disponivel).toBe(true);
    expect(o.unidadesLivres).toEqual(["chale-1", "chale-2"]);
    expect(o.motivos).toEqual([]);
  });

  it("consulta um tipo só quando pedido", () => {
    const r = consulta({
      pedido: {
        entrada: "2026-12-11",
        saida: "2026-12-14",
        adultos: 2,
        criancas: 0,
        tipoId: SUITE,
      },
    });
    expect(r.ofertas).toHaveLength(1);
    expect(r.ofertas[0]?.tipoId).toBe(SUITE);
  });
});

describe("noites ocupadas", () => {
  it("exclui a unidade ocupada e mantém a livre", () => {
    const o = ofertaDe(
      consulta({ ocupadas: [{ unidadeId: "chale-1", noite: "2026-12-12" }] }),
      CHALE,
    );
    expect(o.disponivel).toBe(true);
    expect(o.unidadesLivres).toEqual(["chale-2"]);
  });

  it("sem oferta quando todas as unidades estão tomadas, dizendo quais noites", () => {
    const o = ofertaDe(
      consulta({
        ocupadas: [
          { unidadeId: "chale-1", noite: "2026-12-12" },
          { unidadeId: "chale-2", noite: "2026-12-12" },
        ],
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(false);
    expect(o.motivos).toEqual([
      { codigo: "NOITE_OCUPADA", noites: ["2026-12-12"] },
    ]);
  });

  it("a noite do check-out fica livre para a próxima entrada", () => {
    // Estadia anterior de 8 a 11 ocupa as noites 8, 9 e 10. A noite 11 — dia
    // da saída — tem de estar livre, senão saída de manhã e entrada à tarde
    // no mesmo dia acusariam conflito.
    const o = ofertaDe(
      consulta({
        ocupadas: [
          { unidadeId: "chale-1", noite: "2026-12-08" },
          { unidadeId: "chale-1", noite: "2026-12-09" },
          { unidadeId: "chale-1", noite: "2026-12-10" },
        ],
      }),
      CHALE,
    );
    expect(o.unidadesLivres).toContain("chale-1");
  });
});

describe("mínimo de diárias", () => {
  const minimo3 = regra({ id: "min3", nome: "Feriado prolongado", propriedadeId: PROP, minimoDiarias: 3 });

  it("recusa estadia menor que o mínimo, dizendo o número e a regra", () => {
    const o = ofertaDe(
      consulta({
        pedido: { entrada: "2026-12-11", saida: "2026-12-13", adultos: 2, criancas: 0 },
        regras: [minimo3],
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(false);
    expect(o.motivos).toContainEqual({
      codigo: "MINIMO_DIARIAS",
      minimo: 3,
      solicitado: 2,
      regra: "Feriado prolongado",
    });
  });

  it("aceita quando atinge o mínimo", () => {
    const o = ofertaDe(
      consulta({
        pedido: { entrada: "2026-12-11", saida: "2026-12-14", adultos: 2, criancas: 0 },
        regras: [minimo3],
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(true);
  });

  it("vale a regra da noite de ENTRADA, não a das noites seguintes", () => {
    // Mínimo 3 só para quem entra na sexta. Entrando na quarta, vale 1.
    const soSexta = regra({
      id: "sexta",
      propriedadeId: PROP,
      diasDaSemana: [5],
      minimoDiarias: 3,
    });
    const quarta = ofertaDe(
      consulta({
        pedido: { entrada: "2026-12-09", saida: "2026-12-10", adultos: 2, criancas: 0 },
        regras: [soSexta],
      }),
      CHALE,
    );
    expect(quarta.disponivel).toBe(true);
  });
});

describe("lacuna curta", () => {
  const regras = [
    regra({ id: "min3", propriedadeId: PROP, minimoDiarias: 3, lacunaCurtaPermitida: true }),
  ];

  it("permite o vão menor que o mínimo quando ele fecha o buraco exato", () => {
    // chale-1 ocupado até a noite 10 e de novo a partir da noite 12.
    // Sobram as noites 11 — duas noites? Não: sobra a noite 11 apenas.
    // Pedido 11 -> 12 (uma noite), com mínimo 3.
    const o = ofertaDe(
      consulta({
        pedido: { entrada: "2026-12-11", saida: "2026-12-12", adultos: 2, criancas: 0 },
        regras,
        ocupadas: [
          { unidadeId: "chale-1", noite: "2026-12-10" },
          { unidadeId: "chale-1", noite: "2026-12-12" },
          // chale-2 não tem buraco: segue barrado pelo mínimo.
          { unidadeId: "chale-2", noite: "2026-12-20" },
        ],
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(true);
    expect(o.unidadesLivres).toEqual(["chale-1"]);
  });

  it("não vale quando o vão não é exato dos dois lados", () => {
    const o = ofertaDe(
      consulta({
        pedido: { entrada: "2026-12-11", saida: "2026-12-12", adultos: 2, criancas: 0 },
        regras,
        // Só o lado de antes está ocupado: o buraco continua aberto adiante,
        // então a noite solta não é uma lacuna, é uma reserva curta.
        ocupadas: [{ unidadeId: "chale-1", noite: "2026-12-10" }],
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(false);
    expect(codigos(o.motivos)).toContain("MINIMO_DIARIAS");
  });

  it("fica desligada por padrão", () => {
    const o = ofertaDe(
      consulta({
        pedido: { entrada: "2026-12-11", saida: "2026-12-12", adultos: 2, criancas: 0 },
        regras: [regra({ id: "min3", propriedadeId: PROP, minimoDiarias: 3 })],
        ocupadas: [
          { unidadeId: "chale-1", noite: "2026-12-10" },
          { unidadeId: "chale-1", noite: "2026-12-12" },
        ],
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(false);
  });
});

describe("intervalo de limpeza", () => {
  const comIntervalo = [
    regra({ id: "limpeza", propriedadeId: PROP, intervaloLimpezaNoites: 1 }),
  ];

  it("barra quando a folga depois da saída já está ocupada", () => {
    // A nova reserva passaria a ocupar também a noite 14 como folga, e ela já
    // é de outra reserva. Sem esta checagem, a consulta diria "disponível" e
    // a gravação falharia depois, na chave única.
    const o = ofertaDe(
      consulta({
        regras: comIntervalo,
        ocupadas: [
          { unidadeId: "chale-1", noite: "2026-12-14" },
          { unidadeId: "chale-2", noite: "2026-12-14" },
        ],
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(false);
    expect(codigos(o.motivos)).toContain("INTERVALO_LIMPEZA");
  });

  it("não interfere quando a folga está livre", () => {
    const o = ofertaDe(consulta({ regras: comIntervalo }), CHALE);
    expect(o.disponivel).toBe(true);
  });

  it("intervalo zero deixa saída e entrada no mesmo dia", () => {
    const o = ofertaDe(
      consulta({
        regras: [regra({ id: "sem", propriedadeId: PROP, intervaloLimpezaNoites: 0 })],
        ocupadas: [{ unidadeId: "chale-1", noite: "2026-12-14" }],
      }),
      CHALE,
    );
    expect(o.unidadesLivres).toContain("chale-1");
  });
});

describe("dias de entrada", () => {
  it("recusa entrada em dia não permitido e diz quais valem", () => {
    const o = ofertaDe(
      consulta({
        // Só sexta e sábado em alta temporada. 09/12/2026 é quarta.
        pedido: { entrada: "2026-12-09", saida: "2026-12-12", adultos: 2, criancas: 0 },
        regras: [regra({ id: "alta", propriedadeId: PROP, diasDeEntrada: [5, 6] })],
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(false);
    expect(o.motivos).toContainEqual({
      codigo: "DIA_ENTRADA_NAO_PERMITIDO",
      diasPermitidos: [5, 6],
      diaSolicitado: 3,
    });
  });

  it("aceita no dia permitido", () => {
    const o = ofertaDe(
      consulta({ regras: [regra({ id: "alta", propriedadeId: PROP, diasDeEntrada: [5, 6] })] }),
      CHALE,
    );
    expect(o.disponivel).toBe(true);
  });
});

describe("antecedência e janela", () => {
  it("recusa reserva feita tarde demais para a entrada", () => {
    const o = ofertaDe(
      consulta({
        regras: [regra({ id: "ant", propriedadeId: PROP, antecedenciaMinimaHoras: 6 })],
        horasAteCheckin: 2,
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(false);
    expect(o.motivos).toContainEqual({
      codigo: "ANTECEDENCIA_MINIMA",
      horasExigidas: 6,
      horasRestantes: 2,
    });
  });

  it("recusa data além da janela da agenda", () => {
    const o = ofertaDe(
      consulta({
        pedido: { entrada: "2028-12-11", saida: "2028-12-14", adultos: 2, criancas: 0 },
        regras: [regra({ id: "janela", propriedadeId: PROP, janelaMaximaDias: 365 })],
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(false);
    expect(codigos(o.motivos)).toContain("JANELA_MAXIMA");
  });

  it("recusa data que já passou", () => {
    const o = ofertaDe(
      consulta({
        pedido: { entrada: "2026-11-01", saida: "2026-11-03", adultos: 2, criancas: 0 },
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(false);
    expect(codigos(o.motivos)).toContain("DATA_PASSADA");
  });
});

describe("capacidade e máximo", () => {
  it("recusa mais pessoas que a capacidade do tipo", () => {
    const o = ofertaDe(
      consulta({
        pedido: { entrada: "2026-12-11", saida: "2026-12-14", adultos: 2, criancas: 2 },
      }),
      SUITE,
    );
    expect(o.disponivel).toBe(false);
    expect(o.motivos).toContainEqual({
      codigo: "CAPACIDADE_EXCEDIDA",
      capacidade: 2,
      solicitado: 4,
    });
  });

  it("conta crianças na capacidade", () => {
    const r = consulta({
      pedido: { entrada: "2026-12-11", saida: "2026-12-14", adultos: 2, criancas: 2 },
    });
    expect(ofertaDe(r, CHALE).disponivel).toBe(true); // capacidade 4
    expect(ofertaDe(r, SUITE).disponivel).toBe(false); // capacidade 2
  });

  it("recusa estadia acima do máximo", () => {
    const o = ofertaDe(
      consulta({
        pedido: { entrada: "2026-12-11", saida: "2026-12-30", adultos: 2, criancas: 0 },
        regras: [regra({ id: "max", propriedadeId: PROP, maximoDiarias: 14 })],
      }),
      CHALE,
    );
    expect(o.disponivel).toBe(false);
    expect(codigos(o.motivos)).toContain("MAXIMO_DIARIAS");
  });
});

describe("unidades inativas", () => {
  it("não oferece unidade desativada", () => {
    const o = ofertaDe(
      consulta({
        unidades: [
          { id: "chale-1", tipoId: CHALE, ativa: false },
          { id: "chale-2", tipoId: CHALE, ativa: true },
        ],
      }),
      CHALE,
    );
    expect(o.unidadesLivres).toEqual(["chale-2"]);
  });

  it("avisa quando o tipo não tem nenhuma unidade ativa", () => {
    const o = ofertaDe(
      consulta({ unidades: [{ id: "chale-1", tipoId: CHALE, ativa: false }] }),
      CHALE,
    );
    expect(o.disponivel).toBe(false);
    expect(codigos(o.motivos)).toEqual(["SEM_UNIDADE_ATIVA"]);
  });
});

describe("pedido inválido", () => {
  it("recusa saída anterior ou igual à entrada", () => {
    expect(() =>
      consulta({
        pedido: { entrada: "2026-12-11", saida: "2026-12-11", adultos: 2, criancas: 0 },
      }),
    ).toThrow();
  });
});
