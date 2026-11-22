/**
 * Telefone: guardado como veio, mostrado legível, discado só com dígitos.
 *
 * As três formas existem porque servem a coisas diferentes. O banco guarda o
 * que a pessoa digitou. A tela precisa de algo que a recepção consiga ler em
 * voz alta ao telefone. E o link do WhatsApp só aceita dígitos.
 */

/** Só os dígitos — é o que o wa.me e a API do WhatsApp aceitam. */
export function apenasDigitos(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

/**
 * Formata um número brasileiro para leitura: "(62) 98800-1004".
 *
 * O que não reconhece volta como veio, sem tentar adivinhar. Um número
 * estrangeiro mal formatado é melhor que um número brasileiro inventado a
 * partir dele — a Villa Peri recebe hóspede de fora.
 */
export function formatarTelefone(telefone: string | null): string | null {
  if (!telefone) return null;
  const d = apenasDigitos(telefone);

  // Com o 55 na frente, tira para formatar e devolve com o "+55".
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 ${formatarNacional(d.slice(2))}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 ${formatarNacional(d.slice(2))}`;
  }
  if (d.length === 11 || d.length === 10) return formatarNacional(d);

  return telefone;
}

/** DDD + 8 ou 9 dígitos. */
function formatarNacional(d: string): string {
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}
