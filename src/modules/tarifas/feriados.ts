import { type Noite, somarDias } from "@/lib/data";

export type AmbitoFeriado = "nacional" | "estadual" | "municipal" | "evento";

export type FeriadoGerado = {
  data: Noite;
  nome: string;
  ambito: AmbitoFeriado;
};

/**
 * Domingo de Páscoa do ano, pelo algoritmo gregoriano anônimo (Meeus/Butcher).
 *
 * É daqui que saem Carnaval, Sexta-feira Santa e Corpus Christi — os feriados
 * que mais mexem na tarifa e que mudam de data todo ano. Calcular é melhor que
 * tabelar: uma tabela chumbada começa a errar no primeiro ano não previsto, e
 * erra exatamente no feriado mais caro.
 */
export function domingoDePascoa(ano: number): Noite {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;

  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Feriados nacionais de data fixa. */
const FIXOS: { mesDia: string; nome: string }[] = [
  { mesDia: "01-01", nome: "Confraternização Universal" },
  { mesDia: "04-21", nome: "Tiradentes" },
  { mesDia: "05-01", nome: "Dia do Trabalho" },
  { mesDia: "09-07", nome: "Independência do Brasil" },
  { mesDia: "10-12", nome: "Nossa Senhora Aparecida" },
  { mesDia: "11-02", nome: "Finados" },
  { mesDia: "11-15", nome: "Proclamação da República" },
  // Feriado nacional desde a Lei 14.759/2023.
  { mesDia: "11-20", nome: "Consciência Negra" },
  { mesDia: "12-25", nome: "Natal" },
];

/** Deslocamentos em dias a partir do Domingo de Páscoa. */
const MOVEIS: { desloc: number; nome: string }[] = [
  { desloc: -48, nome: "Carnaval (segunda)" },
  { desloc: -47, nome: "Carnaval (terça)" },
  { desloc: -46, nome: "Quarta-feira de Cinzas" },
  { desloc: -2, nome: "Sexta-feira Santa" },
  { desloc: 60, nome: "Corpus Christi" },
];

/**
 * Os feriados nacionais do ano, fixos e móveis.
 *
 * NÃO inclui feriados municipais nem eventos locais. A Festa do Divino de
 * Pirenópolis, com as Cavalhadas, cai em Pentecostes e é o período de maior
 * demanda da cidade — mas a especificação deixa claro que esses o proprietário
 * cadastra e confirma a cada ano, porque a data efetiva da festa e dos dias
 * de folga do município não sai de fórmula.
 */
export function feriadosNacionais(ano: number): FeriadoGerado[] {
  const pascoa = domingoDePascoa(ano);

  const fixos = FIXOS.map((f) => ({
    data: `${ano}-${f.mesDia}`,
    nome: f.nome,
    ambito: "nacional" as const,
  }));

  const moveis = MOVEIS.map((m) => ({
    data: somarDias(pascoa, m.desloc),
    nome: m.nome,
    ambito: "nacional" as const,
  }));

  return [...fixos, ...moveis, { data: pascoa, nome: "Páscoa", ambito: "nacional" as const }].sort(
    (a, b) => a.data.localeCompare(b.data),
  );
}

export type PeriodoEspecial = {
  nome: string;
  /** Primeira noite coberta. */
  inicio: Noite;
  /** Última noite coberta. */
  fim: Noite;
};

/**
 * Os períodos de pico que têm preço próprio: réveillon e Carnaval.
 *
 * São intervalos, não dias soltos — ninguém reserva só a noite de 31. O
 * réveillon é fixo no calendário; o Carnaval é móvel e sai da Páscoa, como os
 * feriados, o que evita cadastrar à mão todo ano.
 *
 * Os limites são a melhor leitura do que o proprietário chamou de "réveillon e
 * Carnaval"; se a casa cobra o período maior ou menor, é mudar aqui — as
 * regras são dado, e a vigência de cada uma é editável no painel.
 */
export function periodosEspeciais(ano: number): PeriodoEspecial[] {
  const pascoa = domingoDePascoa(ano);

  return [
    {
      // Da véspera do fim de ano até a virada, atravessando o Ano-Novo.
      nome: `Réveillon ${ano}/${ano + 1}`,
      inicio: `${ano}-12-28`,
      fim: `${ano + 1}-01-02`,
    },
    {
      // Da sexta que abre o feriado à Quarta-feira de Cinzas.
      // Carnaval (terça) é Páscoa − 47; a sexta anterior, − 51.
      nome: `Carnaval ${ano}`,
      inicio: somarDias(pascoa, -51),
      fim: somarDias(pascoa, -46),
    },
  ];
}

/** Os feriados de um intervalo de anos, para popular a tabela de uma vez. */
export function feriadosNoPeriodo(
  anoInicial: number,
  anoFinal: number,
): FeriadoGerado[] {
  const todos: FeriadoGerado[] = [];
  for (let ano = anoInicial; ano <= anoFinal; ano++) {
    todos.push(...feriadosNacionais(ano));
  }
  return todos;
}
