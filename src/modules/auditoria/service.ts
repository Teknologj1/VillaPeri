import { and, desc, eq } from "drizzle-orm";

import type { Tx } from "@/db/tenant";

import { auditoria } from "./schema";

export type Autor =
  | { tipo: "usuario"; id: string }
  | { tipo: "riia"; chaveId: string; conversaId?: string }
  | { tipo: "sistema" };

export type RegistroDeAuditoria = {
  anfitriaoId: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  valorAntes?: unknown;
  valorDepois?: unknown;
  autor: Autor;
};

/**
 * Grava uma mudança na auditoria.
 *
 * Recebe `tx` e não abre transação própria: tem de rodar DENTRO da transação
 * da mudança que registra. Se a mudança for desfeita, o registro dela some
 * junto — senão a auditoria conta uma história que não aconteceu, que é pior
 * que não ter auditoria.
 */
export async function auditar(
  tx: Tx,
  registro: RegistroDeAuditoria,
): Promise<void> {
  await tx.insert(auditoria).values({
    anfitriaoId: registro.anfitriaoId,
    entidade: registro.entidade,
    entidadeId: registro.entidadeId,
    acao: registro.acao,
    valorAntes: registro.valorAntes ?? null,
    valorDepois: registro.valorDepois ?? null,
    autorTipo: registro.autor.tipo,
    autorId:
      registro.autor.tipo === "usuario"
        ? registro.autor.id
        : registro.autor.tipo === "riia"
          ? registro.autor.chaveId
          : null,
    conversaId:
      registro.autor.tipo === "riia" ? (registro.autor.conversaId ?? null) : null,
  });
}

/** O histórico de uma entidade, do mais recente para o mais antigo. */
export async function historicoDe(
  tx: Tx,
  entidade: string,
  entidadeId: string,
  limite = 50,
) {
  return tx
    .select()
    .from(auditoria)
    .where(
      and(eq(auditoria.entidade, entidade), eq(auditoria.entidadeId, entidadeId)),
    )
    .orderBy(desc(auditoria.quando))
    .limit(limite);
}
