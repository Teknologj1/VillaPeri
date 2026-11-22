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

// ---------------------------------------------------------------------------
// Como a data aparece na tela
// ---------------------------------------------------------------------------

const MES_CURTO = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/**
 * A noite em dia/mês/ano, como se escreve no Brasil.
 *
 * Feito à mão em vez de `Intl` ou `toLocaleDateString` porque a noite é uma
 * string sem fuso: passá-la por `new Date()` e formatar no fuso do servidor
 * devolve o dia anterior em qualquer fuso a oeste de Greenwich. Aqui os
 * pedaços da string são recortados e não há conversão nenhuma para errar.
 */
export function formatarNoite(noite: Noite, comAno = true): string {
  const [ano, mes, dia] = noite.split("-");
  return comAno ? `${dia}/${mes}/${ano}` : `${dia}/${mes}`;
}

/** "sex, 11 dez" — para listas em que o dia da semana importa. */
export function formatarNoiteCurta(noite: Noite): string {
  const [, mes, dia] = noite.split("-");
  const semana = DIA_CURTO[diaDaSemana(noite)];
  return `${semana}, ${dia} ${MES_CURTO[Number(mes) - 1]}`;
}

/** "11/12/2026 a 14/12/2026 · 3 noites" */
export function formatarPeriodo(entrada: Noite, saida: Noite): string {
  const n = noitesDaEstadia(entrada, saida).length;
  return `${formatarNoite(entrada)} a ${formatarNoite(saida)} · ${n} ${
    n === 1 ? "noite" : "noites"
  }`;
}

/** Data e hora no fuso da propriedade, para registros de auditoria. */
export function formatarInstante(instante: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instante);
}

/** Deslocamento do fuso, em minutos, no instante dado. */
function deslocamentoEmMinutos(fuso: string, instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);

  const valor = (tipo: string) => {
    const p = partes.find((x) => x.type === tipo)?.value;
    if (p === undefined) throw new Error(`Fuso inválido: "${fuso}".`);
    return Number(p);
  };

  const comoSeFosseUtc = Date.UTC(
    valor("year"),
    valor("month") - 1,
    valor("day"),
    valor("hour") % 24, // meia-noite sai como "24" em alguns ambientes
    valor("minute"),
    valor("second"),
  );
  return (comoSeFosseUtc - instante.getTime()) / 60_000;
}

/**
 * O instante exato em que uma hora de uma data acontece no fuso da
 * propriedade. `instanteNaPropriedade("2026-12-11", "14:00", "America/Sao_Paulo")`
 * é o check-in das 14h daquele dia, como ponto na linha do tempo.
 *
 * Duas passadas porque a primeira estima o deslocamento no instante errado:
 * em fuso com horário de verão, o deslocamento muda conforme a data. O Brasil
 * não tem mais horário de verão, mas o sistema nasce multi-anfitrião e não
 * custa estar certo em qualquer fuso.
 */
export function instanteNaPropriedade(
  noite: Noite,
  hora: string,
  fuso: string,
): Date {
  const [h = "0", m = "0"] = hora.split(":");
  const base = Date.parse(
    `${noite}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00Z`,
  );
  if (Number.isNaN(base)) {
    throw new Error(`Data ou hora inválida: "${noite}" "${hora}".`);
  }

  let instante = new Date(base - deslocamentoEmMinutos(fuso, new Date(base)) * 60_000);
  instante = new Date(base - deslocamentoEmMinutos(fuso, instante) * 60_000);
  return instante;
}

/**
 * Horas de `agora` até o check-in da data de entrada. Negativo se já passou.
 *
 * É o que a regra de antecedência mínima compara: "reserva para o mesmo dia
 * só até certo horário" depende do horário de check-in da casa, não da
 * meia-noite.
 */
export function horasAteCheckin(
  entrada: Noite,
  horaCheckin: string,
  fuso: string,
  agora: Date = new Date(),
): number {
  const checkin = instanteNaPropriedade(entrada, horaCheckin, fuso);
  return (checkin.getTime() - agora.getTime()) / 3_600_000;
}
