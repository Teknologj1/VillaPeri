import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  time,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  anfitriaoId,
  colunasBase,
  politicaAnfitriao,
  politicaAnfitriaoRaiz,
} from "@/db/comum";
import { PAPEL_APP } from "@/db/rls";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const statusAnfitriao = pgEnum("status_anfitriao", [
  "rascunho",
  "em_revisao",
  "ativa",
  "suspensa",
]);

export const cicloAssinatura = pgEnum("ciclo_assinatura", ["mensal", "anual"]);

export const statusCobranca = pgEnum("status_cobranca", [
  "ativa",
  "atrasada",
  "cancelada",
]);

/**
 * Como o tipo de acomodação cobra: um preço por noite independente de quantas
 * pessoas, ou preço de ocupação base mais valor por pessoa adicional.
 * É decisão por tipo, não do sistema (decisão 2 da especificação).
 */
export const modoPreco = pgEnum("modo_preco", ["acomodacao", "ocupacao"]);

/**
 * Módulos sobre os quais há permissão. Correspondem às linhas da matriz de
 * perfis da especificação.
 */
export const moduloSistema = pgEnum("modulo_sistema", [
  "calendario",
  "tarifas",
  "reservas",
  "hospedes",
  "checkin",
  "limpeza",
  "enxoval",
  "despesas",
  "relatorios",
  "usuarios",
  "auditoria",
]);

/**
 * Níveis da matriz: — (nenhum), V (ver), E (editar). `lancar` existe porque a
 * Recepção pode lançar despesas sem poder editar as já lançadas, o que a
 * matriz da especificação marca como "lançar".
 */
export const nivelPermissao = pgEnum("nivel_permissao", [
  "nenhum",
  "ver",
  "lancar",
  "editar",
]);

// ---------------------------------------------------------------------------
// Plataforma
// ---------------------------------------------------------------------------

/**
 * Planos da plataforma. Não pertence a nenhum anfitrião: é dado de referência,
 * compartilhado. Na v1 existe só para a Villa Peri usar o plano "Própria".
 *
 * Percentual em PONTOS-BASE (10% = 1000) e mensalidade em centavos.
 */
export const plano = pgTable(
  "plano",
  {
    ...colunasBase,
    nome: text("nome").notNull(),
    comissaoPontosBase: integer("comissao_pontos_base").notNull(),
    mensalidadeCentavos: integer("mensalidade_centavos").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
  },
  (t) => [
    uniqueIndex("plano_nome_unico").on(t.nome),
    // Dado de referência: a aplicação lê todos os planos, mas não escreve.
    // Escrita só pelo papel de migração (administrador da plataforma).
    pgPolicy("plano_leitura", {
      as: "permissive",
      for: "select",
      to: PAPEL_APP,
      using: sql`true`,
    }),
  ],
);

/**
 * A conta do anfitrião — a raiz do isolamento. Todo registro do sistema
 * pertence, direta ou indiretamente, a uma linha desta tabela.
 *
 * Na v1 existe uma só: a Villa Peri, no plano "Própria". A estrutura nasce
 * multi-anfitrião porque acrescentá-la depois obrigaria a reescrever o banco
 * e as telas.
 */
export const anfitriao = pgTable(
  "anfitriao",
  {
    ...colunasBase,
    nome: text("nome").notNull(),
    /** CPF ou CNPJ, só dígitos. */
    documento: text("documento"),
    /** Registro no Cadastur. Condição de entrada no marketplace (fase 4). */
    cadastur: text("cadastur"),
    status: statusAnfitriao("status").notNull().default("rascunho"),
    /** Identificador da conta no provedor de pagamento (fases 3 e 4). */
    contaRecebimento: text("conta_recebimento"),
  },
  (t) => [
    uniqueIndex("anfitriao_documento_unico").on(t.documento),
    politicaAnfitriaoRaiz("anfitriao_isolamento"),
  ],
);

/** Liga anfitrião e plano, guardando o histórico de trocas. */
export const assinatura = pgTable(
  "assinatura",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    planoId: uuid("plano_id")
      .notNull()
      .references(() => plano.id),
    // `mode: "string"` devolve YYYY-MM-DD, o mesmo formato do tipo `Noite`
    // em src/lib/data.ts. Um `Date` aqui reintroduziria horário e fuso numa
    // informação que é só dia.
    inicio: date("inicio", { mode: "string" }).notNull(),
    fim: date("fim", { mode: "string" }),
    ciclo: cicloAssinatura("ciclo").notNull().default("mensal"),
    statusCobranca: statusCobranca("status_cobranca").notNull().default("ativa"),
  },
  (t) => [
    index("assinatura_anfitriao_idx").on(t.anfitriaoId),
    politicaAnfitriao("assinatura_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Núcleo da operação
// ---------------------------------------------------------------------------

/** Um endereço, com o cadastro de turismo dele. */
export const propriedade = pgTable(
  "propriedade",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    nome: text("nome").notNull(),
    endereco: text("endereco"),
    cidade: text("cidade"),
    uf: text("uf"),
    /** Fuso em que "hoje" é resolvido para esta propriedade. */
    fuso: text("fuso").notNull().default("America/Sao_Paulo"),
    moeda: text("moeda").notNull().default("BRL"),
    checkinPadrao: time("checkin_padrao").notNull().default("14:00"),
    checkoutPadrao: time("checkout_padrao").notNull().default("12:00"),

    /**
     * Noites que contam como fim de semana para efeito de tarifa.
     * Padrão sexta e sábado; é configuração do proprietário, não constante.
     */
    diasFimDeSemana: jsonb("dias_fim_de_semana")
      .$type<number[]>()
      .notNull()
      .default([5, 6]),

    /**
     * Regras da casa, em texto. Alimentam o site e a RIIA pela mesma fonte —
     * se ficarem só no anúncio de um canal, a secretária de IA responde
     * errado quando o hóspede perguntar sobre festa, barulho ou som.
     */
    regrasDaCasa: jsonb("regras_da_casa").$type<string[]>().notNull().default([]),
  },
  (t) => [
    index("propriedade_anfitriao_idx").on(t.anfitriaoId),
    politicaAnfitriao("propriedade_isolamento"),
  ],
);

/**
 * Chalé, suíte ou quarto: o que o hóspede escolhe e o que tem preço.
 * Uma unidade física pertence a um tipo.
 */
export const tipoAcomodacao = pgTable(
  "tipo_acomodacao",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    propriedadeId: uuid("propriedade_id")
      .notNull()
      .references(() => propriedade.id),
    nome: text("nome").notNull(),
    /** Usado na URL do site: /acomodacoes/<slug>. */
    slug: text("slug").notNull(),
    descricao: text("descricao"),
    /** Máximo de pessoas que o tipo aceita. */
    capacidade: integer("capacidade").notNull(),
    /**
     * Os números que todo anúncio de hospedagem mostra. Ficam em colunas
     * próprias, e não soltos na descrição, porque o site os exibe em
     * destaque e os dados estruturados de SEO os declaram.
     */
    quartos: integer("quartos").notNull().default(1),
    camas: integer("camas").notNull().default(1),
    banheiros: integer("banheiros").notNull().default(1),
    modoPreco: modoPreco("modo_preco").notNull().default("acomodacao"),
    /** Ocupação já inclusa no preço base, quando o modo é por ocupação. */
    ocupacaoBase: integer("ocupacao_base").notNull().default(2),
    /** Idade até a qual a criança paga menos ou nada. */
    idadeCrianca: integer("idade_crianca").notNull().default(5),
    comodidades: jsonb("comodidades").$type<string[]>().notNull().default([]),
    /** Caminhos das fotos, na ordem de exibição. */
    fotos: jsonb("fotos").$type<string[]>().notNull().default([]),
    ativo: boolean("ativo").notNull().default(true),
  },
  (t) => [
    uniqueIndex("tipo_slug_unico").on(t.anfitriaoId, t.slug),
    index("tipo_propriedade_idx").on(t.propriedadeId),
    politicaAnfitriao("tipo_acomodacao_isolamento"),
  ],
);

/**
 * O quarto físico que recebe a reserva. É sobre a unidade — e não sobre o
 * tipo — que a chave única `(unidade, noite)` impede overbooking.
 */
export const unidade = pgTable(
  "unidade",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    tipoId: uuid("tipo_id")
      .notNull()
      .references(() => tipoAcomodacao.id),
    /** Nome ou número como a equipe se refere a ele: "Chalé 2", "Suíte Ipê". */
    nome: text("nome").notNull(),
    ativa: boolean("ativa").notNull().default(true),
  },
  (t) => [
    uniqueIndex("unidade_nome_unico").on(t.anfitriaoId, t.nome),
    index("unidade_tipo_idx").on(t.tipoId),
    politicaAnfitriao("unidade_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Perfis e permissões
// ---------------------------------------------------------------------------

/**
 * Perfil de acesso. "Perfis são dados, não código: criar um perfil novo
 * (ex.: Manutenção) é cadastrar permissões por módulo."
 */
export const perfil = pgTable(
  "perfil",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    nome: text("nome").notNull(),
    /** Perfis de sistema (os cinco da especificação) não podem ser apagados. */
    sistema: boolean("sistema").notNull().default(false),
    /**
     * Desconto que este perfil concede sozinho, em pontos-base.
     * Acima disso a reserva fica "aguardando aprovação".
     */
    descontoMaximoPontosBase: integer("desconto_maximo_pontos_base")
      .notNull()
      .default(0),
    /** Exige verificação em dois passos no login (obrigatório ao Proprietário). */
    exigeDoisFatores: boolean("exige_dois_fatores").notNull().default(false),
  },
  (t) => [
    uniqueIndex("perfil_nome_unico").on(t.anfitriaoId, t.nome),
    politicaAnfitriao("perfil_isolamento"),
  ],
);

/** Uma célula da matriz de perfis: o que um perfil pode num módulo. */
export const permissao = pgTable(
  "permissao",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    perfilId: uuid("perfil_id")
      .notNull()
      .references(() => perfil.id, { onDelete: "cascade" }),
    modulo: moduloSistema("modulo").notNull(),
    nivel: nivelPermissao("nivel").notNull().default("nenhum"),
    /**
     * As ressalvas que a matriz carrega em nota de rodapé, como
     * "só ocupação do dia" para a Governança no calendário.
     */
    observacao: text("observacao"),
  },
  (t) => [
    uniqueIndex("permissao_unica").on(t.perfilId, t.modulo),
    politicaAnfitriao("permissao_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Idempotência
// ---------------------------------------------------------------------------

/**
 * Respostas já produzidas para uma chave de idempotência.
 *
 * A RIIA repete uma chamada quando a conversa do WhatsApp reenvia a mesma
 * mensagem. Sem isto, "criar pré-reserva" viraria duas reservas.
 */
export const idempotencia = pgTable(
  "idempotencia",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    chave: text("chave").notNull(),
    rota: text("rota").notNull(),
    /** Hash do corpo: mesma chave com corpo diferente é conflito, não repetição. */
    hashRequisicao: text("hash_requisicao").notNull(),
    resposta: jsonb("resposta").notNull(),
    statusHttp: integer("status_http").notNull(),
  },
  (t) => [
    uniqueIndex("idempotencia_chave_unica").on(t.anfitriaoId, t.chave),
    politicaAnfitriao("idempotencia_isolamento"),
  ],
);
