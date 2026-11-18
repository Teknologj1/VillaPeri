import { type Noite, diaDaSemana } from "@/lib/data";

/**
 * Uma regra de estadia como o motor a enxerga — sem depender do Drizzle, para
 * que o motor seja testável sem banco.
 */
export type RegraEstadia = {
  id: string;
  nome: string;
  propriedadeId: string | null;
  tipoId: string | null;
  unidadeId: string | null;
  vigenciaInicio: Noite | null;
  vigenciaFim: Noite | null;
  diasDaSemana: number[] | null;
  minimoDiarias: number | null;
  maximoDiarias: number | null;
  diasDeEntrada: number[] | null;
  antecedenciaMinimaHoras: number | null;
  janelaMaximaDias: number | null;
  intervaloLimpezaNoites: number | null;
  lacunaCurtaPermitida: boolean | null;
  prioridade: number;
  ativa: boolean;
};

/** De onde saiu cada valor resolvido, para o sistema poder explicar. */
export type Procedencia = { regraId: string; regraNome: string } | "padrão";

export type RegrasEfetivas = {
  minimoDiarias: number;
  maximoDiarias: number | null;
  /** `null` = todos os dias aceitam entrada. */
  diasDeEntrada: number[] | null;
  antecedenciaMinimaHoras: number;
  janelaMaximaDias: number;
  intervaloLimpezaNoites: number;
  lacunaCurtaPermitida: boolean;
  procedencia: {
    minimoDiarias: Procedencia;
    maximoDiarias: Procedencia;
    diasDeEntrada: Procedencia;
    antecedenciaMinimaHoras: Procedencia;
    janelaMaximaDias: Procedencia;
    intervaloLimpezaNoites: Procedencia;
    lacunaCurtaPermitida: Procedencia;
  };
};

/**
 * Valores quando nenhuma regra cadastrada define o campo. Propositalmente
 * permissivos: um sistema recém-instalado aceita reservas normais, em vez de
 * recusar tudo até o proprietário preencher a tabela.
 */
export const PADROES = {
  minimoDiarias: 1,
  maximoDiarias: null,
  diasDeEntrada: null,
  antecedenciaMinimaHoras: 0,
  janelaMaximaDias: 365,
  intervaloLimpezaNoites: 0,
  lacunaCurtaPermitida: false,
} as const;

export type Contexto = {
  /** A regra aplicável é sempre a que cobre a NOITE DE ENTRADA. */
  noiteEntrada: Noite;
  propriedadeId: string;
  tipoId: string;
  unidadeId?: string;
};

/** unidade > tipo > propriedade. */
function especificidade(r: RegraEstadia): number {
  if (r.unidadeId) return 3;
  if (r.tipoId) return 2;
  return 1;
}

function cobreEscopo(r: RegraEstadia, ctx: Contexto): boolean {
  if (r.unidadeId) return r.unidadeId === ctx.unidadeId;
  if (r.tipoId) return r.tipoId === ctx.tipoId;
  return r.propriedadeId === ctx.propriedadeId;
}

function cobreData(r: RegraEstadia, noite: Noite): boolean {
  if (r.vigenciaInicio && noite < r.vigenciaInicio) return false;
  if (r.vigenciaFim && noite > r.vigenciaFim) return false;
  if (r.diasDaSemana && !r.diasDaSemana.includes(diaDaSemana(noite))) return false;
  return true;
}

/**
 * As regras que valem para este contexto, da mais específica para a menos.
 *
 * Comparação de datas por string funciona porque `YYYY-MM-DD` ordena
 * lexicograficamente igual a cronologicamente — uma das razões de a noite ser
 * essa string e não um `Date`.
 */
export function regrasAplicaveis(
  regras: RegraEstadia[],
  ctx: Contexto,
): RegraEstadia[] {
  return regras
    .filter((r) => r.ativa && cobreEscopo(r, ctx) && cobreData(r, ctx.noiteEntrada))
    .sort((a, b) => {
      const esp = especificidade(b) - especificidade(a);
      if (esp !== 0) return esp;
      const pri = b.prioridade - a.prioridade;
      if (pri !== 0) return pri;
      // Vigência que começou mais tarde vence; "sem início" é a mais antiga.
      return (b.vigenciaInicio ?? "").localeCompare(a.vigenciaInicio ?? "");
    });
}

/**
 * Resolve as regras efetivas, **campo a campo**.
 *
 * Não é "a regra mais específica vence e pronto": para cada campo vale o valor
 * da regra mais específica que o define. Isso existe porque o proprietário
 * pensa em acréscimos — "no réveillon o mínimo é 5 noites" — e não quer ter de
 * repetir janela, antecedência e dias de entrada que já valem para a casa
 * inteira o ano todo. Com resolução por regra inteira, esquecer de repetir um
 * campo apagaria silenciosamente a regra geral naquele período.
 */
export function resolverRegras(
  regras: RegraEstadia[],
  ctx: Contexto,
): RegrasEfetivas {
  const candidatas = regrasAplicaveis(regras, ctx);

  function escolher<C extends keyof RegraEstadia>(
    campo: C,
  ): { valor: NonNullable<RegraEstadia[C]> | null; procedencia: Procedencia } {
    for (const r of candidatas) {
      const v = r[campo];
      if (v !== null && v !== undefined) {
        return {
          valor: v as NonNullable<RegraEstadia[C]>,
          procedencia: { regraId: r.id, regraNome: r.nome },
        };
      }
    }
    return { valor: null, procedencia: "padrão" };
  }

  const minimo = escolher("minimoDiarias");
  const maximo = escolher("maximoDiarias");
  const entrada = escolher("diasDeEntrada");
  const antecedencia = escolher("antecedenciaMinimaHoras");
  const janela = escolher("janelaMaximaDias");
  const intervalo = escolher("intervaloLimpezaNoites");
  const lacuna = escolher("lacunaCurtaPermitida");

  return {
    minimoDiarias: minimo.valor ?? PADROES.minimoDiarias,
    maximoDiarias: maximo.valor ?? PADROES.maximoDiarias,
    diasDeEntrada: entrada.valor ?? PADROES.diasDeEntrada,
    antecedenciaMinimaHoras:
      antecedencia.valor ?? PADROES.antecedenciaMinimaHoras,
    janelaMaximaDias: janela.valor ?? PADROES.janelaMaximaDias,
    intervaloLimpezaNoites: intervalo.valor ?? PADROES.intervaloLimpezaNoites,
    lacunaCurtaPermitida: lacuna.valor ?? PADROES.lacunaCurtaPermitida,
    procedencia: {
      minimoDiarias: minimo.procedencia,
      maximoDiarias: maximo.procedencia,
      diasDeEntrada: entrada.procedencia,
      antecedenciaMinimaHoras: antecedencia.procedencia,
      janelaMaximaDias: janela.procedencia,
      intervaloLimpezaNoites: intervalo.procedencia,
      lacunaCurtaPermitida: lacuna.procedencia,
    },
  };
}
