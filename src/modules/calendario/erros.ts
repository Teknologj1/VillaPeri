import type { Noite } from "@/lib/data";

/**
 * A noite já estava ocupada no momento da gravação.
 *
 * Nasce da violação da chave única `(unidade, noite)` — ou seja, do banco
 * recusando vender a mesma noite duas vezes. Não vem de uma consulta prévia de
 * disponibilidade: aquela serve para a interface explicar, esta é a garantia.
 *
 * Na prática é o que acontece quando duas reservas são fechadas ao mesmo
 * tempo para a mesma noite: a primeira transação grava, a segunda falha
 * inteira.
 */
export class NoiteIndisponivelError extends Error {
  readonly unidadeId: string | undefined;
  readonly noite: Noite | undefined;

  constructor(opcoes: { unidadeId?: string; noite?: Noite; causa?: unknown }) {
    const onde =
      opcoes.noite && opcoes.unidadeId
        ? ` (unidade ${opcoes.unidadeId}, noite ${opcoes.noite})`
        : "";
    super(
      `A noite já está ocupada${onde}. Outra reserva ou bloqueio tomou essa data.`,
    );
    this.name = "NoiteIndisponivelError";
    this.unidadeId = opcoes.unidadeId;
    this.noite = opcoes.noite;
    this.cause = opcoes.causa;
  }
}

export type ReservaEmConflito = {
  reservaId: string;
  unidadeId: string;
  noites: Noite[];
};

/**
 * Bloqueio recusado porque alcançaria noites já reservadas.
 *
 * "Fechar ou mudar regra de uma data que já tem reserva só é possível após
 * remanejar ou cancelar a reserva; o sistema bloqueia e avisa." Carrega as
 * reservas em conflito, porque a recepção precisa saber o que remanejar —
 * um "não foi possível" obrigaria a procurar na mão.
 */
export class BloqueioEmConflitoError extends Error {
  readonly conflitos: ReservaEmConflito[];

  constructor(conflitos: ReservaEmConflito[]) {
    const total = conflitos.length;
    super(
      `O bloqueio alcança ${total} reserva${total === 1 ? "" : "s"} já confirmada${
        total === 1 ? "" : "s"
      }. Remaneje ou cancele antes de fechar a data.`,
    );
    this.name = "BloqueioEmConflitoError";
    this.conflitos = conflitos;
  }
}
