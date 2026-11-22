import { after } from "next/server";

import { drenarFila } from "@/modules/notificacoes";

/**
 * Esvazia a fila de notificações DEPOIS de responder.
 *
 * O hóspede que pede uma reserva pelo site não pode esperar a próxima
 * passada da tarefa agendada para receber a confirmação. Mas também não
 * deve esperar o e-mail sair para ver a página de "pedido enviado": entregar
 * dentro da requisição soma a latência de dois provedores externos ao tempo
 * de resposta, e uma falha deles viraria erro numa ação que deu certo.
 *
 * `after` do Next resolve os dois: a resposta sai na hora, e a entrega
 * acontece logo em seguida, na mesma invocação.
 *
 * Não é garantia de entrega — é atalho. A garantia continua sendo a fila: o
 * que não sair aqui fica pendente e sai na tarefa agendada. Por isso o erro
 * é engolido com um registro, e nunca propagado.
 */
export function entregarEmSeguida(anfitriaoId: string): void {
  after(async () => {
    try {
      const r = await drenarFila(anfitriaoId);
      if (r.erros.length > 0) {
        console.warn("[notificacoes] fila com pendências:", r.erros.join(" | "));
      }
    } catch (erro) {
      // A fila é a rede de segurança: a mensagem continua pendente e a
      // tarefa agendada tenta de novo. Derrubar a requisição aqui
      // transformaria um atraso no envio em erro de uma ação bem-sucedida.
      console.error("[notificacoes] falha ao drenar logo após o fato:", erro);
    }
  });
}
