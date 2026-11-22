import { eq } from "drizzle-orm";

import type { Tx } from "@/db/tenant";
import { type Noite, noitesDaEstadia } from "@/lib/data";
import { aplicarPercentual } from "@/lib/dinheiro";
import {
  buscarPropriedade,
  listarTipos,
  listarUnidades,
} from "@/modules/anfitriao";
import { type Autor, auditar } from "@/modules/auditoria";
import { liberarNoitesPorOrigem, ocuparNoites } from "@/modules/calendario";
import { buscarPoliticaPadrao, orcarEstadia } from "@/modules/tarifas";
import type { Orcamento } from "@/modules/tarifas";

import { reserva } from "./schema";
import { type StatusReserva, seguraNoites } from "./status";

/**
 * As variações do fluxo: remarcar, trocar de unidade, estender e sair antes.
 *
 * Todas fazem a mesma coisa no calendário — soltar as noites antigas e tomar
 * as novas, numa transação só. Se alguma das novas estiver ocupada, a chave
 * única recusa e NADA muda: a reserva continua com as noites que tinha, em
 * vez de ficar sem nenhuma.
 *
 * Soltar antes de tomar, dentro da mesma transação, é o que faz uma extensão
 * funcionar: as noites que a reserva já tinha não conflitam consigo mesmas.
 */

export class AlteracaoInvalidaError extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "AlteracaoInvalidaError";
  }
}

export type ResultadoDaAlteracao = {
  entrada: Noite;
  saida: Noite;
  unidadeId: string;
  totalAnteriorCentavos: number;
  totalCentavos: number;
  /** Positivo: o hóspede deve mais. Negativo: há crédito a devolver. */
  diferencaCentavos: number;
  recalculou: boolean;
};

export type PedidoDeRemarcacao = {
  entrada?: Noite;
  saida?: Noite;
  unidadeId?: string;
  autor: Autor;
};

/**
 * Remarca datas, troca de unidade ou estende a estadia.
 *
 * São a mesma operação com entradas diferentes, e tratá-las como três
 * funções faria três caminhos quase iguais, cada um com a sua chance de
 * esquecer de liberar as noites antigas.
 *
 * As regras da especificação, aplicadas aqui:
 *
 * - **Remarcação de datas:** recalcula pelo preço do DIA DA ALTERAÇÃO e
 *   devolve a diferença a cobrar ou creditar. Não é o preço de quando
 *   reservou: mudar para um feriado tem de custar o feriado.
 * - **Troca de unidade no mesmo tipo:** mantém o preço. Unidades do mesmo
 *   tipo são equivalentes, e recalcular daria um número diferente só porque
 *   a tabela mudou desde então — o hóspede pagaria pela mudança de quarto.
 * - **Troca para outro tipo:** recalcula.
 * - **Extensão:** só aceita se as noites seguintes estiverem livres, o que a
 *   chave única garante sem precisar perguntar.
 */
export async function remarcar(
  tx: Tx,
  anfitriaoId: string,
  reservaId: string,
  pedido: PedidoDeRemarcacao,
): Promise<ResultadoDaAlteracao> {
  const [atual] = await tx
    .select()
    .from(reserva)
    .where(eq(reserva.id, reservaId))
    .limit(1);
  if (!atual) throw new AlteracaoInvalidaError("nao_encontrada", "Reserva não encontrada.");

  const status = atual.status as StatusReserva;
  if (!seguraNoites(status)) {
    throw new AlteracaoInvalidaError(
      "reserva_encerrada",
      `Uma reserva "${status}" não segura noites: não há o que remarcar. ` +
        "Crie uma reserva nova.",
    );
  }
  if (status === "concluida") {
    throw new AlteracaoInvalidaError(
      "estadia_concluida",
      "A estadia já aconteceu. Remarcar mudaria o histórico da casa.",
    );
  }

  const entrada = pedido.entrada ?? atual.entrada;
  const saida = pedido.saida ?? atual.saida;
  const unidadeId = pedido.unidadeId ?? atual.unidadeId;

  if (saida <= entrada) {
    throw new AlteracaoInvalidaError(
      "periodo_invalido",
      "A saída tem de ser depois da entrada.",
    );
  }

  if (
    entrada === atual.entrada &&
    saida === atual.saida &&
    unidadeId === atual.unidadeId
  ) {
    throw new AlteracaoInvalidaError("sem_mudanca", "Nada mudou no pedido.");
  }

  const unidades = await listarUnidades(tx);
  const nova = unidades.find((u) => u.id === unidadeId);
  if (!nova) {
    throw new AlteracaoInvalidaError("unidade_invalida", "Unidade não encontrada.");
  }

  const mesmasDatas = entrada === atual.entrada && saida === atual.saida;
  const mesmoTipo = nova.tipoId === atual.tipoId;
  // Só troca de unidade dentro do mesmo tipo mantém o preço. Qualquer mexida
  // nas datas recalcula, porque as datas é que determinam a tarifa.
  const manterPreco = mesmasDatas && mesmoTipo;

  const propriedade = await buscarPropriedade(tx);
  const totalAnterior = atual.totalCentavos;

  let orcamento = atual.orcamento as Orcamento;
  if (!manterPreco) {
    const tipo = (await listarTipos(tx)).find((t) => t.id === nova.tipoId);
    if (!tipo) {
      throw new AlteracaoInvalidaError(
        "tipo_invalido",
        "O tipo de acomodação desta unidade não está ativo.",
      );
    }

    orcamento = await orcarEstadia(tx, {
      noites: noitesDaEstadia(entrada, saida),
      adultos: atual.adultos,
      criancas: atual.criancas,
      tipo: {
        id: tipo.id,
        modoPreco: tipo.modoPreco,
        ocupacaoBase: tipo.ocupacaoBase,
      },
      propriedadeId: propriedade.id,
      unidadeId,
      descontoManualPontosBase: atual.descontoPontosBase,
      sinalPontosBase: propriedade.sinalPontosBase,
    });
  }

  // Solta antes de tomar: dentro da mesma transação, as noites que esta
  // reserva já tinha não conflitam consigo mesmas — é o que permite
  // estender, encurtar e deslocar em um dia.
  await liberarNoitesPorOrigem(tx, "reserva", reservaId);

  await ocuparNoites(tx, {
    anfitriaoId,
    unidadeId,
    origem: "reserva",
    origemId: reservaId,
    noites: orcamento.noites.map((n) => ({
      noite: n.noite,
      precoCentavos: n.precoCentavos,
      regraTarifaId: n.regraId,
    })),
  });

  await tx
    .update(reserva)
    .set({
      entrada,
      saida,
      unidadeId,
      tipoId: nova.tipoId,
      orcamento,
      totalCentavos: orcamento.totalCentavos,
      sinalCentavos: orcamento.sinalCentavos,
      atualizadoEm: new Date(),
    })
    .where(eq(reserva.id, reservaId));

  await auditar(tx, {
    anfitriaoId,
    entidade: "reserva",
    entidadeId: reservaId,
    acao: "remarcou",
    valorAntes: {
      entrada: atual.entrada,
      saida: atual.saida,
      unidadeId: atual.unidadeId,
      totalCentavos: totalAnterior,
    },
    valorDepois: {
      entrada,
      saida,
      unidadeId,
      totalCentavos: orcamento.totalCentavos,
      manteveOPreco: manterPreco,
    },
    autor: pedido.autor,
  });

  return {
    entrada,
    saida,
    unidadeId,
    totalAnteriorCentavos: totalAnterior,
    totalCentavos: orcamento.totalCentavos,
    diferencaCentavos: orcamento.totalCentavos - totalAnterior,
    recalculou: !manterPreco,
  };
}

// ---------------------------------------------------------------------------
// Saída antecipada
// ---------------------------------------------------------------------------

export type ResultadoDaSaidaAntecipada = ResultadoDaAlteracao & {
  noitesLiberadas: number;
  valorDasNoitesLiberadasCentavos: number;
  devolucaoCentavos: number;
};

/**
 * O hóspede vai embora antes do previsto.
 *
 * Libera as noites não usadas no calendário — a casa volta a vender — e a
 * cobrança segue a política configurada.
 *
 * O padrão da Villa Peri é **não devolver nada**: cobra-se a estadia inteira.
 * A razão é a coerência com o resto da política — cancelamento exige uma
 * semana de antecedência para haver devolução, e quem vai embora antes
 * avisou com zero dias. Devolver aqui daria em cima da hora o que a política
 * nega a quem avisa na véspera. O percentual é coluna
 * (`saidaAntecipadaPontosBase`), então muda sem programador.
 *
 * A data de saída É atualizada mesmo sem devolução: o calendário tem de
 * dizer a verdade sobre quando a casa ficou livre, senão a limpeza não é
 * agendada e a noite seguinte não é vendida.
 */
export async function saidaAntecipada(
  tx: Tx,
  anfitriaoId: string,
  reservaId: string,
  novaSaida: Noite,
  autor: Autor,
): Promise<ResultadoDaSaidaAntecipada> {
  const [atual] = await tx
    .select()
    .from(reserva)
    .where(eq(reserva.id, reservaId))
    .limit(1);
  if (!atual) throw new AlteracaoInvalidaError("nao_encontrada", "Reserva não encontrada.");

  if (atual.status !== "hospedado") {
    throw new AlteracaoInvalidaError(
      "nao_hospedado",
      "Saída antecipada é para quem está na casa. Antes do check-in, o " +
        "caminho é remarcar ou cancelar.",
    );
  }
  if (novaSaida >= atual.saida) {
    throw new AlteracaoInvalidaError(
      "nao_e_antecipacao",
      "A nova saída tem de ser antes da que está marcada.",
    );
  }
  if (novaSaida <= atual.entrada) {
    throw new AlteracaoInvalidaError(
      "periodo_invalido",
      "A saída tem de ser depois da entrada. Para desfazer a estadia " +
        "inteira, o caminho é o cancelamento.",
    );
  }

  const orcamento = atual.orcamento as Orcamento;
  const noitesUsadas = new Set(noitesDaEstadia(atual.entrada, novaSaida));

  const liberadas = orcamento.noites.filter((n) => !noitesUsadas.has(n.noite));
  const valorLiberado = liberadas.reduce((s, n) => s + n.precoCentavos, 0);

  const politica = await buscarPoliticaPadrao(tx);
  const pontosBase = politica?.saidaAntecipadaPontosBase ?? 0;
  const devolucao = aplicarPercentual(valorLiberado, pontosBase / 100);

  const totalAnterior = atual.totalCentavos;
  const novoTotal = totalAnterior - devolucao;

  // O orçamento guardado mantém TODAS as noites, com uma marca de quais não
  // foram usadas. Apagá-las esconderia o que foi contratado e cobrado — e é
  // justamente isso que o hóspede vai querer conferir no recibo.
  const novoOrcamento: Orcamento = {
    ...orcamento,
    noites: orcamento.noites.map((n) =>
      noitesUsadas.has(n.noite)
        ? n
        : { ...n, regraNome: `${n.regraNome} (noite não usada, cobrada)` },
    ),
    totalCentavos: novoTotal,
    saldoCentavos: novoTotal - orcamento.sinalCentavos,
  };

  await liberarNoitesPorOrigem(tx, "reserva", reservaId);
  await ocuparNoites(tx, {
    anfitriaoId,
    unidadeId: atual.unidadeId,
    origem: "reserva",
    origemId: reservaId,
    noites: orcamento.noites
      .filter((n) => noitesUsadas.has(n.noite))
      .map((n) => ({
        noite: n.noite,
        precoCentavos: n.precoCentavos,
        regraTarifaId: n.regraId,
      })),
  });

  await tx
    .update(reserva)
    .set({
      saida: novaSaida,
      orcamento: novoOrcamento,
      totalCentavos: novoTotal,
      atualizadoEm: new Date(),
      observacoes: [
        atual.observacoes,
        `Saída antecipada de ${atual.saida} para ${novaSaida}.`,
      ]
        .filter(Boolean)
        .join(" "),
    })
    .where(eq(reserva.id, reservaId));

  await auditar(tx, {
    anfitriaoId,
    entidade: "reserva",
    entidadeId: reservaId,
    acao: "saida_antecipada",
    valorAntes: { saida: atual.saida, totalCentavos: totalAnterior },
    valorDepois: {
      saida: novaSaida,
      totalCentavos: novoTotal,
      noitesLiberadas: liberadas.length,
      devolucaoCentavos: devolucao,
      politicaPontosBase: pontosBase,
    },
    autor,
  });

  return {
    entrada: atual.entrada,
    saida: novaSaida,
    unidadeId: atual.unidadeId,
    totalAnteriorCentavos: totalAnterior,
    totalCentavos: novoTotal,
    diferencaCentavos: novoTotal - totalAnterior,
    recalculou: false,
    noitesLiberadas: liberadas.length,
    valorDasNoitesLiberadasCentavos: valorLiberado,
    devolucaoCentavos: devolucao,
  };
}
