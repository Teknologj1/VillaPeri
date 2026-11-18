import { ajustar, aplicarPercentual, arredondarCentavos } from "@/lib/dinheiro";
import {
  FIM_DE_SEMANA_PADRAO,
  type Noite,
  diaDaSemana,
  somarDias,
} from "@/lib/data";

export type NivelTarifa = "especial" | "feriado" | "temporada" | "padrao";

/** Uma regra de tarifa como o motor a enxerga, sem depender do Drizzle. */
export type RegraTarifa = {
  id: string;
  nome: string;
  nivel: NivelTarifa;
  propriedadeId: string | null;
  tipoId: string | null;
  unidadeId: string | null;
  vigenciaInicio: Noite | null;
  vigenciaFim: Noite | null;
  precoSemanaCentavos: number | null;
  precoFimDeSemanaCentavos: number | null;
  precoFixoCentavos: number | null;
  ajustePontosBase: number | null;
  valorPessoaExtraCentavos: number | null;
  valorCriancaCentavos: number | null;
  aplicaNaVespera: boolean;
  prioridade: number;
  ativa: boolean;
};

export type Feriado = {
  data: Noite;
  nome: string;
  valeNaVespera: boolean;
};

export type Extra = {
  id: string;
  nome: string;
  valorCentavos: number;
  cobranca: "estadia" | "noite" | "pessoa" | "pessoa_noite";
  obrigatorio: boolean;
};

export type DescontoEstadiaLonga = {
  noitesMinimas: number;
  percentualPontosBase: number;
};

export type Cupom = {
  codigo: string;
  tipo: "percentual" | "valor";
  /** Pontos-base se percentual, centavos se valor. */
  valor: number;
};

export type TipoParaPreco = {
  id: string;
  modoPreco: "acomodacao" | "ocupacao";
  ocupacaoBase: number;
};

export type PedidoDePreco = {
  noites: Noite[];
  adultos: number;
  criancas: number;
  tipo: TipoParaPreco;
  propriedadeId: string;
  unidadeId?: string;
  /** Extras opcionais escolhidos; os obrigatórios entram sozinhos. */
  extrasEscolhidos?: string[];
  cupom?: Cupom;
  /** Desconto manual da recepção, em pontos-base. Limitado pelo perfil. */
  descontoManualPontosBase?: number;
  /** Percentual do sinal, em pontos-base. */
  sinalPontosBase?: number;
};

export type Catalogo = {
  regras: RegraTarifa[];
  feriados: Feriado[];
  extras: Extra[];
  descontosEstadiaLonga: DescontoEstadiaLonga[];
  /** Noites que contam como fim de semana. Padrão: sexta e sábado. */
  diasFimDeSemana?: readonly number[];
};

export type NoitePrecificada = {
  noite: Noite;
  precoCentavos: number;
  /** A regra que produziu este valor; null quando nenhuma regra cobriu. */
  regraId: string | null;
  regraNome: string;
  nivel: NivelTarifa | "sem_regra";
  ehFimDeSemana: boolean;
  feriado: string | null;
};

export type Orcamento = {
  noites: NoitePrecificada[];
  /** 1. Soma das noites. */
  subtotalNoitesCentavos: number;
  /** 2. Adicional de ocupação. */
  adicionalOcupacaoCentavos: number;
  /** 3. Desconto de estadia longa. */
  descontoEstadiaLongaCentavos: number;
  /** 4. Cupom, promoção ou desconto manual. */
  descontoCupomCentavos: number;
  descontoManualCentavos: number;
  /** 5. Extras e taxas. */
  extras: { nome: string; valorCentavos: number }[];
  extrasCentavos: number;
  /** 6. Total, sinal e saldo. */
  totalCentavos: number;
  sinalCentavos: number;
  saldoCentavos: number;
};

/** Nenhuma regra cobriu alguma noite: preço desconhecido, não zero. */
export class SemTarifaError extends Error {
  readonly noites: Noite[];
  constructor(noites: Noite[]) {
    super(
      `Não há diária cadastrada para ${noites.length} noite(s): ${noites.join(", ")}. ` +
        `Cadastre a diária padrão antes de cotar.`,
    );
    this.name = "SemTarifaError";
    this.noites = noites;
  }
}

// ---------------------------------------------------------------------------
// Resolução por noite
// ---------------------------------------------------------------------------

function especificidade(r: RegraTarifa): number {
  if (r.unidadeId) return 3;
  if (r.tipoId) return 2;
  return 1;
}

function cobreEscopo(r: RegraTarifa, pedido: PedidoDePreco): boolean {
  if (r.unidadeId) return r.unidadeId === pedido.unidadeId;
  if (r.tipoId) return r.tipoId === pedido.tipo.id;
  return r.propriedadeId === pedido.propriedadeId;
}

function cobreVigencia(r: RegraTarifa, noite: Noite): boolean {
  if (r.vigenciaInicio && noite < r.vigenciaInicio) return false;
  if (r.vigenciaFim && noite > r.vigenciaFim) return false;
  return true;
}

/** A regra mais forte de um nível para esta noite, ou undefined. */
function melhorDoNivel(
  regras: RegraTarifa[],
  nivel: NivelTarifa,
  noite: Noite,
  pedido: PedidoDePreco,
  ehFeriado: boolean,
): RegraTarifa | undefined {
  return regras
    .filter((r) => {
      if (!r.ativa || r.nivel !== nivel) return false;
      if (!cobreEscopo(r, pedido)) return false;
      if (!cobreVigencia(r, noite)) return false;
      // Uma regra de feriado só vale numa noite que seja feriado.
      if (nivel === "feriado" && !ehFeriado) return false;
      return true;
    })
    .sort((a, b) => {
      const esp = especificidade(b) - especificidade(a);
      if (esp !== 0) return esp;
      const pri = b.prioridade - a.prioridade;
      if (pri !== 0) return pri;
      return (b.vigenciaInicio ?? "").localeCompare(a.vigenciaInicio ?? "");
    })[0];
}

function precoBaseDaRegra(r: RegraTarifa, ehFimDeSemana: boolean): number | null {
  const v = ehFimDeSemana ? r.precoFimDeSemanaCentavos : r.precoSemanaCentavos;
  // Cadastrar só o preço de semana e deixar o de fim de semana vazio é comum;
  // nesse caso o de semana vale para as duas.
  return v ?? r.precoSemanaCentavos ?? null;
}

/** Índice de feriados por data, já expandido para as vésperas. */
function indexarFeriados(feriados: Feriado[]): Map<Noite, string> {
  const idx = new Map<Noite, string>();
  for (const f of feriados) {
    idx.set(f.data, f.nome);
    if (f.valeNaVespera) {
      const vespera = somarDias(f.data, -1);
      if (!idx.has(vespera)) idx.set(vespera, `Véspera de ${f.nome}`);
    }
  }
  return idx;
}

/**
 * O preço de uma noite, e a regra que o produziu.
 *
 * A pilha: data especial vence feriado, que vence temporada, que vence a
 * diária padrão. Nos dois níveis de cima o valor pode ser fixo OU um ajuste
 * percentual "sobre a base" — e a base é o preço que a temporada ou a diária
 * padrão dariam àquela noite. É por isso que a base é calculada primeiro,
 * mesmo quando uma regra especial vai vencer: sem ela, "+20% no feriado" não
 * tem sobre o que incidir.
 */
function precificarNoite(
  noite: Noite,
  pedido: PedidoDePreco,
  catalogo: Catalogo,
  feriadosIdx: Map<Noite, string>,
): NoitePrecificada {
  const diasFds = catalogo.diasFimDeSemana ?? FIM_DE_SEMANA_PADRAO;
  const ehFimDeSemana = diasFds.includes(diaDaSemana(noite));
  const nomeFeriado = feriadosIdx.get(noite) ?? null;

  const { regras } = catalogo;
  const temporada = melhorDoNivel(regras, "temporada", noite, pedido, !!nomeFeriado);
  const padrao = melhorDoNivel(regras, "padrao", noite, pedido, !!nomeFeriado);

  const regraBase = temporada ?? padrao;
  const base = regraBase ? precoBaseDaRegra(regraBase, ehFimDeSemana) : null;

  const feriadoRegra = melhorDoNivel(regras, "feriado", noite, pedido, !!nomeFeriado);
  const especial = melhorDoNivel(regras, "especial", noite, pedido, !!nomeFeriado);

  const vencedora = especial ?? feriadoRegra ?? regraBase;

  if (!vencedora) {
    return {
      noite,
      precoCentavos: 0,
      regraId: null,
      regraNome: "sem regra",
      nivel: "sem_regra",
      ehFimDeSemana,
      feriado: nomeFeriado,
    };
  }

  let preco: number | null;
  if (vencedora === regraBase) {
    preco = base;
  } else if (vencedora.precoFixoCentavos !== null) {
    preco = vencedora.precoFixoCentavos;
  } else if (vencedora.ajustePontosBase !== null && base !== null) {
    preco = ajustar(base, vencedora.ajustePontosBase / 100);
  } else {
    // Regra de ajuste percentual sem base cadastrada: não dá para inventar.
    preco = null;
  }

  if (preco === null) {
    return {
      noite,
      precoCentavos: 0,
      regraId: null,
      regraNome: "sem regra",
      nivel: "sem_regra",
      ehFimDeSemana,
      feriado: nomeFeriado,
    };
  }

  return {
    noite,
    precoCentavos: preco,
    regraId: vencedora.id,
    regraNome: vencedora.nome,
    nivel: vencedora.nivel,
    ehFimDeSemana,
    feriado: nomeFeriado,
  };
}

/** O valor por pessoa extra que vale nesta noite. */
function valoresDeOcupacao(
  noite: Noite,
  pedido: PedidoDePreco,
  catalogo: Catalogo,
  ehFeriado: boolean,
): { pessoaExtra: number; crianca: number } {
  for (const nivel of ["especial", "feriado", "temporada", "padrao"] as const) {
    const r = melhorDoNivel(catalogo.regras, nivel, noite, pedido, ehFeriado);
    if (r && r.valorPessoaExtraCentavos !== null) {
      return {
        pessoaExtra: r.valorPessoaExtraCentavos,
        crianca: r.valorCriancaCentavos ?? 0,
      };
    }
  }
  return { pessoaExtra: 0, crianca: 0 };
}

// ---------------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------------

/**
 * O orçamento de uma estadia, na ordem exata da especificação:
 * noites → ocupação → estadia longa → cupom e desconto manual → extras →
 * total, sinal e saldo.
 *
 * Função pura. É ela que o site, o simulador do painel e a reserva chamam —
 * uma só, porque o portão da Fase 1A exige que os três deem o mesmo valor em
 * centavos, e dois motores sempre acabam discordando.
 */
export function orcar(pedido: PedidoDePreco, catalogo: Catalogo): Orcamento {
  if (pedido.noites.length === 0) {
    throw new Error("Uma estadia tem ao menos uma noite.");
  }

  const feriadosIdx = indexarFeriados(catalogo.feriados);

  // 1. Soma das noites, cada uma com a regra que a definiu.
  const noites = pedido.noites.map((n) =>
    precificarNoite(n, pedido, catalogo, feriadosIdx),
  );

  const semTarifa = noites.filter((n) => n.nivel === "sem_regra").map((n) => n.noite);
  if (semTarifa.length > 0) throw new SemTarifaError(semTarifa);

  const subtotalNoitesCentavos = noites.reduce((s, n) => s + n.precoCentavos, 0);

  // 2. Adicional de ocupação, por noite.
  let adicionalOcupacaoCentavos = 0;
  if (pedido.tipo.modoPreco === "ocupacao") {
    const adultosExtras = Math.max(0, pedido.adultos - pedido.tipo.ocupacaoBase);
    for (const n of noites) {
      const v = valoresDeOcupacao(n.noite, pedido, catalogo, n.feriado !== null);
      adicionalOcupacaoCentavos +=
        adultosExtras * v.pessoaExtra + pedido.criancas * v.crianca;
    }
  }

  const baseDeDesconto = subtotalNoitesCentavos + adicionalOcupacaoCentavos;

  // 3. Desconto de estadia longa: vale a faixa mais vantajosa que a estadia alcança.
  const faixa = catalogo.descontosEstadiaLonga
    .filter((d) => pedido.noites.length >= d.noitesMinimas)
    .sort((a, b) => b.percentualPontosBase - a.percentualPontosBase)[0];
  const descontoEstadiaLongaCentavos = faixa
    ? aplicarPercentual(baseDeDesconto, faixa.percentualPontosBase / 100)
    : 0;

  const aposEstadiaLonga = baseDeDesconto - descontoEstadiaLongaCentavos;

  // 4. Cupom e desconto manual.
  let descontoCupomCentavos = 0;
  if (pedido.cupom) {
    descontoCupomCentavos =
      pedido.cupom.tipo === "percentual"
        ? aplicarPercentual(aposEstadiaLonga, pedido.cupom.valor / 100)
        : Math.min(pedido.cupom.valor, aposEstadiaLonga);
  }

  const descontoManualCentavos = pedido.descontoManualPontosBase
    ? aplicarPercentual(
        aposEstadiaLonga - descontoCupomCentavos,
        pedido.descontoManualPontosBase / 100,
      )
    : 0;

  const aposDescontos =
    aposEstadiaLonga - descontoCupomCentavos - descontoManualCentavos;

  // 5. Extras e taxas. Os obrigatórios entram sempre; os demais, se escolhidos.
  const escolhidos = new Set(pedido.extrasEscolhidos ?? []);
  const pessoas = pedido.adultos + pedido.criancas;
  const extrasAplicados = catalogo.extras
    .filter((e) => e.obrigatorio || escolhidos.has(e.id))
    .map((e) => {
      const valorCentavos =
        e.cobranca === "estadia"
          ? e.valorCentavos
          : e.cobranca === "noite"
            ? e.valorCentavos * noites.length
            : e.cobranca === "pessoa"
              ? e.valorCentavos * pessoas
              : e.valorCentavos * pessoas * noites.length;
      return { nome: e.nome, valorCentavos };
    });

  const extrasCentavos = extrasAplicados.reduce((s, e) => s + e.valorCentavos, 0);

  // 6. Total, sinal e saldo.
  const totalCentavos = aposDescontos + extrasCentavos;
  const sinalCentavos = pedido.sinalPontosBase
    ? aplicarPercentual(totalCentavos, pedido.sinalPontosBase / 100)
    : 0;

  return {
    noites,
    subtotalNoitesCentavos,
    adicionalOcupacaoCentavos,
    descontoEstadiaLongaCentavos,
    descontoCupomCentavos,
    descontoManualCentavos,
    extras: extrasAplicados,
    extrasCentavos,
    totalCentavos: arredondarCentavos(totalCentavos),
    sinalCentavos,
    saldoCentavos: arredondarCentavos(totalCentavos) - sinalCentavos,
  };
}
