import { sql } from "drizzle-orm";

/**
 * Expressão que toda política de RLS usa para descobrir de qual anfitrião é a
 * requisição em curso.
 *
 * O `nullif` não é enfeite. `current_setting(..., true)` devolve STRING VAZIA
 * (não NULL) quando a variável já existiu na conexão mas foi descartada — o que
 * acontece em toda conexão de pool logo após o COMMIT da transação anterior.
 * Sem o `nullif`, `''::uuid` lança `invalid input syntax for type uuid` e uma
 * consulta feita fora do contexto quebra com um erro obscuro em vez de,
 * corretamente, não enxergar linha nenhuma.
 *
 * Com `nullif`: string vazia vira NULL, a comparação vira NULL, a linha é
 * filtrada. Fora do contexto do anfitrião, o resultado é zero linhas.
 */
export const contextoAnfitriao = sql`nullif(current_setting('app.anfitriao_id', true), '')::uuid`;

/** Nome do papel com que a aplicação conecta (sujeito às políticas). */
export const PAPEL_APP = "villaperi_app";

/** Chave do parâmetro de sessão que carrega o anfitrião da requisição. */
export const PARAMETRO_ANFITRIAO = "app.anfitriao_id";
