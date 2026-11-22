import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { anfitriao } from "@/modules/anfitriao/schema";
import { hospede, reserva } from "@/modules/reservas/schema";

// ---------------------------------------------------------------------------
// Chave de API
// ---------------------------------------------------------------------------

/**
 * A credencial de serviço da RIIA, uma por anfitrião (ou mais).
 *
 * O segredo NÃO é guardado: só o hash SHA-256. Quem invadir o banco leva
 * hashes, não chaves em uso — e o proprietário consegue ver que a chave
 * existe, quando foi usada por último e revogá-la, sem que ela esteja
 * legível em lugar nenhum depois do momento em que foi criada.
 *
 * O prefixo é a parte visível, guardada em claro: serve para achar a linha
 * numa comparação por índice, em vez de ter de hashear a chave recebida
 * contra todas as linhas da tabela.
 */
export const chaveApi = pgTable(
  "chave_api",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),

    nome: text("nome").notNull(),
    /** Os 8 primeiros caracteres, legíveis, para identificar a chave. */
    prefixo: text("prefixo").notNull(),
    /** SHA-256 do segredo, em hexadecimal. */
    hash: text("hash").notNull(),

    /** Nomes de ferramentas (veja `ferramentas.ts`). */
    escopos: jsonb("escopos").$type<string[]>().notNull().default([]),

    /** Teto da conta: 1 consulta, 2 pré-reserva, 3 reserva automática. */
    nivelAutonomia: integer("nivel_autonomia").notNull().default(1),

    /** Freio de requisições por minuto. */
    limitePorMinuto: integer("limite_por_minuto").notNull().default(60),

    validaAte: timestamp("valida_ate", { withTimezone: true }),
    revogadaEm: timestamp("revogada_em", { withTimezone: true }),
    ultimoUsoEm: timestamp("ultimo_uso_em", { withTimezone: true }),
  },
  (t) => [
    // O prefixo é único no sistema inteiro, não por anfitrião: a autenticação
    // acontece ANTES de saber de qual conta é a chave, então a busca não tem
    // contexto de anfitrião para filtrar.
    uniqueIndex("chave_api_prefixo_unico").on(t.prefixo),
    index("chave_api_anfitriao_idx").on(t.anfitriaoId),
    check(
      "chave_api_nivel_valido",
      sql`nivel_autonomia between 1 and 3`,
    ),
    politicaAnfitriao("chave_api_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Conversa
// ---------------------------------------------------------------------------

export const quemAtende = pgEnum("quem_atende", ["riia", "pessoa"]);

/**
 * A conversa do WhatsApp, pelo telefone.
 *
 * É o que liga o hóspede à reserva e à transferência para uma pessoa. O
 * telefone é a identidade: é por ele que `consultar_reserva` decide se quem
 * pergunta é o titular.
 */
export const conversa = pgTable(
  "conversa",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),

    /** Só dígitos, com código do país. */
    telefone: text("telefone").notNull(),
    nome: text("nome"),

    hospedeId: uuid("hospede_id").references(() => hospede.id),
    reservaId: uuid("reserva_id").references(() => reserva.id),

    resumo: text("resumo"),
    atendidaPor: quemAtende("atendida_por").notNull().default("riia"),
    ultimaMensagemEm: timestamp("ultima_mensagem_em", { withTimezone: true }),

    /** Transferência para a recepção: a tarefa que a especificação pede. */
    transferidaEm: timestamp("transferida_em", { withTimezone: true }),
    motivoTransferencia: text("motivo_transferencia"),
    assumidaPor: text("assumida_por"),
    assumidaEm: timestamp("assumida_em", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("conversa_telefone_unica").on(t.anfitriaoId, t.telefone),
    index("conversa_transferida_idx").on(t.anfitriaoId, t.transferidaEm),
    politicaAnfitriao("conversa_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Ação da RIIA
// ---------------------------------------------------------------------------

/**
 * Cada chamada de ferramenta, com o que entrou e o que saiu.
 *
 * Separada da auditoria geral porque o volume é outro e a pergunta é outra:
 * a auditoria responde "quem mudou o quê", isto responde "o que a RIIA fez na
 * conversa com este hóspede" — que é o que a recepção lê ao assumir um
 * atendimento transferido.
 */
export const acaoRiia = pgTable(
  "acao_riia",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    chaveApiId: uuid("chave_api_id").references(() => chaveApi.id),
    conversaId: uuid("conversa_id").references(() => conversa.id),

    ferramenta: text("ferramenta").notNull(),
    chaveIdempotencia: text("chave_idempotencia"),
    parametros: jsonb("parametros"),
    resultado: jsonb("resultado"),
    statusHttp: integer("status_http").notNull(),
  },
  (t) => [
    index("acao_riia_conversa_idx").on(t.conversaId, t.criadoEm),
    index("acao_riia_ferramenta_idx").on(t.anfitriaoId, t.ferramenta),
    politicaAnfitriao("acao_riia_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Webhook de saída
// ---------------------------------------------------------------------------

/**
 * Para onde o sistema manda os eventos.
 *
 * Na v1 a RIIA só responde a quem escreve; a partir da fase 2 ela usa estes
 * eventos para falar por conta própria. A tabela existe desde já porque
 * acrescentá-la depois obrigaria a mexer na drenagem da fila.
 */
export const webhookSaida = pgTable(
  "webhook_saida",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    nome: text("nome").notNull(),
    url: text("url").notNull(),
    /** Nomes de evento; vazio significa todos. */
    eventos: jsonb("eventos").$type<string[]>().notNull().default([]),
    /** Assina o corpo em HMAC-SHA256, como o enviador da RIIA. */
    segredo: text("segredo").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    ultimaEntregaEm: timestamp("ultima_entrega_em", { withTimezone: true }),
    ultimoErro: text("ultimo_erro"),
  },
  (t) => [
    index("webhook_saida_anfitriao_idx").on(t.anfitriaoId),
    politicaAnfitriao("webhook_saida_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Base de conhecimento
// ---------------------------------------------------------------------------

export const temaConhecimento = pgEnum("tema_conhecimento", [
  "politica",
  "passeio",
  "como_chegar",
  "pergunta_frequente",
  "a_casa",
]);

/**
 * O que a RIIA e o site respondem, da mesma fonte.
 *
 * Uma fonte só para os dois é o que impede a secretária de IA dizer uma coisa
 * e o site outra sobre o mesmo assunto — e o hóspede descobrir a diferença
 * justamente na hora da reclamação.
 */
export const baseConhecimento = pgTable(
  "base_conhecimento",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    tema: temaConhecimento("tema").notNull(),
    titulo: text("titulo").notNull(),
    texto: text("texto").notNull(),
    idioma: text("idioma").notNull().default("pt-BR"),
    /** Palavras que ajudam a achar o item sem busca semântica. */
    termos: jsonb("termos").$type<string[]>().notNull().default([]),
    publicado: boolean("publicado").notNull().default(true),
    ordem: integer("ordem").notNull().default(0),
  },
  (t) => [
    index("base_conhecimento_tema_idx").on(t.anfitriaoId, t.tema),
    uniqueIndex("base_conhecimento_titulo_unico").on(
      t.anfitriaoId,
      t.idioma,
      t.titulo,
    ),
    politicaAnfitriao("base_conhecimento_isolamento"),
  ],
);
