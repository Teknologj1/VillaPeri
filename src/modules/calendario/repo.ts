import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { ehViolacaoDeUnicidade } from "@/db/erros";
import type { Tx } from "@/db/tenant";
import type { Noite } from "@/lib/data";

import { NoiteIndisponivelError } from "./erros";
import { bloqueio, noiteOcupada, regraEstadia } from "./schema";

export type OrigemNoite = "reserva" | "bloqueio" | "limpeza" | "canal";

export type NoiteParaOcupar = {
  noite: Noite;
  precoCentavos?: number | null;
  regraTarifaId?: string | null;
};

/**
 * Marca noites como ocupadas, em uma única instrução.
 *
 * Esta é a operação que impede overbooking. Não há verificação prévia aqui de
 * propósito: a defesa é a chave única `(unidade, noite)`, porque entre
 * qualquer verificação e a inserção cabe outra transação. Se alguma noite já
 * estiver tomada, o INSERT inteiro falha com 23505 e nada é gravado.
 *
 * Precisa rodar dentro da mesma transação que grava a reserva ou o bloqueio.
 */
export async function ocuparNoites(
  tx: Tx,
  dados: {
    anfitriaoId: string;
    unidadeId: string;
    origem: OrigemNoite;
    origemId: string;
    noites: NoiteParaOcupar[];
  },
): Promise<void> {
  if (dados.noites.length === 0) return;

  try {
    await tx.insert(noiteOcupada).values(
      dados.noites.map((n) => ({
        anfitriaoId: dados.anfitriaoId,
        unidadeId: dados.unidadeId,
        noite: n.noite,
        origem: dados.origem,
        origemId: dados.origemId,
        precoCentavos: n.precoCentavos ?? null,
        regraTarifaId: n.regraTarifaId ?? null,
      })),
    );
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      throw new NoiteIndisponivelError({
        unidadeId: dados.unidadeId,
        causa: erro,
      });
    }
    throw erro;
  }
}

/**
 * Como `ocuparNoites`, mas ignora as noites que já estão ocupadas.
 *
 * Só para bloqueios: fechar um período que já tem outro bloqueio sobreposto é
 * operação legítima e não deve falhar. Nunca para reservas, onde a colisão é
 * justamente o que precisa ser detectado.
 */
export async function ocuparNoitesIgnorandoExistentes(
  tx: Tx,
  dados: {
    anfitriaoId: string;
    unidadeId: string;
    origem: OrigemNoite;
    origemId: string;
    noites: Noite[];
  },
): Promise<void> {
  if (dados.noites.length === 0) return;

  await tx
    .insert(noiteOcupada)
    .values(
      dados.noites.map((noite) => ({
        anfitriaoId: dados.anfitriaoId,
        unidadeId: dados.unidadeId,
        noite,
        origem: dados.origem,
        origemId: dados.origemId,
      })),
    )
    .onConflictDoNothing();
}

/** Libera as noites de uma reserva ou bloqueio (cancelamento, remarcação). */
export async function liberarNoitesPorOrigem(
  tx: Tx,
  origem: OrigemNoite,
  origemId: string,
): Promise<void> {
  await tx
    .delete(noiteOcupada)
    .where(
      and(eq(noiteOcupada.origem, origem), eq(noiteOcupada.origemId, origemId)),
    );
}

/** As noites ocupadas de um conjunto de unidades, num intervalo de datas. */
export async function buscarNoitesOcupadas(
  tx: Tx,
  filtro: { unidadeIds: string[]; de: Noite; ate: Noite },
): Promise<
  { unidadeId: string; noite: Noite; origem: OrigemNoite; origemId: string }[]
> {
  if (filtro.unidadeIds.length === 0) return [];

  const linhas = await tx
    .select({
      unidadeId: noiteOcupada.unidadeId,
      noite: noiteOcupada.noite,
      origem: noiteOcupada.origem,
      origemId: noiteOcupada.origemId,
    })
    .from(noiteOcupada)
    .where(
      and(
        inArray(noiteOcupada.unidadeId, filtro.unidadeIds),
        gte(noiteOcupada.noite, filtro.de),
        lte(noiteOcupada.noite, filtro.ate),
      ),
    );

  return linhas;
}

/**
 * As reservas que ocupam alguma das noites informadas.
 *
 * Usado antes de fechar uma data: a especificação exige listar as reservas em
 * conflito para remanejar, em vez de só recusar.
 */
export async function reservasNasNoites(
  tx: Tx,
  filtro: { unidadeIds: string[]; de: Noite; ate: Noite },
): Promise<{ reservaId: string; unidadeId: string; noite: Noite }[]> {
  if (filtro.unidadeIds.length === 0) return [];

  const linhas = await tx
    .select({
      reservaId: noiteOcupada.origemId,
      unidadeId: noiteOcupada.unidadeId,
      noite: noiteOcupada.noite,
    })
    .from(noiteOcupada)
    .where(
      and(
        eq(noiteOcupada.origem, "reserva"),
        inArray(noiteOcupada.unidadeId, filtro.unidadeIds),
        gte(noiteOcupada.noite, filtro.de),
        lte(noiteOcupada.noite, filtro.ate),
      ),
    );

  return linhas;
}

/** Regras de estadia ativas do anfitrião. */
export async function buscarRegrasEstadia(tx: Tx) {
  return tx.select().from(regraEstadia).where(eq(regraEstadia.ativa, true));
}

export { bloqueio, noiteOcupada, regraEstadia };
