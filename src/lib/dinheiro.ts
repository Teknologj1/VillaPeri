/**
 * Dinheiro, sempre em centavos e sempre inteiro.
 *
 * Nenhum valor monetário do sistema é float. `0.1 + 0.2 !== 0.3` em ponto
 * flutuante, e numa diária de feriado isso vira diferença de centavo entre o
 * que o site cotou, o que o simulador mostrou e o que a reserva gravou — que é
 * exatamente o que o portão da Fase 1A proíbe.
 */

/**
 * Arredonda para centavo inteiro, meio para cima em valor absoluto:
 * 2,5 → 3 e −2,5 → −3.
 *
 * Existe uma única função de arredondamento no sistema de propósito. Espalhar
 * `Math.round` pelo código é como as três superfícies acabam discordando em
 * um centavo: `Math.round(-2.5)` em JavaScript é −2, não −3.
 */
export function arredondarCentavos(valor: number): number {
  if (!Number.isFinite(valor)) {
    throw new Error(`Valor monetário inválido: ${valor}`);
  }
  return Math.sign(valor) * Math.round(Math.abs(valor));
}

/**
 * Aplica um ajuste percentual sobre um valor em centavos.
 * `aplicarPercentual(10000, 15)` = 1500 (15% de R$ 100,00).
 */
export function aplicarPercentual(centavos: number, percentual: number): number {
  return arredondarCentavos((centavos * percentual) / 100);
}

/**
 * Soma um ajuste percentual ao próprio valor.
 * `ajustar(10000, 20)` = 12000 — a regra de feriado "20% sobre a base".
 * Percentual negativo desconta.
 */
export function ajustar(centavos: number, percentual: number): number {
  return centavos + aplicarPercentual(centavos, percentual);
}

/** Formata para exibição em português: 123456 → "R$ 1.234,56". */
export function formatarReais(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

/**
 * O caminho de volta: o que a pessoa digitou, em centavos inteiros.
 *
 * Aceita as duas escritas que aparecem de verdade — "1.234,56", do teclado
 * brasileiro, e "1234.56", de quem copia de planilha — e devolve `null` para
 * o que não é valor, em vez de um `NaN` que seguiria adiante e gravaria lixo.
 *
 * Monta o inteiro pelos pedaços e nunca por float: `parseFloat("0.07") * 100`
 * dá 7.000000000000001, e um centavo errado por lançamento vira discussão no
 * fechamento do mês.
 */
export function centavosDeTexto(texto: string): number | null {
  const limpo = texto.replace(/\s|R\$/g, "");
  if (limpo === "" || limpo === "-") return null;

  // Só trata como escrita brasileira quando o ponto está de fato separando
  // milhares. "1.5" é um e meio para quem copiou de planilha, não mil e
  // quinhentos — e tratar os dois casos pela mesma regra erraria um deles.
  const comMilhar = /^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(limpo);
  const comVirgula = limpo.includes(",");
  const normalizado = comMilhar
    ? limpo.replace(/\./g, "").replace(",", ".")
    : comVirgula
      ? limpo.replace(",", ".")
      : limpo;

  if (!/^-?\d+(\.\d{1,2})?$/.test(normalizado)) return null;

  const negativo = normalizado.startsWith("-");
  const [inteira = "0", decimal = ""] = normalizado.replace("-", "").split(".");
  const centavos = Number(inteira) * 100 + Number(decimal.padEnd(2, "0"));
  return negativo ? -centavos : centavos;
}
