import { sql } from "drizzle-orm";

import { db } from "@/db/client";

/**
 * O anfitrião que o site público representa.
 *
 * O visitante não tem sessão, então não há contexto de anfitrião: ler a
 * tabela direto devolveria zero linhas, como a política manda. A função
 * `anfitriao_publico()` no banco é a porta estreita — devolve só id e nome
 * das contas ativas, e nada mais (veja a migração 0015).
 *
 * Hoje há uma conta só. Quando houver marketplace, a escolha passa a ser pelo
 * domínio da requisição, e esta função vira o ponto onde isso é decidido.
 */
export async function anfitriaoDaCasa(): Promise<string | null> {
  const [primeiro] = await anfitrioesAtivos();
  return primeiro?.id ?? null;
}

/**
 * Todas as contas ativas.
 *
 * Usada por trabalho de fundo — a tarefa que drena a fila de notificações —,
 * que também roda sem sessão e precisa percorrer os anfitriões para depois
 * entrar no contexto de cada um.
 */
export async function anfitrioesAtivos(): Promise<
  { id: string; nome: string }[]
> {
  return db.execute<{ id: string; nome: string }>(
    sql`select id, nome from anfitriao_publico()`,
  );
}
