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
