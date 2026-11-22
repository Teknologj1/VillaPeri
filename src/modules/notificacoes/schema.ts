import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { anfitriaoId, colunasBase, politicaAnfitriao } from "@/db/comum";
import { anfitriao } from "@/modules/anfitriao/schema";

export const canalNotificacao = pgEnum("canal_notificacao", [
  "email",
  "whatsapp",
]);

export const statusNotificacao = pgEnum("status_notificacao", [
  "pendente",
  /**
   * Reservada por um drenador, que está enviando agora.
   *
   * Existe porque a fila tem mais de um drenador: a tarefa agendada e o
   * envio logo depois do fato. Sem reservar a linha antes de enviar, os dois
   * pegam a mesma mensagem pendente e o hóspede recebe duas vezes.
   */
  "enviando",
  "enviada",
  "falhou",
]);

/** Para quem a mensagem vai. Muda o texto e o tom. */
export const destinatarioNotificacao = pgEnum("destinatario_notificacao", [
  "hospede",
  "anfitriao",
]);

/**
 * Fila de saída das notificações.
 *
 * É uma caixa de saída (outbox), não um envio direto: a mensagem é GRAVADA na
 * mesma transação do fato que a origina, e ENVIADA depois, por quem drena a
 * fila. Três razões:
 *
 * 1. Em serverless não há trabalho confiável depois da resposta. Disparar um
 *    e-mail "em segundo plano" no fim de uma rota é apostar que o processo
 *    sobreviva — e às vezes não sobrevive.
 * 2. Se o envio falhar, a reserva não pode falhar junto. E se a reserva for
 *    desfeita, a mensagem não pode ter saído.
 * 3. Fica o registro do que foi mandado, para quem, quando e com que texto.
 *    Numa discussão sobre "eu nunca recebi", isso é a resposta.
 */
export const notificacao = pgTable(
  "notificacao",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),

    canal: canalNotificacao("canal").notNull(),
    paraQuem: destinatarioNotificacao("para_quem").notNull(),
    /** E-mail ou telefone, conforme o canal. */
    destinatario: text("destinatario").notNull(),
    nomeDestinatario: text("nome_destinatario"),

    /** Só para e-mail; no WhatsApp não existe assunto. */
    assunto: text("assunto"),
    corpo: text("corpo").notNull(),

    /** O evento que gerou: "solicitacao.criada", "reserva.confirmada"… */
    evento: text("evento").notNull(),
    referenciaTipo: text("referencia_tipo").notNull(),
    referenciaId: uuid("referencia_id").notNull(),

    status: statusNotificacao("status").notNull().default("pendente"),
    tentativas: integer("tentativas").notNull().default(0),
    ultimoErro: text("ultimo_erro"),
    enviadaEm: timestamp("enviada_em", { withTimezone: true }),
    /**
     * Quando um drenador reservou esta linha para si.
     *
     * Serve para destravar: se o drenador morrer no meio do envio, a linha
     * fica em `enviando` para sempre. Passado o prazo, ela volta a ser
     * elegível — a mensagem atrasa, em vez de nunca mais sair.
     */
    reservadaEm: timestamp("reservada_em", { withTimezone: true }),
  },
  (t) => [
    index("notificacao_fila_idx").on(t.anfitriaoId, t.status, t.criadoEm),
    index("notificacao_referencia_idx").on(t.referenciaTipo, t.referenciaId),
    politicaAnfitriao("notificacao_isolamento"),
  ],
);
