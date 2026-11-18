import {
  type Noite,
  diaDaSemana,
  diferencaEmDias,
  noitesDaEstadia,
  somarDias,
} from "@/lib/data";

import {
  type RegraEstadia,
  type RegrasEfetivas,
  resolverRegras,
} from "./regras";

/**
 * Por que não há oferta.
 *
 * Nunca um booleano. "Indisponível" obriga o hóspede a adivinhar e obriga a
 * RIIA a inventar; "neste período o mínimo é de 3 noites" resolve a conversa.
 * Cada motivo carrega os números que a frase precisa.
 */
export type MotivoIndisponivel =
  | { codigo: "NOITE_OCUPADA"; noites: Noite[] }
  | { codigo: "SEM_UNIDADE_ATIVA" }
  | { codigo: "MINIMO_DIARIAS"; minimo: number; solicitado: number; regra: string | null }
  | { codigo: "MAXIMO_DIARIAS"; maximo: number; solicitado: number }
  | { codigo: "DIA_ENTRADA_NAO_PERMITIDO"; diasPermitidos: number[]; diaSolicitado: number }
  | { codigo: "ANTECEDENCIA_MINIMA"; horasExigidas: number; horasRestantes: number }
  | { codigo: "JANELA_MAXIMA"; diasMaximos: number; diasSolicitados: number }
  | { codigo: "DATA_PASSADA"; hoje: Noite }
  | { codigo: "CAPACIDADE_EXCEDIDA"; capacidade: number; solicitado: number }
  | { codigo: "INTERVALO_LIMPEZA"; noites: number };

export type Pedido = {
  entrada: Noite;
  /** Data de saída: a noite de saída NÃO é ocupada (intervalo aberto à direita). */
  saida: Noite;
  adultos: number;
  criancas: number;
  /** Restringe a consulta a um tipo. Omitido = todos. */
  tipoId?: string;
};

export type TipoParaConsulta = {
  id: string;
  nome: string;
  capacidade: number;
};

export type UnidadeParaConsulta = {
  id: string;
  tipoId: string;
  ativa: boolean;
};

export type NoiteOcupadaParaConsulta = { unidadeId: string; noite: Noite };

export type EntradaConsulta = {
  pedido: Pedido;
  propriedadeId: string;
  tipos: TipoParaConsulta[];
  unidades: UnidadeParaConsulta[];
  ocupadas: NoiteOcupadaParaConsulta[];
  regras: RegraEstadia[];
  /** Hoje no fuso da propriedade, nunca o dia do servidor. */
  hoje: Noite;
  /**
   * Horas de agora até o horário de check-in da data de entrada; negativo se
   * já passou. Calculado fora do motor, para que ele continue puro e o
   * cálculo de fuso viva num helper só, testado à parte.
   */
  horasAteCheckin: number;
};

export type OfertaTipo = {
  tipoId: string;
  nome: string;
  disponivel: boolean;
  /** Unidades que atendem o pedido inteiro. */
  unidadesLivres: string[];
  regras: RegrasEfetivas;
  motivos: MotivoIndisponivel[];
};

export type ResultadoConsulta = {
  noites: Noite[];
  ofertas: OfertaTipo[];
};

/** Chave de busca rápida em "esta unidade está ocupada nesta noite?". */
function indexarOcupadas(ocupadas: NoiteOcupadaParaConsulta[]): Set<string> {
  return new Set(ocupadas.map((o) => `${o.unidadeId}|${o.noite}`));
}

/**
 * As noites de folga que ESTA reserva passaria a ocupar depois da saída.
 *
 * O intervalo de limpeza é materializado como noites ocupadas, então a folga
 * da reserva anterior já aparece como ocupada na consulta. O que falta
 * verificar é a folga que a nova reserva criaria — senão ela é aceita e a
 * gravação falha depois, na chave única.
 */
function noitesDeFolga(saida: Noite, intervalo: number): Noite[] {
  return Array.from({ length: Math.max(0, intervalo) }, (_, i) =>
    somarDias(saida, i),
  );
}

/**
 * Se o pedido fecha exatamente o buraco entre duas reservas desta unidade.
 *
 * É a regra de "lacuna curta": sem ela, um vão de duas noites entre reservas
 * nunca vende numa casa cujo mínimo é três, e a noite fica vazia para sempre.
 */
function fechaLacunaExata(
  unidadeId: string,
  pedido: Pedido,
  ocupadasIdx: Set<string>,
): boolean {
  const anterior = somarDias(pedido.entrada, -1);
  const seguinte = pedido.saida; // primeira noite depois da estadia
  return (
    ocupadasIdx.has(`${unidadeId}|${anterior}`) &&
    ocupadasIdx.has(`${unidadeId}|${seguinte}`)
  );
}

/**
 * Disponibilidade e regras para um pedido.
 *
 * Função pura: recebe tudo já carregado e não toca no banco. É o que permite
 * cobri-la por tabela de casos — e ela e o motor de tarifas são, nas palavras
 * da especificação, "as duas peças em que um erro vira dinheiro perdido".
 *
 * Importante: isto responde à interface. A garantia contra vender a mesma
 * noite duas vezes é a chave única `(unidade, noite)` na gravação, porque
 * entre esta consulta e a inserção cabe outra reserva.
 */
export function consultarDisponibilidade(
  entrada: EntradaConsulta,
): ResultadoConsulta {
  const { pedido, tipos, unidades, ocupadas, regras, hoje, propriedadeId } =
    entrada;

  const noites = noitesDaEstadia(pedido.entrada, pedido.saida);
  const ocupadasIdx = indexarOcupadas(ocupadas);
  const pessoas = pedido.adultos + pedido.criancas;

  const tiposConsultados = pedido.tipoId
    ? tipos.filter((t) => t.id === pedido.tipoId)
    : tipos;

  const ofertas = tiposConsultados.map((tipo): OfertaTipo => {
    const motivos: MotivoIndisponivel[] = [];

    const efetivas = resolverRegras(regras, {
      noiteEntrada: pedido.entrada,
      propriedadeId,
      tipoId: tipo.id,
    });

    // --- Regras que não dependem de unidade --------------------------------

    if (pessoas > tipo.capacidade) {
      motivos.push({
        codigo: "CAPACIDADE_EXCEDIDA",
        capacidade: tipo.capacidade,
        solicitado: pessoas,
      });
    }

    const diasAteEntrada = diferencaEmDias(hoje, pedido.entrada);
    if (diasAteEntrada < 0) {
      motivos.push({ codigo: "DATA_PASSADA", hoje });
    } else if (diasAteEntrada > efetivas.janelaMaximaDias) {
      motivos.push({
        codigo: "JANELA_MAXIMA",
        diasMaximos: efetivas.janelaMaximaDias,
        diasSolicitados: diasAteEntrada,
      });
    }

    if (entrada.horasAteCheckin < efetivas.antecedenciaMinimaHoras) {
      motivos.push({
        codigo: "ANTECEDENCIA_MINIMA",
        horasExigidas: efetivas.antecedenciaMinimaHoras,
        horasRestantes: entrada.horasAteCheckin,
      });
    }

    const diaEntrada = diaDaSemana(pedido.entrada);
    if (efetivas.diasDeEntrada && !efetivas.diasDeEntrada.includes(diaEntrada)) {
      motivos.push({
        codigo: "DIA_ENTRADA_NAO_PERMITIDO",
        diasPermitidos: efetivas.diasDeEntrada,
        diaSolicitado: diaEntrada,
      });
    }

    if (efetivas.maximoDiarias !== null && noites.length > efetivas.maximoDiarias) {
      motivos.push({
        codigo: "MAXIMO_DIARIAS",
        maximo: efetivas.maximoDiarias,
        solicitado: noites.length,
      });
    }

    // --- Unidades ----------------------------------------------------------

    const doTipo = unidades.filter((u) => u.tipoId === tipo.id && u.ativa);
    if (doTipo.length === 0) {
      motivos.push({ codigo: "SEM_UNIDADE_ATIVA" });
      return {
        tipoId: tipo.id,
        nome: tipo.nome,
        disponivel: false,
        unidadesLivres: [],
        regras: efetivas,
        motivos,
      };
    }

    const folga = noitesDeFolga(pedido.saida, efetivas.intervaloLimpezaNoites);
    const abaixoDoMinimo = noites.length < efetivas.minimoDiarias;

    const livres = doTipo
      .filter((u) => {
        // A estadia em si tem de caber.
        if (noites.some((n) => ocupadasIdx.has(`${u.id}|${n}`))) return false;

        // Quando o pedido fecha exatamente o buraco entre duas reservas, a
        // folga de limpeza é dispensada: exigi-la tornaria a lacuna
        // impossível de preencher, que é o oposto do que a regra quer.
        const fechaLacuna =
          efetivas.lacunaCurtaPermitida && fechaLacunaExata(u.id, pedido, ocupadasIdx);
        if (fechaLacuna) return true;

        if (abaixoDoMinimo) return false;
        return !folga.some((n) => ocupadasIdx.has(`${u.id}|${n}`));
      })
      .map((u) => u.id);

    if (livres.length === 0) {
      if (abaixoDoMinimo) {
        const p = efetivas.procedencia.minimoDiarias;
        motivos.push({
          codigo: "MINIMO_DIARIAS",
          minimo: efetivas.minimoDiarias,
          solicitado: noites.length,
          regra: p === "padrão" ? null : p.regraNome,
        });
      }

      // Quais noites estão tomadas em TODAS as unidades do tipo: é essa a
      // informação útil para sugerir outras datas.
      const noitesCheias = noites.filter((n) =>
        doTipo.every((u) => ocupadasIdx.has(`${u.id}|${n}`)),
      );
      if (noitesCheias.length > 0) {
        motivos.push({ codigo: "NOITE_OCUPADA", noites: noitesCheias });
      } else if (
        !abaixoDoMinimo &&
        motivos.length === 0 &&
        efetivas.intervaloLimpezaNoites > 0
      ) {
        // Nenhuma noite da estadia está cheia e nenhuma outra regra barrou:
        // o que sobrou foi a folga de limpeza.
        motivos.push({
          codigo: "INTERVALO_LIMPEZA",
          noites: efetivas.intervaloLimpezaNoites,
        });
      } else if (motivos.length === 0) {
        motivos.push({ codigo: "NOITE_OCUPADA", noites: [] });
      }
    }

    return {
      tipoId: tipo.id,
      nome: tipo.nome,
      disponivel: livres.length > 0 && motivos.length === 0,
      unidadesLivres: motivos.length === 0 ? livres : [],
      regras: efetivas,
      motivos,
    };
  });

  return { noites, ofertas };
}
