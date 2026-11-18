/**
 * Códigos de erro do PostgreSQL que o sistema trata como regra de negócio.
 *
 * O Drizzle embrulha o erro do driver: a mensagem de fora é sempre
 * "Failed query: insert into …" e o erro real do Postgres fica em `cause`.
 * Casar por texto da mensagem de fora não funciona — e, pior, um teste escrito
 * assim passa a "falhar" por motivo nenhum quando o Drizzle muda o texto.
 */
export const CODIGO_PG = {
  /** Linha barrada por política de RLS, ou falta de privilégio. */
  VIOLACAO_RLS: "42501",
  /**
   * Violação de chave única. Numa inserção em `noite_ocupada` isto é a
   * tentativa de vender a mesma noite duas vezes: o overbooking sendo
   * impedido pelo banco, não por uma consulta prévia.
   */
  VIOLACAO_UNICIDADE: "23505",
  /** Violação de chave estrangeira. */
  VIOLACAO_REFERENCIA: "23503",
} as const;

type ErroPostgres = {
  code?: string;
  message?: string;
  constraint_name?: string;
  table_name?: string;
};

function causaPostgres(erro: unknown): ErroPostgres | undefined {
  if (typeof erro !== "object" || erro === null) return undefined;
  const causa = (erro as { cause?: unknown }).cause;
  if (typeof causa === "object" && causa !== null && "code" in causa) {
    return causa as ErroPostgres;
  }
  // Nem todo caminho passa pelo embrulho do Drizzle.
  if ("code" in erro) return erro as ErroPostgres;
  return undefined;
}

/** O código SQLSTATE do erro, se for um erro do PostgreSQL. */
export function codigoPostgres(erro: unknown): string | undefined {
  return causaPostgres(erro)?.code;
}

/** O nome da constraint violada, quando houver. */
export function constraintViolada(erro: unknown): string | undefined {
  return causaPostgres(erro)?.constraint_name;
}

/** A mensagem original do PostgreSQL, não a do embrulho do Drizzle. */
export function mensagemPostgres(erro: unknown): string | undefined {
  return causaPostgres(erro)?.message;
}

export function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return codigoPostgres(erro) === CODIGO_PG.VIOLACAO_UNICIDADE;
}

export function ehViolacaoDeRls(erro: unknown): boolean {
  return codigoPostgres(erro) === CODIGO_PG.VIOLACAO_RLS;
}
