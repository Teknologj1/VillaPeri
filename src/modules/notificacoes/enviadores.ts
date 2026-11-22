/**
 * O transporte das notificações, atrás de uma interface.
 *
 * O sistema monta e enfileira a mensagem sozinho; QUEM entrega é configurável.
 * Trocar de provedor de e-mail, ou ligar o WhatsApp na RIIA em vez de num
 * provedor externo, não toca em nada do domínio.
 */

export type MensagemParaEnviar = {
  destinatario: string;
  nomeDestinatario: string | null;
  assunto: string | null;
  corpo: string;
};

export type Enviador = {
  /** Nome que aparece no log e no erro guardado. */
  nome: string;
  enviar(mensagem: MensagemParaEnviar): Promise<void>;
};

/**
 * Erro de quando não há provedor configurado para o canal.
 *
 * A mensagem continua PENDENTE na fila, não é descartada nem marcada como
 * enviada. Fingir que saiu seria o pior resultado possível: o hóspede não
 * recebe e ninguém fica sabendo.
 */
export class SemProvedorError extends Error {
  constructor(canal: string, variavel: string) {
    super(
      `Nenhum provedor de ${canal} configurado. Defina ${variavel} para a fila começar a sair.`,
    );
    this.name = "SemProvedorError";
  }
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------

/**
 * Envio por Resend, via HTTP. Sem SDK de propósito: é uma chamada só, e um
 * pacote a menos é um pacote a menos para manter.
 */
export function enviadorResend(chave: string, remetente: string): Enviador {
  return {
    nome: "resend",
    async enviar(m) {
      const resposta = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chave}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: remetente,
          to: [m.destinatario],
          subject: m.assunto ?? "Villa Peri",
          text: m.corpo,
        }),
      });

      if (!resposta.ok) {
        const detalhe = await resposta.text().catch(() => "");
        throw new Error(
          `Resend respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`,
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

/**
 * Envio pela API da Nuvem do WhatsApp (Meta).
 *
 * Atenção ao usar: fora da janela de 24 horas desde a última mensagem do
 * hóspede, a Meta só entrega MODELO aprovado, não texto livre. Para avisar
 * quem acabou de preencher o formulário do site funciona, porque a conversa
 * parte dele; para lembrar de uma chegada daqui a uma semana, vai precisar de
 * modelo aprovado.
 */
export function enviadorWhatsAppMeta(
  token: string,
  idDoNumero: string,
): Enviador {
  return {
    nome: "whatsapp-meta",
    async enviar(m) {
      const resposta = await fetch(
        `https://graph.facebook.com/v21.0/${idDoNumero}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: m.destinatario,
            type: "text",
            text: { body: m.corpo },
          }),
        },
      );

      if (!resposta.ok) {
        const detalhe = await resposta.text().catch(() => "");
        throw new Error(
          `WhatsApp respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`,
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Escolha do provedor
// ---------------------------------------------------------------------------

/**
 * Os provedores configurados por ambiente.
 *
 * Sem variável definida, o canal fica sem enviador e a fila acumula —
 * visivelmente, no painel e no retorno do cron. A alternativa, marcar como
 * enviada sem enviar, esconderia o problema até alguém reclamar de não ter
 * recebido.
 */
export function enviadorDoCanal(canal: "email" | "whatsapp"): Enviador | null {
  if (canal === "email") {
    const chave = process.env.RESEND_API_KEY;
    const remetente = process.env.EMAIL_REMETENTE;
    if (!chave || !remetente) return null;
    return enviadorResend(chave, remetente);
  }

  const token = process.env.WHATSAPP_TOKEN;
  const idDoNumero = process.env.WHATSAPP_ID_NUMERO;
  if (!token || !idDoNumero) return null;
  return enviadorWhatsAppMeta(token, idDoNumero);
}

export function variavelFaltante(canal: "email" | "whatsapp"): string {
  return canal === "email"
    ? "RESEND_API_KEY e EMAIL_REMETENTE"
    : "WHATSAPP_TOKEN e WHATSAPP_ID_NUMERO";
}
