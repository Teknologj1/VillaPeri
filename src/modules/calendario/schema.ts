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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { anfitriaoId, colunasBase, politicaAnfitriao } from "@/db/comum";
import {
  propriedade,
  tipoAcomodacao,
  unidade,
} from "@/modules/anfitriao/schema";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * De onde vem a indisponibilidade de uma noite. `limpeza` são as noites de
 * folga entre uma saída e a próxima entrada, quando a propriedade configura
 * intervalo: materializá-las aqui faz a mesma chave única protegê-las, em vez
 * de depender de toda consulta lembrar de descontar o intervalo.
 */
export const origemNoite = pgEnum("origem_noite", [
  "reserva",
  "bloqueio",
  "limpeza",
  "canal",
]);

export const motivoBloqueio = pgEnum("motivo_bloqueio", [
  "reforma",
  "uso_proprietario",
  "fechamento",
  "evento_privado",
  "outro",
]);

export const origemBloqueio = pgEnum("origem_bloqueio", ["manual", "canal"]);

// ---------------------------------------------------------------------------
// Noite ocupada — o centro do modelo
// ---------------------------------------------------------------------------

/**
 * Cada linha diz que a unidade X está indisponível na noite Y, e por quê.
 *
 * A chave única `(unidade_id, noite)` é o que torna overbooking impossível por
 * construção: gravar uma reserva é uma transação que insere N linhas, e se
 * duas reservas disputam a mesma noite a segunda falha inteira com 23505.
 *
 * Isso é uma garantia, não uma verificação. Consultar disponibilidade antes de
 * inserir serve para a interface explicar o que houve; não serve como defesa,
 * porque entre a consulta e a inserção cabe outra reserva.
 */
export const noiteOcupada = pgTable(
  "noite_ocupada",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidade.id),
    noite: date("noite", { mode: "string" }).notNull(),

    origem: origemNoite("origem").notNull(),
    /** Id da reserva, do bloqueio ou do evento de canal que gerou a linha. */
    origemId: uuid("origem_id").notNull(),

    /**
     * Preço desta noite e a regra que o produziu, copiados no momento da
     * confirmação. Mudar a tabela de tarifas depois não altera reserva
     * fechada.
     */
    precoCentavos: integer("preco_centavos"),
    regraTarifaId: uuid("regra_tarifa_id"),
  },
  (t) => [
    // A linha de defesa contra overbooking.
    uniqueIndex("noite_ocupada_unidade_noite").on(t.unidadeId, t.noite),
    index("noite_ocupada_origem_idx").on(t.origem, t.origemId),
    index("noite_ocupada_busca_idx").on(t.anfitriaoId, t.noite),
    check(
      "noite_ocupada_preco_so_de_reserva",
      sql`(origem = 'reserva') or (preco_centavos is null)`,
    ),
    politicaAnfitriao("noite_ocupada_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Datas fechadas
// ---------------------------------------------------------------------------

/**
 * Um período fechado, com escopo e motivo.
 *
 * O escopo é polimórfico mas sem coluna polimórfica: três referências
 * opcionais e um CHECK de que exatamente uma está preenchida. Assim cada
 * escopo tem chave estrangeira de verdade, e apagar um tipo não deixa
 * bloqueio órfão apontando para o vazio.
 *
 * `primeiraNoite` e `ultimaNoite` são ambas INCLUSIVAS, ao contrário da
 * reserva, que é aberta à direita. São nomes diferentes de propósito: quem
 * fecha a casa "de 10 a 15 para reforma" quer as noites 10 a 15, e reusar
 * `inicio`/`fim` com outra semântica é como se erra por um dia.
 */
export const bloqueio = pgTable(
  "bloqueio",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId(),

    propriedadeId: uuid("propriedade_id").references(() => propriedade.id),
    tipoId: uuid("tipo_id").references(() => tipoAcomodacao.id),
    unidadeId: uuid("unidade_id").references(() => unidade.id),

    primeiraNoite: date("primeira_noite", { mode: "string" }).notNull(),
    ultimaNoite: date("ultima_noite", { mode: "string" }).notNull(),

    motivo: motivoBloqueio("motivo").notNull(),
    observacao: text("observacao"),

    /**
     * Fechamento que se repete (ex.: toda terça fora da temporada) é uma regra
     * com repetição, não várias linhas lançadas à mão.
     * `{ diasDaSemana: [2] }` = toda terça dentro do período.
     */
    repeticao: jsonb("repeticao").$type<{ diasDaSemana: number[] } | null>(),

    origem: origemBloqueio("origem").notNull().default("manual"),
    /** Identificador do evento no calendário do canal (fase 2). */
    idExterno: text("id_externo"),
  },
  (t) => [
    check(
      "bloqueio_escopo_unico",
      sql`num_nonnulls(propriedade_id, tipo_id, unidade_id) = 1`,
    ),
    check("bloqueio_periodo_valido", sql`ultima_noite >= primeira_noite`),
    index("bloqueio_periodo_idx").on(t.anfitriaoId, t.primeiraNoite, t.ultimaNoite),
    politicaAnfitriao("bloqueio_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Regras de estadia
// ---------------------------------------------------------------------------

/**
 * Mínimo de diárias, dias de entrada, antecedência e companhia.
 *
 * Cada campo é opcional, e a resolução é **por campo**: para cada regra o
 * sistema pega o valor da regra mais específica que o define. Isso é
 * deliberado — o proprietário quer dizer "no réveillon o mínimo é 5" sem ter
 * de repetir janela, antecedência e dias de entrada que já valem para a casa
 * inteira o ano todo.
 *
 * Especificidade: unidade > tipo > propriedade. Empate resolve por
 * `prioridade` e, depois, pela vigência que começou mais tarde.
 */
export const regraEstadia = pgTable(
  "regra_estadia",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId(),

    propriedadeId: uuid("propriedade_id").references(() => propriedade.id),
    tipoId: uuid("tipo_id").references(() => tipoAcomodacao.id),
    unidadeId: uuid("unidade_id").references(() => unidade.id),

    nome: text("nome").notNull(),

    /** Nulo = sem limite de data nesse lado. */
    vigenciaInicio: date("vigencia_inicio", { mode: "string" }),
    vigenciaFim: date("vigencia_fim", { mode: "string" }),

    /**
     * Dias da semana em que a regra se aplica, pela NOITE DE ENTRADA.
     * Nulo = todos. `[5, 6]` = regra de fim de semana.
     */
    diasDaSemana: jsonb("dias_da_semana").$type<number[] | null>(),

    /** Menor número de noites aceito. Vale pela regra da noite de entrada. */
    minimoDiarias: integer("minimo_diarias"),
    maximoDiarias: integer("maximo_diarias"),

    /** Dias da semana em que o check-in é aceito. Nulo = todos. */
    diasDeEntrada: jsonb("dias_de_entrada").$type<number[] | null>(),

    /** Quanto antes da entrada a reserva ainda fecha. */
    antecedenciaMinimaHoras: integer("antecedencia_minima_horas"),
    /** Quanto à frente a agenda aceita reservas. */
    janelaMaximaDias: integer("janela_maxima_dias"),

    /**
     * Noites de folga entre uma saída e a próxima entrada.
     * 0 = mesma data (saída de manhã, entrada à tarde).
     */
    intervaloLimpezaNoites: integer("intervalo_limpeza_noites"),

    /**
     * Permite reservar um vão menor que o mínimo quando ele fecha exatamente
     * o buraco entre duas reservas — senão a noite solta nunca vende.
     */
    lacunaCurtaPermitida: boolean("lacuna_curta_permitida"),

    prioridade: integer("prioridade").notNull().default(0),
    ativa: boolean("ativa").notNull().default(true),
  },
  (t) => [
    check(
      "regra_estadia_escopo_unico",
      sql`num_nonnulls(propriedade_id, tipo_id, unidade_id) = 1`,
    ),
    check(
      "regra_estadia_vigencia_valida",
      sql`vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio`,
    ),
    index("regra_estadia_busca_idx").on(t.anfitriaoId, t.vigenciaInicio),
    politicaAnfitriao("regra_estadia_isolamento"),
  ],
);
