import { eq } from "drizzle-orm";

import type { Tx } from "@/db/tenant";

import {
  moduloSistema,
  type nivelPermissao,
  perfil,
  permissao,
  propriedade,
  tipoAcomodacao,
  unidade,
} from "./schema";

export type Modulo = (typeof moduloSistema.enumValues)[number];
export type Nivel = (typeof nivelPermissao.enumValues)[number];

export type PerfilComPermissoes = {
  id: string;
  nome: string;
  descontoMaximoPontosBase: number;
  exigeDoisFatores: boolean;
  permissoes: Record<Modulo, Nivel>;
};

/**
 * O perfil e a matriz de permissões dele, já num mapa pronto para consulta.
 *
 * Módulo sem linha na tabela resolve como `nenhum`: o padrão é negar. Um
 * módulo novo que ainda não foi cadastrado em nenhum perfil fica invisível
 * para todo mundo até alguém decidir quem pode vê-lo, em vez de nascer aberto.
 */
export async function buscarPerfilComPermissoes(
  tx: Tx,
  perfilId: string,
): Promise<PerfilComPermissoes | null> {
  const [p] = await tx.select().from(perfil).where(eq(perfil.id, perfilId)).limit(1);
  if (!p) return null;

  const linhas = await tx
    .select()
    .from(permissao)
    .where(eq(permissao.perfilId, perfilId));

  const permissoes = Object.fromEntries(
    moduloSistema.enumValues.map((m) => [m, "nenhum" as Nivel]),
  ) as Record<Modulo, Nivel>;
  for (const l of linhas) permissoes[l.modulo] = l.nivel;

  return {
    id: p.id,
    nome: p.nome,
    descontoMaximoPontosBase: p.descontoMaximoPontosBase,
    exigeDoisFatores: p.exigeDoisFatores,
    permissoes,
  };
}

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
