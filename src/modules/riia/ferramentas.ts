/**
 * As ferramentas da API, os níveis de autonomia e os escopos.
 *
 * Arquivo puro e sem dependência nenhuma, de propósito: ele é lido pelo
 * schema do banco, pelas rotas, pelo painel e pelo gerador de OpenAPI. Uma
 * lista só, para que "a chave tem escopo X" signifique a mesma coisa em todos
 * os quatro lugares.
 */

/**
 * A regra que organiza tudo: a RIIA propõe, o sistema decide.
 *
 * O nível não é um rótulo — é o teto do que a chave pode fazer. Preço,
 * disponibilidade, mínimo de diárias, desconto e cancelamento são calculados
 * aqui; a RIIA leva o resultado ao hóspede.
 */
export const NIVEIS = {
  1: "Consulta",
  2: "Pré-reserva",
  3: "Reserva automática",
} as const;

export type NivelAutonomia = 1 | 2 | 3;

export const FERRAMENTAS = {
  buscar_disponibilidade: {
    nivel: 1,
    resumo:
      "Dadas datas e pessoas, devolve as opções com total, detalhe noite a noite e regras aplicadas; sem oferta, devolve o motivo.",
  },
  sugerir_datas: {
    nivel: 1,
    resumo: "Quando não há oferta, propõe datas próximas que cabem nas regras.",
  },
  obter_acomodacoes: {
    nivel: 1,
    resumo: "Descrição, capacidade, comodidades e fotos de cada tipo.",
  },
  obter_politicas: {
    nivel: 1,
    resumo: "Horários, cancelamento, crianças, pets e café da manhã.",
  },
  consultar_base_local: {
    nivel: 1,
    resumo: "Passeios, como chegar e perguntas frequentes.",
  },
  transferir_para_humano: {
    nivel: 1,
    resumo: "Abre uma tarefa para a recepção com resumo e motivo.",
  },
  criar_pre_reserva: {
    nivel: 2,
    resumo:
      "Cria a pré-reserva com hóspede, datas, unidade e código; devolve prazo e valor do sinal.",
  },
  consultar_reserva: {
    nivel: 2,
    resumo:
      "Status, saldo e instruções, só quando o telefone da conversa é o do titular.",
  },
  enviar_link_fnrh: {
    nivel: 2,
    resumo: "Entrega o link da ficha de registro e registra o envio.",
  },
  solicitar_cancelamento: {
    nivel: 2,
    resumo:
      "Calcula o que a política devolve e abre o pedido para a recepção.",
  },
  gerar_cobranca: {
    nivel: 3,
    resumo:
      "Gera a cobrança (Pix ou cartão) e confirma a reserva quando for paga. Fase 3.",
  },
} as const satisfies Record<string, { nivel: NivelAutonomia; resumo: string }>;

export type Ferramenta = keyof typeof FERRAMENTAS;

export const TODAS_AS_FERRAMENTAS = Object.keys(FERRAMENTAS) as Ferramenta[];

/** As ferramentas que um nível alcança, por conta do nível apenas. */
export function ferramentasDoNivel(nivel: NivelAutonomia): Ferramenta[] {
  return TODAS_AS_FERRAMENTAS.filter((f) => FERRAMENTAS[f].nivel <= nivel);
}

/**
 * Se a chave pode usar a ferramenta.
 *
 * Exige as DUAS coisas: o escopo explícito na chave e o nível de autonomia da
 * conta. O escopo é o que esta chave recebeu; o nível é o teto que o
 * proprietário escolheu para a RIIA inteira. Baixar o nível tem de cortar as
 * ferramentas de todas as chaves de uma vez, sem precisar reeditar cada uma —
 * é o botão de freio da conta.
 */
export function podeUsar(
  chave: { escopos: string[]; nivelAutonomia: number },
  ferramenta: Ferramenta,
): boolean {
  return (
    chave.escopos.includes(ferramenta) &&
    FERRAMENTAS[ferramenta].nivel <= chave.nivelAutonomia
  );
}

/** Por que a ferramenta foi negada — para a resposta dizer o que corrigir. */
export function motivoDaNegativa(
  chave: { escopos: string[]; nivelAutonomia: number },
  ferramenta: Ferramenta,
): string {
  if (FERRAMENTAS[ferramenta].nivel > chave.nivelAutonomia) {
    return (
      `A ferramenta "${ferramenta}" é do nível ${FERRAMENTAS[ferramenta].nivel} ` +
      `(${NIVEIS[FERRAMENTAS[ferramenta].nivel]}), e esta conta está no nível ` +
      `${chave.nivelAutonomia} (${NIVEIS[chave.nivelAutonomia as NivelAutonomia]}).`
    );
  }
  return `A chave não tem o escopo "${ferramenta}".`;
}
