export type StatusReserva =
  | "pre_reserva"
  | "aguardando_aprovacao"
  | "confirmada"
  | "hospedado"
  | "concluida"
  | "cancelada"
  | "no_show";

/**
 * Para onde cada status pode ir.
 *
 * A tabela é explícita em vez de espalhada em `if`s porque é regra de
 * negócio, não detalhe: o que pode virar o quê define o que a recepção
 * consegue fazer. Um caminho que falta aqui é um caminho que não existe no
 * sistema — e isso tem de ser uma decisão, não um esquecimento.
 */
const TRANSICOES: Record<StatusReserva, StatusReserva[]> = {
  // Segura as noites por um prazo. Vira reserva com o sinal, ou cai.
  pre_reserva: ["aguardando_aprovacao", "confirmada", "cancelada"],

  // Desconto acima do limite da recepção: Gerente ou Proprietário decide.
  aguardando_aprovacao: ["confirmada", "cancelada"],

  // Noites reservadas. Pode virar estadia, cair, ou o hóspede não aparecer.
  confirmada: ["hospedado", "cancelada", "no_show"],

  // Com o hóspede na casa, o único caminho é o check-out. Cancelar uma
  // estadia em curso não é cancelamento: é saída antecipada, que mexe nas
  // datas e segue outro fluxo.
  hospedado: ["concluida"],

  // Finais.
  concluida: [],
  cancelada: [],
  no_show: [],
};

/**
 * Todos os status, derivados da própria tabela de transições.
 *
 * Derivado, e não uma segunda lista escrita à mão: acrescentar um status e
 * esquecer de atualizar a lista paralela é o jeito de uma tela passar a
 * esconder reservas sem ninguém notar.
 */
export const TODOS_OS_STATUS = Object.keys(TRANSICOES) as StatusReserva[];

/** Status que seguram noites no calendário. */
const SEGURAM_NOITES: StatusReserva[] = [
  "pre_reserva",
  "aguardando_aprovacao",
  "confirmada",
  "hospedado",
  "concluida",
];

export function podeIrPara(de: StatusReserva, para: StatusReserva): boolean {
  return TRANSICOES[de].includes(para);
}

export function destinosDe(de: StatusReserva): StatusReserva[] {
  return [...TRANSICOES[de]];
}

export function ehFinal(status: StatusReserva): boolean {
  return TRANSICOES[status].length === 0;
}

/**
 * Se o status mantém as noites ocupadas.
 *
 * `concluida` mantém: a estadia aconteceu, e o calendário tem de continuar
 * mostrando que a casa esteve ocupada — senão o histórico mente e o relatório
 * de ocupação sai errado.
 */
export function seguraNoites(status: StatusReserva): boolean {
  return SEGURAM_NOITES.includes(status);
}

export class TransicaoInvalidaError extends Error {
  readonly de: StatusReserva;
  readonly para: StatusReserva;

  constructor(de: StatusReserva, para: StatusReserva) {
    const possiveis = destinosDe(de);
    super(
      possiveis.length === 0
        ? `A reserva está "${de}", que é um estado final: não há para onde ir.`
        : `Não é possível ir de "${de}" para "${para}". Caminhos possíveis: ${possiveis.join(", ")}.`,
    );
    this.name = "TransicaoInvalidaError";
    this.de = de;
    this.para = para;
  }
}

export function exigirTransicao(de: StatusReserva, para: StatusReserva): void {
  if (!podeIrPara(de, para)) throw new TransicaoInvalidaError(de, para);
}

// ---------------------------------------------------------------------------
// Como cada status se chama na tela
// ---------------------------------------------------------------------------

/**
 * O nome que a equipe lê. Fica junto da máquina, e não na página, porque o
 * PDF da portaria, a lista e a ficha mostram os mesmos status — e um deles
 * escrito diferente dos outros faz a recepção achar que são coisas diferentes.
 */
export const ROTULO_STATUS: Record<StatusReserva, string> = {
  pre_reserva: "Pré-reserva",
  aguardando_aprovacao: "Aguardando aprovação",
  confirmada: "Confirmada",
  hospedado: "Hospedado",
  concluida: "Concluída",
  cancelada: "Cancelada",
  no_show: "Não compareceu",
};

/** O verbo do botão que leva a cada status. */
export const ACAO_PARA: Record<StatusReserva, string> = {
  pre_reserva: "Voltar para pré-reserva",
  aguardando_aprovacao: "Enviar para aprovação",
  confirmada: "Confirmar",
  hospedado: "Fazer check-in",
  concluida: "Fazer check-out",
  cancelada: "Cancelar",
  no_show: "Marcar não comparecimento",
};

// ---------------------------------------------------------------------------
// Cancelamento
// ---------------------------------------------------------------------------

export type FaixaCancelamento = {
  diasAntes: number;
  percentualPontosBase: number;
};

/**
 * Quanto se devolve ao cancelar, pela política e pela antecedência.
 *
 * Vale a faixa mais exigente que a antecedência alcança: com faixas de 30 e 7
 * dias, cancelar com 40 dias cai na de 30. Sem alcançar nenhuma, devolve
 * zero. A devolução incide sobre o que já foi PAGO, não sobre o total — quem
 * só pagou o sinal não recebe de volta mais do que deu.
 */
export function devolucaoAoCancelar(
  faixas: FaixaCancelamento[],
  diasDeAntecedencia: number,
  pagoCentavos: number,
): { percentualPontosBase: number; devolverCentavos: number } {
  const aplicaveis = faixas
    .filter((f) => diasDeAntecedencia >= f.diasAntes)
    .sort((a, b) => b.diasAntes - a.diasAntes);

  const faixa = aplicaveis[0];
  const percentualPontosBase = faixa?.percentualPontosBase ?? 0;

  // Arredonda meio para cima, como todo dinheiro do sistema.
  const devolverCentavos = Math.round(
    (pagoCentavos * percentualPontosBase) / 10_000,
  );

  return { percentualPontosBase, devolverCentavos };
}
