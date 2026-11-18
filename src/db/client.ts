import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";

import * as schema from "./schema";

/**
 * `prepare: false` é obrigatório: em produção a conexão passa por um pooler em
 * modo de transação (PgBouncer no Supabase, pooler do Neon), que não suporta
 * prepared statements nomeados. Com `true`, funciona em desenvolvimento contra
 * o Postgres direto e quebra só no deploy.
 */
const cliente = postgres(env.DATABASE_URL, {
  prepare: false,
  // Em serverless cada instância mantém seu próprio pool; o pooler do banco é
  // quem concentra as conexões. Mais de 1 por instância só desperdiça slot.
  max: env.NODE_ENV === "production" ? 1 : 10,
});

export const db = drizzle(cliente, { schema });

export type Db = typeof db;

/**
 * Encerra o pool. Só para testes e scripts: num processo de servidor o pool
 * vive enquanto o processo viver.
 */
export async function fecharConexao(): Promise<void> {
  await cliente.end();
}
