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

/**
 * De qual anfitrião é um link de ficha de registro.
 *
 * O hóspede abre `/fnrh/<token>` sem sessão nenhuma, e para ler a reserva é
 * preciso antes saber o anfitrião que define o contexto do RLS. A função
 * `anfitriao_por_token_fnrh()` devolve só esse uuid, e só para token válido,
 * dentro do prazo, de reserva em estado que aceita preenchimento (migração
 * 0016). Nenhum dado do hóspede sai dela.
 *
 * Quem recebe o id ainda entra no contexto e passa pelas políticas normais —
 * e o serviço revalida o token ao ler e ao gravar. Esta função responde "de
 * quem é", não "pode".
 */
export async function anfitriaoPorTokenFnrh(
  token: string,
): Promise<string | null> {
  const linhas = await db.execute<{ anfitriao_por_token_fnrh: string | null }>(
    sql`select anfitriao_por_token_fnrh(${token})`,
  );
  return linhas[0]?.anfitriao_por_token_fnrh ?? null;
}
