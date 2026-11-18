import { sql } from "drizzle-orm";
import { pgPolicy, timestamp, uuid } from "drizzle-orm/pg-core";

import { PAPEL_APP, contextoAnfitriao } from "./rls";

/**
 * Colunas que toda tabela carrega.
 *
 * A especificação: "Toda tabela guarda o anfitrião dono do registro, com
 * isolamento por linha no banco, e também quem criou, quem alterou e quando."
 */
export const colunasBase = {
  id: uuid("id").primaryKey().defaultRandom(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/**
 * A coluna de dono. Fica em TODA tabela de domínio, inclusive nas que já
 * poderiam chegar ao anfitrião por uma relação (permissao → perfil →
 * anfitriao). A redundância é de propósito: a política de RLS vira uma
 * comparação direta na própria linha, sem subconsulta, e o índice é trivial.
 */
export const anfitriaoId = () => uuid("anfitriao_id").notNull();

/**
 * A política de isolamento, igual em toda tabela de domínio.
 *
 * `to: villaperi_app` restringe a política ao papel da aplicação. O papel de
 * migração (`villaperi_owner`) tem BYPASSRLS e passa por fora — é o que
 * permite que seeds e migrações com dados funcionem, inclusive a primeira
 * linha de `anfitriao`, que é quem define o contexto que a política lê.
 */
export function politicaAnfitriao(nome: string) {
  return pgPolicy(nome, {
    as: "permissive",
    for: "all",
    to: PAPEL_APP,
    using: sql`anfitriao_id = ${contextoAnfitriao}`,
    withCheck: sql`anfitriao_id = ${contextoAnfitriao}`,
  });
}

/**
 * Variante para a própria tabela `anfitriao`, cuja chave de isolamento é a
 * coluna `id` e não `anfitriao_id`: o anfitrião é a raiz, não um filho.
 */
export function politicaAnfitriaoRaiz(nome: string) {
  return pgPolicy(nome, {
    as: "permissive",
    for: "all",
    to: PAPEL_APP,
    using: sql`id = ${contextoAnfitriao}`,
    withCheck: sql`id = ${contextoAnfitriao}`,
  });
}

/**
 * Percentuais são guardados como inteiros em PONTOS-BASE: 10% = 1000.
 *
 * Mesma razão de o dinheiro estar em centavos. Um percentual em float entra na
 * conta da comissão e do desconto, e `0.1 + 0.2 !== 0.3` transforma uma regra
 * exata ("7% sobre a diária") em diferença de centavo entre o que o site
 * cotou e o que a reserva gravou.
 */
export const PONTOS_BASE_POR_PERCENTUAL = 100;

export function percentualDePontosBase(pontosBase: number): number {
  return pontosBase / PONTOS_BASE_POR_PERCENTUAL;
}

export function pontosBaseDePercentual(percentual: number): number {
  return Math.round(percentual * PONTOS_BASE_POR_PERCENTUAL);
}
