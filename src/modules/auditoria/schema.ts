import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { anfitriaoId, colunasBase, politicaAnfitriao } from "@/db/comum";

/**
 * Quem originou a mudança. A RIIA age em nome do anfitrião, mas não é um
 * usuário: separar os três deixa a pergunta "quem mudou isto?" ter resposta
 * honesta quando a resposta é "a secretária de IA, nesta conversa".
 */
export const autorTipo = pgEnum("autor_tipo", ["usuario", "riia", "sistema"]);

/**
 * "Toda alteração relevante grava auditoria: quem, quando, valor antes e
 * depois."
 *
 * Escrita sempre DENTRO da transação da mudança que registra. Se a mudança
 * falhar, a auditoria dela não fica para trás contando uma história que não
 * aconteceu.
 */
export const auditoria = pgTable(
  "auditoria",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId(),

    /** Nome da tabela/entidade alterada: "reserva", "regra_tarifa"… */
    entidade: text("entidade").notNull(),
    entidadeId: uuid("entidade_id").notNull(),
    /** "criou", "atualizou", "cancelou", "aprovou_desconto"… */
    acao: text("acao").notNull(),

    valorAntes: jsonb("valor_antes"),
    valorDepois: jsonb("valor_depois"),

    autorTipo: autorTipo("autor_tipo").notNull(),
    /** Id do usuário, ou da chave de API quando o autor é a RIIA. */
    autorId: text("autor_id"),
    /** Conversa de WhatsApp que originou a ação, quando houver. */
    conversaId: uuid("conversa_id"),

    quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("auditoria_entidade_idx").on(t.anfitriaoId, t.entidade, t.entidadeId),
    index("auditoria_quando_idx").on(t.anfitriaoId, t.quando),
    politicaAnfitriao("auditoria_isolamento"),
  ],
);
