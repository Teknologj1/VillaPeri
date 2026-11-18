/**
 * Datas do calendário de hospedagem.
 *
 * Uma noite é uma data sem horário, representada como a string `YYYY-MM-DD`.
 * Não é `Date`: um `Date` carrega horário e fuso, e a noite de 20/12 tem de ser
 * a noite de 20/12 em qualquer servidor, em qualquer região.
 *
 * Toda a aritmética roda em UTC. Não porque as datas sejam UTC — elas não têm
 * fuso nenhum —, mas porque UTC não tem horário de verão: somar um dia nunca
 * cai em 23h ou 25h e nunca pula uma noite.
 */

/** Uma noite do calendário, no formato `YYYY-MM-DD`. */
export type Noite = string;

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

function paraUtc(noite: Noite): Date {
  if (!FORMATO.test(noite)) {
    throw new Error(`Noite inválida: "${noite}". Esperado YYYY-MM-DD.`);
  }
  const data = new Date(`${noite}T00:00:00Z`);
  if (Number.isNaN(data.getTime())) {
    throw new Error(`Noite inválida: "${noite}".`);
  }
  return data;
}

function paraNoite(data: Date): Noite {
  return data.toISOString().slice(0, 10);
}

const MS_POR_DIA = 86_400_000;

/**
 * A data de hoje no fuso da propriedade.
 *
 * O fuso é obrigatório de propósito. `new Date()` no servidor devolve UTC, e a
 * Villa Peri fica em UTC−3: entre 21h e meia-noite em Pirenópolis o servidor já
 * virou o dia. Usar a data do servidor faria a lista "Hoje na casa" mostrar as
 * chegadas de amanhã durante toda a noite — justamente no horário em que a
 * recepção mais usa a tela.
 */
export function hojeNaPropriedade(fuso: string, agora: Date = new Date()): Noite {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);

  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
  const ano = parte("year");
  const mes = parte("month");
  const dia = parte("day");

  if (!ano || !mes || !dia) {
    throw new Error(`Não foi possível resolver a data no fuso "${fuso}".`);
  }
  return `${ano}-${mes}-${dia}`;
}

/** Soma (ou subtrai, com valor negativo) dias a uma noite. */
export function somarDias(noite: Noite, dias: number): Noite {
  return paraNoite(new Date(paraUtc(noite).getTime() + dias * MS_POR_DIA));
}

/** Quantidade de dias de `de` até `ate`. Negativo se `ate` for anterior. */
export function diferencaEmDias(de: Noite, ate: Noite): number {
  return Math.round((paraUtc(ate).getTime() - paraUtc(de).getTime()) / MS_POR_DIA);
}

/**
 * As noites que uma estadia ocupa — intervalo **aberto à direita**.
 *
 * Entrada 10 e saída 13 ocupam as noites 10, 11 e 12. A noite do check-out
 * fica livre para a próxima entrada, que é o que permite saída de manhã e
 * entrada à tarde no mesmo dia sem o calendário acusar conflito.
 */
export function noitesDaEstadia(entrada: Noite, saida: Noite): Noite[] {
  const total = diferencaEmDias(entrada, saida);
  if (total <= 0) {
    throw new Error(
      `A saída (${saida}) tem de ser depois da entrada (${entrada}): uma estadia ocupa ao menos uma noite.`,
    );
  }
  return Array.from({ length: total }, (_, i) => somarDias(entrada, i));
}

/** Dia da semana da noite: 0 = domingo … 6 = sábado. */
export function diaDaSemana(noite: Noite): number {
  return paraUtc(noite).getUTCDay();
}

/**
 * Se a noite conta como fim de semana para efeito de tarifa.
 *
 * "Fim de semana" é configuração do proprietário, não constante: o padrão da
 * especificação é sexta e sábado (as noites de sexta para sábado e de sábado
 * para domingo), mas a lista é editável.
 */
export const FIM_DE_SEMANA_PADRAO = [5, 6] as const;

export function ehNoiteDeFimDeSemana(
  noite: Noite,
  diasDeFimDeSemana: readonly number[] = FIM_DE_SEMANA_PADRAO,
): boolean {
  return diasDeFimDeSemana.includes(diaDaSemana(noite));
}

/** Valida e normaliza uma string recebida de fora como noite. */
export function comoNoite(valor: string): Noite {
  paraUtc(valor);
  return valor;
}
