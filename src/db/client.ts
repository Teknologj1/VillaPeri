import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";

import * as schema from "./schema";

/**
 * A conexão, criada na PRIMEIRA consulta e não ao carregar o módulo.
 *
 * Preguiçosa de propósito. O `next build` avalia os módulos de toda rota
 * para coletar a configuração dela, e `env.ts` falha no carregamento quando
 * `DATABASE_URL` não existe. Com a criação no topo do arquivo, qualquer rota
 * que alcance este módulo — mesmo de longe, mesmo sem nunca consultar nada —
 * derruba o build inteiro num ambiente sem banco configurado.
 *
 * Foi o que aconteceu: `/api/v1/openapi.json`, que só serve um JSON estático
 * descrevendo a API, chegava aqui pelo índice do módulo RIIA e quebrava o
 * build na Vercel.
 *
 * Adiando, o erro acontece onde faz sentido — na primeira consulta de
 * verdade, em tempo de requisição, com a mensagem de `env.ts` dizendo qual
 * variável falta. E as páginas que de fato não usam banco (a vitrine inteira)
 * publicam sem um.
 */
let cliente: ReturnType<typeof postgres> | null = null;
let instancia: ReturnType<typeof drizzle<typeof schema>> | null = null;

function conexao() {
  if (cliente) return cliente;

  cliente = postgres(env.DATABASE_URL, {
    // Obrigatório: em produção a conexão passa por um pooler em modo de
    // transação (PgBouncer no Supabase, pooler do Neon), que não suporta
    // prepared statements nomeados. Com `true`, funciona em desenvolvimento
    // contra o Postgres direto e quebra só no deploy.
    prepare: false,
    // Em serverless cada instância mantém seu próprio pool; o pooler do banco
    // é quem concentra as conexões. Mais de 1 por instância só desperdiça
    // slot.
    max: env.NODE_ENV === "production" ? 1 : 10,
  });

  return cliente;
}

function real() {
  // Memoizado: o Drizzle guarda estado por instância, e criar uma nova a cada
  // acesso quebraria transações pela metade.
  instancia ??= drizzle(conexao(), { schema });
  return instancia;
}

/**
 * O `db` é um proxy sobre a conexão preguiçosa.
 *
 * Um proxy, e não uma função `db()`, para o resto do sistema continuar
 * escrevendo `db.select(...)` — trocar isso por chamadas em cem lugares seria
 * um custo alto para resolver um detalhe de inicialização.
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_alvo, propriedade) {
    const alvo = real();
    const valor = Reflect.get(alvo, propriedade, alvo);
    return typeof valor === "function" ? valor.bind(alvo) : valor;
  },
});

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Encerra o pool. Só para testes e scripts: num processo de servidor o pool
 * vive enquanto o processo viver.
 *
 * Não abre conexão só para fechá-la — se nunca houve consulta, não há nada
 * que encerrar.
 */
export async function fecharConexao(): Promise<void> {
  if (!cliente) return;
  await cliente.end();
  cliente = null;
  instancia = null;
}
