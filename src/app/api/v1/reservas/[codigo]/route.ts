import { noitesDaEstadia } from "@/lib/data";
import { mesmoTelefone } from "@/lib/telefone";
import { buscarPropriedade } from "@/modules/anfitriao";
import { ROTULO_STATUS, type StatusReserva, buscarReservaPorCodigo } from "@/modules/reservas";

import { consultaDeReserva } from "../../_esquemas";
import { ErroDeFerramenta, rota } from "../../_nucleo";

/**
 * `consultar_reserva` — status, saldo e instruções.
 *
 * Responde SÓ ao titular, identificado pelo telefone da conversa. O código da
 * reserva circula por grupo de família e por captura de tela; sozinho ele não
 * pode abrir o cadastro de ninguém.
 *
 * O documento do hóspede NUNCA sai daqui, nem para o titular: a RIIA não
 * precisa dele para responder nada, e o que não sai do sistema não vaza numa
 * conversa de WhatsApp.
 */
export const GET = rota({
  ferramenta: "consultar_reserva",
  entrada: consultaDeReserva,
  deQuery: true,
  async executar(d, ctx) {
    const ficha = await buscarReservaPorCodigo(ctx.tx, d.codigo);

    // Mesma resposta para código inexistente e para código de outra pessoa.
    // Distinguir os dois confirmaria a quem está testando códigos que aquele
    // existe — e o código tem quatro caracteres.
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

    const propriedade = await buscarPropriedade(ctx.tx);
    const falta = ficha.reserva.totalCentavos - ficha.pagoCentavos;
    const status = ficha.reserva.status as StatusReserva;

    return {
      codigo: ficha.reserva.codigo,
      status,
      statusTexto: ROTULO_STATUS[status],
      entrada: ficha.reserva.entrada,
      saida: ficha.reserva.saida,
      noites: noitesDaEstadia(ficha.reserva.entrada, ficha.reserva.saida).length,
      pessoas: {
        adultos: ficha.reserva.adultos,
        criancas: ficha.reserva.criancas,
      },
      titular: { nome: ficha.hospede.nome },
      valores: {
        totalCentavos: ficha.reserva.totalCentavos,
        pagoCentavos: ficha.pagoCentavos,
        faltaCentavos: Math.max(falta, 0),
        aDevolverCentavos: falta < 0 ? -falta : 0,
        sinalCentavos: ficha.reserva.sinalCentavos,
      },
      fnrh: {
        status: ficha.reserva.fnrhStatus,
        pendente:
          ficha.reserva.fnrhStatus === "nao_enviada" ||
          ficha.reserva.fnrhStatus === "link_enviado",
      },
      expiraEm: ficha.reserva.expiraEm,
      instrucoes: {
        checkin: `A partir das ${propriedade.checkinPadrao.slice(0, 5)}`,
        checkout: `Até as ${propriedade.checkoutPadrao.slice(0, 5)}`,
        endereco: propriedade.endereco,
      },
    };
  },
});
