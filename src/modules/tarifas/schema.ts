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
 * A pilha de prioridade das tarifas. A ordem aqui É a regra de negócio:
 * `especial` vence `feriado`, que vence `temporada`, que vence `padrao`.
 */
export const nivelTarifa = pgEnum("nivel_tarifa", [
  "especial",
  "feriado",
  "temporada",
  "padrao",
]);

export const ambitoFeriado = pgEnum("ambito_feriado", [
  "nacional",
  "estadual",
  "municipal",
  "evento",
]);

/** Como um extra é cobrado. */
export const cobrancaExtra = pgEnum("cobranca_extra", [
  "estadia",
  "noite",
  "pessoa",
  "pessoa_noite",
]);

export const tipoDesconto = pgEnum("tipo_desconto", ["percentual", "valor"]);

// ---------------------------------------------------------------------------
// Tarifa
// ---------------------------------------------------------------------------

/**
 * Uma regra de preço. O valor de cada noite sai da regra mais específica que
 * a cobre, e o sistema sempre guarda QUAL regra gerou o valor — o painel
 * mostra, o site mostra, e a RIIA explica sem inventar.
 *
 * Preço fixo e ajuste percentual são excludentes: `preco_fixo_centavos` manda
 * o valor da noite, `ajuste_pontos_base` mexe em cima do preço que a
 * temporada ou a diária padrão produziriam.
 */
export const regraTarifa = pgTable(
  "regra_tarifa",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId(),

    propriedadeId: uuid("propriedade_id").references(() => propriedade.id),
    tipoId: uuid("tipo_id").references(() => tipoAcomodacao.id),
    unidadeId: uuid("unidade_id").references(() => unidade.id),

    nome: text("nome").notNull(),
    nivel: nivelTarifa("nivel").notNull(),

    vigenciaInicio: date("vigencia_inicio", { mode: "string" }),
    vigenciaFim: date("vigencia_fim", { mode: "string" }),

    /** Preço base, nos níveis `temporada` e `padrao`. */
    precoSemanaCentavos: integer("preco_semana_centavos"),
    precoFimDeSemanaCentavos: integer("preco_fim_de_semana_centavos"),

    /** Nos níveis `especial` e `feriado`: um OU outro, nunca os dois. */
    precoFixoCentavos: integer("preco_fixo_centavos"),
    ajustePontosBase: integer("ajuste_pontos_base"),

    /** Modo por ocupação: cobrança por pessoa além da ocupação base. */
    valorPessoaExtraCentavos: integer("valor_pessoa_extra_centavos"),
    valorCriancaCentavos: integer("valor_crianca_centavos"),

    /** Feriado: a regra vale também na noite da véspera. */
    aplicaNaVespera: boolean("aplica_na_vespera").notNull().default(false),

    prioridade: integer("prioridade").notNull().default(0),
    ativa: boolean("ativa").notNull().default(true),
  },
  (t) => [
    check(
      "regra_tarifa_escopo_unico",
      sql`num_nonnulls(propriedade_id, tipo_id, unidade_id) = 1`,
    ),
    check(
      "regra_tarifa_preco_ou_ajuste",
      sql`not (preco_fixo_centavos is not null and ajuste_pontos_base is not null)`,
    ),
    index("regra_tarifa_busca_idx").on(t.anfitriaoId, t.nivel, t.vigenciaInicio),
    politicaAnfitriao("regra_tarifa_isolamento"),
  ],
);

/**
 * Feriados e eventos locais. Os nacionais fixos e móveis são gerados pelo
 * sistema; municipais e eventos de Pirenópolis — a Festa do Divino, com as
 * Cavalhadas — o proprietário cadastra e confirma a cada ano, porque a data
 * efetiva não sai de fórmula.
 */
export const feriado = pgTable(
  "feriado",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId(),
    data: date("data", { mode: "string" }).notNull(),
    nome: text("nome").notNull(),
    ambito: ambitoFeriado("ambito").notNull().default("nacional"),
    /** Se a noite da véspera também conta como feriado para a tarifa. */
    valeNaVespera: boolean("vale_na_vespera").notNull().default(false),
  },
  (t) => [
    uniqueIndex("feriado_unico").on(t.anfitriaoId, t.data, t.nome),
    index("feriado_data_idx").on(t.anfitriaoId, t.data),
    politicaAnfitriao("feriado_isolamento"),
  ],
);

// ---------------------------------------------------------------------------
// Extras, descontos e cancelamento
// ---------------------------------------------------------------------------

/** Café da manhã, pet, cama extra, taxa de limpeza. */
export const extra = pgTable(
  "extra",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId(),
    /** Nulo = vale para todos os tipos. */
    tipoId: uuid("tipo_id").references(() => tipoAcomodacao.id),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    valorCentavos: integer("valor_centavos").notNull(),
    cobranca: cobrancaExtra("cobranca").notNull(),
    /** Cobrado sempre, sem o hóspede escolher (ex.: taxa de limpeza). */
    obrigatorio: boolean("obrigatorio").notNull().default(false),
    ativo: boolean("ativo").notNull().default(true),
  },
  (t) => [
    index("extra_anfitriao_idx").on(t.anfitriaoId),
    politicaAnfitriao("extra_isolamento"),
  ],
);

/** Desconto por estadia longa, a partir de um número de noites. */
export const descontoEstadiaLonga = pgTable(
  "desconto_estadia_longa",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId(),
    tipoId: uuid("tipo_id").references(() => tipoAcomodacao.id),
    noitesMinimas: integer("noites_minimas").notNull(),
    percentualPontosBase: integer("percentual_pontos_base").notNull(),
    ativo: boolean("ativo").notNull().default(true),
  },
  (t) => [
    index("desconto_longa_idx").on(t.anfitriaoId, t.noitesMinimas),
    politicaAnfitriao("desconto_estadia_longa_isolamento"),
  ],
);

export const cupom = pgTable(
  "cupom",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId(),
    codigo: text("codigo").notNull(),
    tipo: tipoDesconto("tipo").notNull(),
    /** Pontos-base se percentual; centavos se valor. */
    valor: integer("valor").notNull(),
    vigenciaInicio: date("vigencia_inicio", { mode: "string" }),
    vigenciaFim: date("vigencia_fim", { mode: "string" }),
    minimoNoites: integer("minimo_noites"),
    usoMaximo: integer("uso_maximo"),
    usos: integer("usos").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
  },
  (t) => [
    uniqueIndex("cupom_codigo_unico").on(t.anfitriaoId, t.codigo),
    politicaAnfitriao("cupom_isolamento"),
  ],
);

/**
 * Faixas de antecedência com o percentual devolvido.
 *
 * `[{ diasAntes: 30, percentualPontosBase: 10000 }, { diasAntes: 7, percentualPontosBase: 5000 }]`
 * = devolve tudo com 30 dias ou mais, metade com 7 a 29, nada com menos.
 */
export type FaixaCancelamento = {
  diasAntes: number;
  percentualPontosBase: number;
};

export const politicaCancelamento = pgTable(
  "politica_cancelamento",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId(),
    nome: text("nome").notNull(),
    faixas: jsonb("faixas").$type<FaixaCancelamento[]>().notNull(),
    /**
     * Política específica de feriados e períodos especiais, que a
     * especificação prevê ser diferente da comum.
     */
    paraPeriodoEspecial: boolean("para_periodo_especial").notNull().default(false),
    padrao: boolean("padrao").notNull().default(false),
  },
  (t) => [
    uniqueIndex("politica_nome_unico").on(t.anfitriaoId, t.nome),
    politicaAnfitriao("politica_cancelamento_isolamento"),
  ],
);
