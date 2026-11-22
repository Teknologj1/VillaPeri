import { mesmoTelefone } from "@/lib/telefone";
import { buscarReservaPorCodigo, enviarLinkDaFnrh } from "@/modules/reservas";

import { consultaDeReserva } from "../../../_esquemas";
import { ErroDeFerramenta, rota } from "../../../_nucleo";

/**
 * `enviar_link_fnrh` — entrega o link da ficha e registra o envio.
 *
 * Só ao titular, pelo mesmo motivo de `consultar_reserva`: o link dá acesso
 * ao cadastro do hóspede, e quem o recebe pode ver e alterar os dados dele.
 *
 * O link volta na resposta para a RIIA mandar na conversa em que já está —
 * e a mensagem também é enfileirada, para sair por e-mail de qualquer jeito.
 */
export const POST = rota({
  ferramenta: "enviar_link_fnrh",
  entrada: consultaDeReserva,
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

    // A ficha existe a partir da confirmação: antes disso a reserva pode
    // simplesmente não acontecer, e pedir documento a quem só segurou uma
    // data é pedir dado pessoal sem necessidade.
    if (
      ficha.reserva.status !== "confirmada" &&
      ficha.reserva.status !== "hospedado"
    ) {
      throw new ErroDeFerramenta(
        409,
        "reserva_nao_confirmada",
        "A ficha de registro só vale a partir da reserva confirmada.",
        { status: ficha.reserva.status },
      );
    }

    const { url } = await enviarLinkDaFnrh(
      ctx.tx,
      ctx.anfitriaoId,
      ficha.reserva.id,
      { tipo: "riia", chaveId: ctx.chave.id, conversaId: ctx.conversaId ?? undefined },
    );

    return {
      codigo: ficha.reserva.codigo,
      url,
      mensagemSugerida:
        `Aqui está a ficha de registro de hóspedes, obrigatória por lei e feita ` +
        `pelo celular em dois minutos: ${url}`,
    };
  },
});
