import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { anfitriaoId, colunasBase, politicaAnfitriao } from "@/db/comum";
import {
  anfitriao,
  tipoAcomodacao,
  unidade,
} from "@/modules/anfitriao/schema";
import { politicaCancelamento } from "@/modules/tarifas/schema";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Os status da reserva, na ordem da especificação. Cada mudança tem um
 * responsável, um efeito no calendário e algo que dispara em seguida.
 */
export const statusReserva = pgEnum("status_reserva", [
  "pre_reserva",
  "aguardando_aprovacao",
  "confirmada",
  "hospedado",
  "concluida",
  "cancelada",
  "no_show",
]);

/** De onde veio a reserva. Alimenta o relatório de receita por canal. */
export const canalReserva = pgEnum("canal_reserva", [
  "site",
  "riia",
  "whatsapp",
  "instagram",
  "indicacao",
  "balcao",
  "airbnb",
  "marketplace",
]);

export const statusSolicitacao = pgEnum("status_solicitacao", [
  "nova",
  "respondida",
  "convertida",
  "descartada",
]);

/**
 * Controle da Ficha Nacional de Registro de Hóspedes, obrigatória em formato
 * digital desde 20/04/2026. Três estados, como a especificação define.
 */
export const statusFnrh = pgEnum("status_fnrh", [
  "nao_enviada",
  "link_enviado",
  "preenchida",
  "conferida",
]);

export const tipoPagamento = pgEnum("tipo_pagamento", [
  "sinal",
  "saldo",
  "extra",
  "reembolso",
]);

export const metodoPagamento = pgEnum("metodo_pagamento", [
  "pix",
  "cartao",
  "dinheiro",
  "transferencia",
  "outro",
]);

// ---------------------------------------------------------------------------
// Hóspede
// ---------------------------------------------------------------------------

/**
 * A ficha do hóspede.
 *
 * Documento e contato são dados pessoais: pela matriz de perfis, só
 * Proprietário, Gerente e Recepção os veem, e cada abertura de ficha é
 * registrada (LGPD). A tabela guarda; quem filtra é o serviço.
 */
export const hospede = pgTable(
  "hospede",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),

    nome: text("nome").notNull(),
    documento: text("documento"),
    nascimento: date("nascimento", { mode: "string" }),
    nacionalidade: text("nacionalidade").default("Brasileira"),

    telefone: text("telefone"),
    email: text("email"),
    cidade: text("cidade"),
    uf: text("uf"),

    motivoViagem: text("motivo_viagem"),
    preferencias: text("preferencias"),
    /** Visível só para a equipe; nunca sai em resposta de API pública. */
    notasInternas: text("notas_internas"),

    aceiteLgpd: boolean("aceite_lgpd").notNull().default(false),
    aceiteLgpdEm: timestamp("aceite_lgpd_em", { withTimezone: true }),

    /** Hóspede que já voltou outras vezes. */
    recorrente: boolean("recorrente").notNull().default(false),
  },
  (t) => [
    index("hospede_nome_idx").on(t.anfitriaoId, t.nome),
    index("hospede_documento_idx").on(t.anfitriaoId, t.documento),
    index("hospede_telefone_idx").on(t.anfitriaoId, t.telefone),
    politicaAnfitriao("hospede_isolamento"),
  ],
);

/**
 * Registro de cada abertura de ficha com dado pessoal.
 *
 * "Cada abertura de ficha é registrada." Fica em tabela própria e não na
 * auditoria geral porque o volume é outro: a auditoria guarda mudanças, isto
 * guarda leituras, que são muito mais frequentes.
 */
export const acessoDadoPessoal = pgTable(
  "acesso_dado_pessoal",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    hospedeId: uuid("hospede_id")
      .notNull()
      .references(() => hospede.id),
    usuarioId: text("usuario_id"),
    motivo: text("motivo"),
    quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("acesso_hospede_idx").on(t.anfitriaoId, t.hospedeId),
    politicaAnfitriao("acesso_dado_pessoal_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Solicitação
// ---------------------------------------------------------------------------

/**
 * Um pedido vindo do site ou de outro canal, antes de virar reserva.
 *
 * NÃO segura noites, de propósito: a especificação decidiu assim para que
 * robôs e curiosos não travem o calendário. A recepção confere e converte em
 * pré-reserva, que aí sim segura.
 */
export const solicitacao = pgTable(
  "solicitacao",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),

    /** Código curto para o hóspede citar na conversa. */
    codigo: text("codigo").notNull(),

    nome: text("nome").notNull(),
    telefone: text("telefone"),
    email: text("email"),

    tipoId: uuid("tipo_id").references(() => tipoAcomodacao.id),
    entrada: date("entrada", { mode: "string" }).notNull(),
    saida: date("saida", { mode: "string" }).notNull(),
    adultos: integer("adultos").notNull().default(2),
    criancas: integer("criancas").notNull().default(0),

    /** O que o site mostrou ao visitante, para a recepção conferir. */
    totalCotadoCentavos: integer("total_cotado_centavos"),

    origem: canalReserva("origem").notNull().default("site"),
    status: statusSolicitacao("status").notNull().default("nova"),
    observacao: text("observacao"),
  },
  (t) => [
    uniqueIndex("solicitacao_codigo_unico").on(t.anfitriaoId, t.codigo),
    index("solicitacao_status_idx").on(t.anfitriaoId, t.status),
    check("solicitacao_periodo_valido", sql`saida > entrada`),
    politicaAnfitriao("solicitacao_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Reserva
// ---------------------------------------------------------------------------

export const reserva = pgTable(
  "reserva",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),

    codigo: text("codigo").notNull(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidade.id),
    tipoId: uuid("tipo_id")
      .notNull()
      .references(() => tipoAcomodacao.id),

    entrada: date("entrada", { mode: "string" }).notNull(),
    saida: date("saida", { mode: "string" }).notNull(),

    status: statusReserva("status").notNull().default("pre_reserva"),
    canal: canalReserva("canal").notNull().default("balcao"),

    hospedeId: uuid("hospede_id")
      .notNull()
      .references(() => hospede.id),
    adultos: integer("adultos").notNull().default(2),
    criancas: integer("criancas").notNull().default(0),

    /**
     * A cópia do preço do dia em que a reserva foi fechada, com a regra de
     * cada noite. Mudar a tabela de tarifas depois não mexe em reserva já
     * fechada — e, numa discussão, dá para mostrar exatamente de onde saiu
     * cada real.
     */
    orcamento: jsonb("orcamento").notNull(),
    totalCentavos: integer("total_centavos").notNull(),
    sinalCentavos: integer("sinal_centavos").notNull().default(0),

    /** Desconto concedido, em pontos-base, e quem aprovou se passou do limite. */
    descontoPontosBase: integer("desconto_pontos_base").notNull().default(0),
    aprovadoPor: text("aprovado_por"),
    aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),

    politicaCancelamentoId: uuid("politica_cancelamento_id").references(
      () => politicaCancelamento.id,
    ),

    fnrhStatus: statusFnrh("fnrh_status").notNull().default("nao_enviada"),
    /** Token do link público da ficha. Aleatório e com validade. */
    fnrhToken: text("fnrh_token"),
    fnrhExpiraEm: timestamp("fnrh_expira_em", { withTimezone: true }),

    horarioChegada: text("horario_chegada"),
    observacoes: text("observacoes"),

    solicitacaoId: uuid("solicitacao_id").references(() => solicitacao.id),

    /**
     * Quando a pré-reserva deixa de segurar as noites.
     *
     * Tratado como vencido NA LEITURA, não só pelo cron: tarefa agendada em
     * serverless tem granularidade e cota, e nenhuma regra de correção pode
     * depender de ela ter rodado no minuto certo.
     */
    expiraEm: timestamp("expira_em", { withTimezone: true }),

    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    motivoCancelamento: text("motivo_cancelamento"),
  },
  (t) => [
    uniqueIndex("reserva_codigo_unico").on(t.anfitriaoId, t.codigo),
    uniqueIndex("reserva_fnrh_token").on(t.fnrhToken),
    index("reserva_periodo_idx").on(t.anfitriaoId, t.entrada, t.saida),
    index("reserva_status_idx").on(t.anfitriaoId, t.status),
    index("reserva_hospede_idx").on(t.hospedeId),
    check("reserva_periodo_valido", sql`saida > entrada`),
    politicaAnfitriao("reserva_isolamento"),
  ],
);

/** Quem mais está na reserva além do titular. */
export const acompanhante = pgTable(
  "acompanhante",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    reservaId: uuid("reserva_id")
      .notNull()
      .references(() => reserva.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    documento: text("documento"),
    nascimento: date("nascimento", { mode: "string" }),
  },
  (t) => [
    index("acompanhante_reserva_idx").on(t.reservaId),
    politicaAnfitriao("acompanhante_isolamento"),
  ],
);

/** Extras cobrados, com o valor congelado no momento da reserva. */
export const reservaExtra = pgTable(
  "reserva_extra",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    reservaId: uuid("reserva_id")
      .notNull()
      .references(() => reserva.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    valorCentavos: integer("valor_centavos").notNull(),
  },
  (t) => [
    index("reserva_extra_idx").on(t.reservaId),
    politicaAnfitriao("reserva_extra_isolamento"),
  ],
);

/**
 * Pagamentos lançados. Na v1 é lançamento manual (Pix, cartão, dinheiro,
 * transferência); na fase 3 o provedor confirma por webhook e cai na mesma
 * tabela.
 */
export const pagamento = pgTable(
  "pagamento",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    reservaId: uuid("reserva_id")
      .notNull()
      .references(() => reserva.id),
    tipo: tipoPagamento("tipo").notNull(),
    /** Reembolso entra como valor NEGATIVO, para a soma ser a receita. */
    valorCentavos: integer("valor_centavos").notNull(),
    metodo: metodoPagamento("metodo").notNull(),
    data: date("data", { mode: "string" }).notNull(),
    comprovante: text("comprovante"),
    observacao: text("observacao"),
  },
  (t) => [
    index("pagamento_reserva_idx").on(t.reservaId),
    index("pagamento_data_idx").on(t.anfitriaoId, t.data),
    politicaAnfitriao("pagamento_isolamento"),
  ],
);
