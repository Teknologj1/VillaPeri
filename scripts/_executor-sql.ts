/**
 * Duas formas de mandar SQL para o banco, com a mesma interface.
 *
 * Existe porque nem todo lugar que precisa administrar o banco consegue abrir
 * uma conexão Postgres. Este ambiente, por exemplo, sai para a internet por um
 * proxy HTTPS — o `postgres-js` não fala através dele, e qualquer host do
 * Supabase responde `CONNECT tunnel failed, 403`. A API de consulta do
 * Supabase é HTTPS e passa.
 *
 * O SQL é o mesmo nos dois caminhos; muda só o transporte. É o que evita duas
 * versões do bootstrap divergindo — uma para quem tem TCP e outra para quem
 * não tem.
 */
export type Executor = {
  /** Uma consulta que devolve linhas. */
  consultar<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  /** Comandos que não devolvem nada. Vários numa chamada são permitidos. */
  rodar(sql: string): Promise<void>;
  fechar(): Promise<void>;
  /** Para a mensagem de erro dizer por onde a tentativa foi. */
  descricao: string;
};

/** Conexão Postgres direta. Precisa de TCP até o banco. */
export async function executorTcp(url: string): Promise<Executor> {
  const { conectar } = await import("@/db/conectar");
  const sql = conectar(url, { max: 1 });
  return {
    consultar: async <T>(texto: string) =>
      (await sql.unsafe(texto)) as unknown as T[],
    rodar: async (texto: string) => {
      await sql.unsafe(texto);
    },
    fechar: () => sql.end(),
    descricao: "conexão Postgres direta",
  };
}

/**
 * API de consulta do Supabase (`POST /v1/projects/{ref}/database/query`).
 *
 * Roda como o papel `postgres` do projeto. O token pessoal vai no cabeçalho
 * `Authorization`, injetado pelo proxy desta sessão — por isso nenhuma
 * requisição aqui monta esse cabeçalho, e nenhum token passa pelo código.
 *
 * A API é marcada como experimental pelo Supabase. Se um dia sair do ar, o
 * `executorTcp` faz a mesma coisa de qualquer lugar com TCP até o banco.
 */
export function executorSupabase(ref: string): Executor {
  const endereco = `https://api.supabase.com/v1/projects/${ref}/database/query`;

  async function enviar(texto: string): Promise<unknown> {
    const resposta = await fetch(endereco, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: texto }),
    });

    const corpo = await resposta.text();
    if (!resposta.ok) {
      // O primeiro trecho do SQL na mensagem: sem isso, uma falha no meio de
      // vinte migrações não diz qual comando caiu.
      const trecho = texto.trim().slice(0, 160).replace(/\s+/g, " ");
      throw new Error(
        `A API do Supabase recusou (${resposta.status}): ${corpo}\n` +
          `  no comando: ${trecho}…`,
      );
    }
    try {
      return JSON.parse(corpo);
    } catch {
      return [];
    }
  }

  return {
    consultar: async <T>(texto: string) => {
      const dados = await enviar(texto);
      return (Array.isArray(dados) ? dados : []) as T[];
    },
    rodar: async (texto: string) => {
      await enviar(texto);
    },
    fechar: async () => {},
    descricao: `API do Supabase (projeto ${ref})`,
  };
}

/**
 * Escolhe o transporte pelo ambiente.
 *
 * `SUPABASE_PROJECT_REF` manda; `DATABASE_URL_SUPERUSER` é a alternativa.
 * Preferir a API quando as duas existem é de propósito: quem definiu a ref
 * está num lugar sem TCP até o banco, ou quis explicitamente esse caminho.
 */
export async function escolherExecutor(): Promise<Executor> {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (ref) return executorSupabase(ref);

  const url = process.env.DATABASE_URL_SUPERUSER;
  if (url) return executorTcp(url);

  throw new Error(
    "Defina SUPABASE_PROJECT_REF (para ir pela API do Supabase) ou\n" +
      "DATABASE_URL_SUPERUSER (para abrir conexão Postgres direta, com um\n" +
      "papel que possa criar papéis — no Supabase, `postgres`).",
  );
}
