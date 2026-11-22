import { transferirParaHumano } from "@/modules/riia";

import { transferencia } from "../_esquemas";
import { ErroDeFerramenta, rota } from "../_nucleo";

/**
 * `transferir_para_humano` — quando a RIIA para e chama alguém.
 *
 * Desconto acima do limite, exceção ao mínimo de diárias, reclamação,
 * alteração fora das regras, pedido que nenhuma ferramenta cobre ou dúvida da
 * própria RIIA. A transferência vira tarefa da recepção, com o resumo da
 * conversa, e a recepção assume o atendimento.
 *
 * É a ferramenta mais importante do nível 1: é ela que torna aceitável tudo
 * o que a RIIA NÃO pode fazer. Sem saída para uma pessoa, um modelo de
 * linguagem encurralado inventa a resposta.
 */
export const POST = rota({
  ferramenta: "transferir_para_humano",
  entrada: transferencia,
  async executar(d, ctx) {
    if (!ctx.conversaId) {
      throw new ErroDeFerramenta(
        422,
        "sem_conversa",
        "Informe o telefone para abrir a conversa a ser transferida.",
      );
    }

    await transferirParaHumano(ctx.tx, ctx.conversaId, {
      motivo: d.motivo,
      resumo: d.resumo ?? null,
    });

    return {
      transferida: true,
      // A RIIA precisa dizer ao hóspede o que esperar. Sem prazo, a frase
      // "já vou chamar alguém" fica aberta e o hóspede reenvia a mensagem.
      mensagemSugerida:
        "Vou passar seu atendimento para a nossa recepção. Em breve alguém responde por aqui mesmo.",
    };
  },
});
