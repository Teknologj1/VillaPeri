import postgres from "postgres";

/**
 * O ÚNICO lugar que abre conexão com o Postgres.
 *
 * Existe porque `prepare: false` não é uma preferência: é requisito do
 * provedor. Em produção a conexão passa por um pooler em MODO TRANSAÇÃO
 * (Supavisor no Supabase, pooler do Neon), que não suporta prepared statements
 * nomeados. Com o padrão `prepare: true` tudo funciona contra o Postgres local
 * e nada funciona em produção.
 *
 * O `src/db/client.ts` já tinha a opção. As migrações, o seed e os três
 * scripts de linha de comando não — cada um abria o seu `postgres(...)` à mão,
 * e todos quebrariam no primeiro `db:migrate` contra o Supabase. Seis cópias
 * de uma decisão é seis chances de esquecer uma; daqui em diante é uma.
 *
 * `src/db/conectar.test.ts` confere que ninguém volte a abrir conexão por
 * fora.
 */
export type OpcoesDeConexao = {
  /** Conexões simultâneas. Em serverless, 1: quem concentra é o pooler. */
  max?: number;
};

export function conectar(url: string, opcoes: OpcoesDeConexao = {}) {
  return postgres(url, {
    // Vide acima. Não remova sem trocar o provedor de banco.
    prepare: false,
    max: opcoes.max ?? 1,
  });
}

/**
 * A conexão das MIGRAÇÕES e dos scripts: papel dono das tabelas, com
 * BYPASSRLS.
 *
 * Falha alto quando a variável não existe, em vez de cair para a conexão da
 * aplicação. Cair para ela daria um erro de permissão obscuro no meio de uma
 * migração pela metade — ou, pior, uma migração que passa porque alguém
 * apontou as duas variáveis para o mesmo papel, e aí o isolamento por
 * anfitrião deixou de existir sem ninguém notar.
 */
export function conectarComoDono(opcoes: OpcoesDeConexao = {}) {
  const url = process.env.DATABASE_URL_MIGRATOR;
  if (!url) {
    throw new Error(
      "DATABASE_URL_MIGRATOR é obrigatória para migrações, seed e scripts: é " +
        "o papel dono das tabelas (villaperi_owner). DATABASE_URL é a conexão " +
        "da APLICAÇÃO, que de propósito não tem permissão para isto.",
    );
  }
  return conectar(url, opcoes);
}
