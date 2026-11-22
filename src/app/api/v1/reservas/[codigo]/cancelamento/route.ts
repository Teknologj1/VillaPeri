import { diferencaEmDias, hojeNaPropriedade } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { mesmoTelefone } from "@/lib/telefone";
import { buscarPropriedade } from "@/modules/anfitriao";
import { buscarReservaPorCodigo, devolucaoAoCancelar } from "@/modules/reservas";
import { buscarPoliticaPadrao } from "@/modules/tarifas";
import { transferirParaHumano } from "@/modules/riia";

import { pedidoDeCancelamento } from "../../../_esquemas";
import { ErroDeFerramenta, rota } from "../../../_nucleo";

/**
 * `solicitar_cancelamento` — calcula o que a política devolve e abre o pedido.
 *
 * NÃO cancela. Cancelar libera noites e devolve dinheiro, e isso é decisão de
 * pessoa — a especificação é explícita: a RIIA propõe, o sistema decide, e
 * nesta a decisão é da recepção.
 *
 * O que a ferramenta faz é o que a RIIA não deve fazer sozinha: a conta.
 * Devolve o valor exato que a política prevê, para o hóspede saber o que
 * esperar antes de confirmar, e transfere a conversa com esse número já
 * calculado no resumo.
 */
export const POST = rota({
  ferramenta: "solicitar_cancelamento",
  entrada: pedidoDeCancelamento,
  idempotente: true,
  async executar(d, ctx) {
    const ficha = await buscarReservaPorCodigo(ctx.tx, d.codigo);

    const naoEncontrada = new ErroDeFerramenta(
      404,
      "reserva_nao_encontrada",
      "Não encontrei nenhuma reserva com esse código para este telefone.",
    );
    if (!ficha) throw naoEncontrada;

    // Canônico dos dois lados: o mesmo hóspede escreve com e sem o 55, e
    // comparar os dígitos crus recusaria o próprio titular.
    const doTitular = mesmoTelefone(ficha.hospede.telefone, d.telefone);
    if (!doTitular) throw naoEncontrada;

    if (["cancelada", "no_show", "concluida"].includes(ficha.reserva.status)) {
      throw new ErroDeFerramenta(
        409,
        "reserva_encerrada",
        `Esta reserva já está "${ficha.reserva.status}".`,
        { status: ficha.reserva.status },
      );
    }

    const propriedade = await buscarPropriedade(ctx.tx);
    const politica = await buscarPoliticaPadrao(ctx.tx);
    const hoje = hojeNaPropriedade(propriedade.fuso);
    const antecedencia = diferencaEmDias(hoje, ficha.reserva.entrada);

    const { percentualPontosBase, devolverCentavos } = politica
      ? devolucaoAoCancelar(politica.faixas, antecedencia, ficha.pagoCentavos)
      : { percentualPontosBase: 0, devolverCentavos: 0 };

    const resumo =
      `Pediu cancelamento da reserva ${ficha.reserva.codigo} ` +
      `(${ficha.reserva.entrada} a ${ficha.reserva.saida}), com ${antecedencia} ` +
      `dias de antecedência. Pago: ${formatarReais(ficha.pagoCentavos)}. ` +
      `Pela política, devolver ${formatarReais(devolverCentavos)} ` +
      `(${percentualPontosBase / 100}%).` +
      (d.motivo ? ` Motivo: ${d.motivo}` : "");

    if (ctx.conversaId) {
      await transferirParaHumano(ctx.tx, ctx.conversaId, {
        motivo: "pedido de cancelamento",
        resumo,
      });
    }

    return {
      codigo: ficha.reserva.codigo,
      // Dito com todas as letras para a RIIA não anunciar o cancelamento.
      cancelada: false,
      pedidoAberto: true,
      antecedenciaDias: antecedencia,
      pagoCentavos: ficha.pagoCentavos,
      devolucaoPrevistaCentavos: devolverCentavos,
      percentualDevolvido: percentualPontosBase / 100,
      mensagemSugerida:
        `Abri o pedido de cancelamento da reserva ${ficha.reserva.codigo}. ` +
        (ficha.pagoCentavos > 0
          ? `Pela nossa política, com ${antecedencia} dias de antecedência a ` +
            `devolução prevista é de ${formatarReais(devolverCentavos)}. `
          : "") +
        `A recepção confirma e dá retorno por aqui.`,
    };
  },
});
