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

    /*
      TRÊS, não uma — e os dois tempos-limite abaixo.

      Era `max: 1` em produção, com a justificativa de que o pooler é quem
      concentra as conexões e mais de uma por instância só desperdiça slot. A
      aritmética estava certa e a conclusão, errada: com uma conexão só, a
      instância não tem folga para UMA baixa.

      O que aconteceu em produção: a função serverless foi congelada no meio de
      um `withTenant`, logo depois do `begin`. Em modo transação o pooler segura
      a conexão do servidor até o fim da transação, que nunca veio — vi no
      `pg_stat_activity`: `state = idle in transaction`, consulta `begin`,
      parada há quatro minutos. A instância quente ficou com a única conexão
      dela presa, e TODA requisição que caísse nela travava para sempre, sem
      nem chegar ao banco. O sintoma era a página responder 200, mandar o shell
      e não fechar a conexão. Funcionava nas primeiras requisições depois do
      deploy, quando as instâncias ainda eram frias, e nunca mais depois.

      Requisição abortada pelo visitante faz a mesma coisa. Não é caso raro.
    */
    max: env.NODE_ENV === "production" ? 3 : 10,

    /*
      Esperar por conexão tem prazo. Sem isto, pool esgotado é espera infinita:
      a requisição nunca falha, nunca responde, e nenhum log registra nada —
      que foi exatamente o que tornou esse defeito difícil de achar. Com prazo,
      vira erro visível, e a página mostra "não foi possível consultar agora".
    */
    connect_timeout: 10,

    /*
      Conexão ociosa é devolvida em vez de guardada. Numa função serverless a
      instância fica congelada entre requisições, e uma conexão ociosa continua
      ocupando slot do pooler do lado do servidor sem servir a ninguém.
    */
    idle_timeout: 20,
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
