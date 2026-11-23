/**
 * O transporte das notificações, atrás de uma interface.
 *
 * O sistema monta e enfileira a mensagem sozinho; QUEM entrega é configurável.
 * Trocar de provedor de e-mail, ou ligar o WhatsApp na RIIA em vez de num
 * provedor externo, não toca em nada do domínio.
 */

export type MensagemParaEnviar = {
  /**
   * O id da linha na fila. ESTÁVEL entre tentativas — é a mesma mensagem.
   *
   * Vai no corpo do webhook para quem recebe poder descartar repetição. Sem
   * ele, uma entrega que deu tempo esgotado DEPOIS de a RIIA ter mandado no
   * WhatsApp faz o hóspede receber a mesma mensagem duas vezes: do nosso
   * lado a tentativa falhou, do lado dela deu certo.
   */
  id: string;
  destinatario: string;
  nomeDestinatario: string | null;
  assunto: string | null;
  corpo: string;
  /** O fato que originou a mensagem, ex.: `reserva.confirmada`. */
  evento: string;
  /** Qual tentativa é esta, a partir de 1. Útil no log de quem recebe. */
  tentativa: number;
  /** A que a mensagem se refere: `reserva` ou `solicitacao`, e o id. */
  referenciaTipo: string | null;
  referenciaId: string | null;
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
/**
 * O provedor disse que esta mensagem NUNCA vai ser entregue.
 *
 * Número sem WhatsApp, e-mail que não existe, corpo que ele recusa. Insistir
 * não muda o resultado: só gasta as cinco tentativas e atrasa o momento em
 * que a recepção descobre que o hóspede não foi avisado.
 *
 * Separado da falha passageira de propósito. Um provedor fora do ar PRECISA
 * de nova tentativa; um número que não tem WhatsApp precisa de uma pessoa.
 */
export class FalhaPermanenteError extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = "FalhaPermanenteError";
  }
}

/**
 * Se o provedor está dizendo "não insista".
 *
 * 422 é o combinado com a RIIA: ela responde assim quando o número não tem
 * WhatsApp, e 503 quando é falha passageira. 400 entra junto porque é o
 * nosso corpo que está errado — mandar o mesmo de novo dá o mesmo erro.
 *
 * Tudo o mais tenta de novo, inclusive 401 e 404: são configuração, que uma
 * pessoa conserta, e aí a mensagem que estava na fila sai.
 */
export function ehPermanente(status: number): boolean {
  return status === 400 || status === 422;
}

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
        const texto = `Resend respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`;
        if (ehPermanente(resposta.status)) {
          throw new FalhaPermanenteError(texto, resposta.status);
        }
        throw new Error(texto);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

/**
 * Assinatura HMAC no estilo do Stripe: `t=<época>,v1=<hex>`.
 *
 * O timestamp entra no que é assinado, e não só no cabeçalho, para que uma
 * requisição capturada não possa ser reenviada depois com data nova — quem
 * recebe compara o `t` com o próprio relógio e recusa o que está velho.
 *
 * Exportada porque quem valida do outro lado precisa calcular igual.
 */
export async function assinar(
  corpo: string,
  segredo: string,
  agora: number = Date.now(),
): Promise<string> {
  const t = Math.floor(agora / 1000);
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    chave,
    new TextEncoder().encode(`${t}.${corpo}`),
  );
  const hex = [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${t},v1=${hex}`;
}

/**
 * Entrega o WhatsApp pela RIIA, em vez de falar com a Meta direto.
 *
 * Escolha do proprietário, e a mais sensata: a RIIA já atende o WhatsApp da
 * casa. Um segundo caminho de envio significaria dois números, ou duas vozes
 * no mesmo número — e o hóspede respondendo a um aviso automático cairia numa
 * conversa que ninguém está acompanhando.
 *
 * Também contorna um limite real da Meta: fora da janela de 24 horas desde a
 * última mensagem do hóspede, só se entrega modelo aprovado. A RIIA, que já
 * mantém a conversa, está em melhor posição para lidar com isso.
 *
 * O corpo vai assinado para a RIIA saber que o pedido veio daqui, e não de
 * quem descobriu a URL.
 */
export function enviadorRiiaWebhook(url: string, segredo: string): Enviador {
  return {
    nome: "riia-webhook",
    async enviar(m) {
      const corpo = JSON.stringify({
        // O id é o que permite descartar repetição do outro lado: a mesma
        // mensagem reenviada traz o mesmo id.
        id: m.id,
        canal: "whatsapp",
        telefone: m.destinatario,
        nome: m.nomeDestinatario,
        texto: m.corpo,
        evento: m.evento,
        tentativa: m.tentativa,
        referencia: m.referenciaTipo
          ? { tipo: m.referenciaTipo, id: m.referenciaId }
          : null,
      });

      const resposta = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VillaPeri-Assinatura": await assinar(corpo, segredo),
        },
        body: corpo,
      });

      if (!resposta.ok) {
        const detalhe = await resposta.text().catch(() => "");
        const texto = `A RIIA respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`;
        // O combinado: 422 é "não adianta reenviar" (número sem WhatsApp),
        // 503 é falha passageira. Insistir num 422 gasta as cinco tentativas
        // e atrasa o aviso à recepção de que o hóspede não foi avisado.
        if (ehPermanente(resposta.status)) {
          throw new FalhaPermanenteError(texto, resposta.status);
        }
        throw new Error(texto);
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

  const url = process.env.RIIA_WEBHOOK_URL;
  const segredo = process.env.RIIA_WEBHOOK_SEGREDO;
  if (!url || !segredo) return null;
  return enviadorRiiaWebhook(url, segredo);
}

export function variavelFaltante(canal: "email" | "whatsapp"): string {
  return canal === "email"
    ? "RESEND_API_KEY e EMAIL_REMETENTE"
    : "RIIA_WEBHOOK_URL e RIIA_WEBHOOK_SEGREDO";
}
