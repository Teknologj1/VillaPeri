import { formatarReais } from "@/lib/dinheiro";
import { buscarPropriedade } from "@/modules/anfitriao";
import { PRECOS, REGRAS_DA_CASA } from "@/modules/conteudo";
import { buscarPoliticaPadrao } from "@/modules/tarifas";

import { semParametros } from "../_esquemas";
import { rota } from "../_nucleo";

/**
 * `obter_politicas` — horários, cancelamento, crianças, pets e café.
 *
 * Cada item vem com o número E a frase pronta. O número é para a RIIA
 * comparar; a frase é para ela repetir sem reescrever — e, reescrevendo, sem
 * mudar o sentido. Regra de hospedagem parafraseada por um modelo de
 * linguagem é a origem clássica de "mas a atendente me disse que podia".
 */
export const GET = rota({
  ferramenta: "obter_politicas",
  entrada: semParametros,
  deQuery: true,
  async executar(_d, ctx) {
    const propriedade = await buscarPropriedade(ctx.tx);
    const politica = await buscarPoliticaPadrao(ctx.tx);

    const checkin = propriedade.checkinPadrao.slice(0, 5);
    const checkout = propriedade.checkoutPadrao.slice(0, 5);
    const sinal = propriedade.sinalPontosBase / 100;

    return {
      horarios: {
        checkin,
        checkout,
        frase: `Check-in a partir das ${checkin} e check-out até as ${checkout}.`,
      },
      pagamento: {
        sinalPercentual: sinal,
        frase: `Sinal de ${sinal}% no ato da reserva; o restante no check-in.`,
      },
      cancelamento: {
        faixas: politica?.faixas ?? [],
        frase: politica
          ? faseDeCancelamento(politica.faixas)
          : "Política de cancelamento ainda não cadastrada; fale com a recepção.",
      },
      /**
       * A saída antecipada é pergunta frequente e tem resposta diferente do
       * cancelamento — por isso vem separada, com a razão junto. Sem a razão,
       * a RIIA repete uma negativa seca; com ela, explica por que a regra é
       * coerente: cancelamento exige antecedência, e quem vai embora antes
       * avisou com zero dias.
       */
      saidaAntecipada: {
        percentualDevolvido: (politica?.saidaAntecipadaPontosBase ?? 0) / 100,
        frase:
          (politica?.saidaAntecipadaPontosBase ?? 0) === 0
            ? "Em saída antecipada a estadia é cobrada por inteiro. A devolução " +
              "depende de cancelar com antecedência — quem já está hospedado e " +
              "decide ir embora antes não entra nesse prazo."
            : `Em saída antecipada devolvemos ${
                (politica?.saidaAntecipadaPontosBase ?? 0) / 100
              }% do valor das noites não usadas.`,
      },
      estadiaMinima: {
        noites: PRECOS.minimoNoites,
        noitesEmFeriado: PRECOS.minimoNoitesFeriado,
        frase: `Mínimo de ${PRECOS.minimoNoites} noites; em feriado prolongado, ${PRECOS.minimoNoitesFeriado}.`,
      },
      criancas: {
        idadeMinima: PRECOS.idadeMinimaCrianca,
        idadeMaxima: PRECOS.idadeMaximaCrianca,
        frase:
          `Recebemos crianças a partir de ${PRECOS.idadeMinimaCrianca} anos. ` +
          `De ${PRECOS.idadeMinimaCrianca} a ${PRECOS.idadeMaximaCrianca} anos pagam meia; ` +
          `acima disso, valor normal.`,
      },
      ocupacao: {
        base: PRECOS.ocupacaoBase,
        pessoaAdicionalCentavos: PRECOS.pessoaAdicionalCentavos,
        frase:
          `O preço é para até ${PRECOS.ocupacaoBase} pessoas; cada pessoa a mais custa ` +
          `${formatarReais(PRECOS.pessoaAdicionalCentavos)} por noite.`,
      },
      pets: {
        aceita: PRECOS.aceitaPets,
        frase: PRECOS.aceitaPets
          ? "Aceitamos pets."
          : "Infelizmente não temos disponibilidade para pets.",
      },
      regrasDaCasa: REGRAS_DA_CASA,
    };
  },
});

/**
 * A política de cancelamento numa frase.
 *
 * A faixa mais exigente que a antecedência alcança é a que vale, então a
 * frase precisa listar as faixas da maior antecedência para a menor — é a
 * ordem em que a pessoa pensa ("se eu cancelar com um mês...").
 */
function faseDeCancelamento(
  faixas: { diasAntes: number; percentualPontosBase: number }[],
): string {
  if (faixas.length === 0) return "Sem devolução prevista.";
  const ordenadas = [...faixas].sort((a, b) => b.diasAntes - a.diasAntes);
  const partes = ordenadas.map(
    (f) =>
      `cancelando com ${f.diasAntes} ${f.diasAntes === 1 ? "dia" : "dias"} ou mais de antecedência, ` +
      `devolvemos ${f.percentualPontosBase / 100}% do que foi pago`,
  );
  return `${partes.join("; ")}. Abaixo disso não há devolução, salvo caso de força maior.`;
}
