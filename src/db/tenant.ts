import { sql } from "drizzle-orm";

import { db } from "./client";
import { PARAMETRO_ANFITRIAO } from "./rls";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Executa `fn` dentro de uma transação com o contexto do anfitrião definido,
 * que é o que as políticas de RLS leem. **Todo** acesso ao banco feito pela
 * aplicação passa por aqui.
 *
 * O terceiro argumento de `set_config` é `true` = `SET LOCAL`: o valor vale só
 * até o fim desta transação. Isso não é detalhe de estilo — num pooler em modo
 * de transação, um `SET` comum não sobrevive entre comandos (a conexão volta
 * para o pool e pode atender outro anfitrião na instrução seguinte). `SET LOCAL`
 * dentro de uma transação é a única forma correta.
 */
export async function withTenant<T>(
  anfitriaoId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config(${PARAMETRO_ANFITRIAO}, ${anfitriaoId}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Transação com o contexto do USUÁRIO, e não do anfitrião.
 *
 * Existe para um caso só: descobrir, no login, de qual anfitrião a pessoa é.
 * Essa informação mora em `membro`, que é isolada por anfitrião — o contexto
 * que ainda não se tem. A política `membro_do_usuario` abre essa porta
 * estreita, e apenas para leitura das próprias linhas.
 *
 * `usuarioId` vem da sessão assinada pelo Better Auth, nunca de algo que o
 * cliente mande. Depois de resolvido o anfitrião, a requisição segue por
 * `withTenant`, como todo o resto.
 */
export async function comContextoDeUsuario<T>(
  usuarioId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.usuario_id', ${usuarioId}, true)`);
    return fn(tx);
  });
}

/** Define o anfitrião dentro de uma transação já aberta. */
export async function definirAnfitriao(tx: Tx, anfitriaoId: string): Promise<void> {
  await tx.execute(
    sql`select set_config(${PARAMETRO_ANFITRIAO}, ${anfitriaoId}, true)`,
  );
}
