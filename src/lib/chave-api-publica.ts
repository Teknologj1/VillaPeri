import { sql } from "drizzle-orm";

import { db } from "@/db/client";

/**
 * A busca da chave de API, antes de existir contexto de anfitrião.
 *
 * Mesma categoria de `anfitriao-publico.ts`: funções que PRECISAM rodar sem
 * contexto, porque é justamente o contexto que estão descobrindo. A
 * requisição da RIIA chega com um segredo e nada mais; só depois de achar a
 * linha há um `anfitriao_id` para pôr no `withTenant`.
 *
 * As duas funções do banco são SECURITY DEFINER e mínimas (migração 0018).
 * Ficam aqui, isoladas, para que a exceção à regra de lint — "nunca use `db`
 * direto" — tenha um lugar só e visível, em vez de aparecer espalhada por
 * qualquer arquivo que precise de uma consulta sem contexto.
 */

export type LinhaDaChave = {
  id: string;
  anfitriao_id: string;
  hash: string;
  escopos: string[];
  nivel_autonomia: number;
  limite_por_minuto: number;
  valida_ate: Date | null;
  revogada_em: Date | null;
};

export async function chavePorPrefixo(
  prefixo: string,
): Promise<LinhaDaChave | null> {
  const linhas = await db.execute<LinhaDaChave>(
    sql`select * from chave_api_por_prefixo(${prefixo})`,
  );
  return linhas[0] ?? null;
}

/**
 * Marca o último uso, sem bloquear a resposta.
 *
 * É registro, não parte da decisão, e não deve somar latência a toda chamada
 * da RIIA. Falhando, a coluna fica velha — o que é melhor que a resposta
 * demorar.
 */
export function marcarUsoDaChave(id: string): void {
  void db
    .execute(sql`select marcar_uso_da_chave(${id})`)
    .catch(() => undefined);
}
