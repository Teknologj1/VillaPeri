import { eq } from "drizzle-orm";

import type { Tx } from "@/db/tenant";

import { propriedade, tipoAcomodacao, unidade } from "./schema";

export type Propriedade = typeof propriedade.$inferSelect;
export type TipoAcomodacao = typeof tipoAcomodacao.$inferSelect;
export type Unidade = typeof unidade.$inferSelect;

/**
 * A propriedade do anfitrião em curso.
 *
 * O modelo aceita várias por anfitrião; a Villa Peri tem uma. Quando houver
 * mais, isto vira um parâmetro em vez de "a primeira".
 */
export async function buscarPropriedade(tx: Tx): Promise<Propriedade> {
  const [p] = await tx.select().from(propriedade).limit(1);
  if (!p) {
    throw new Error(
      "Nenhuma propriedade cadastrada para este anfitrião. Rode o seed.",
    );
  }
  return p;
}

export async function listarTipos(tx: Tx): Promise<TipoAcomodacao[]> {
  return tx.select().from(tipoAcomodacao).where(eq(tipoAcomodacao.ativo, true));
}

export async function buscarTipoPorSlug(
  tx: Tx,
  slug: string,
): Promise<TipoAcomodacao | undefined> {
  const [t] = await tx
    .select()
    .from(tipoAcomodacao)
    .where(eq(tipoAcomodacao.slug, slug))
    .limit(1);
  return t;
}

export async function listarUnidades(tx: Tx): Promise<Unidade[]> {
  return tx.select().from(unidade);
}

export async function listarUnidadesAtivas(tx: Tx): Promise<Unidade[]> {
  return tx.select().from(unidade).where(eq(unidade.ativa, true));
}
