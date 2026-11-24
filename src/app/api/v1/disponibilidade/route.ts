import { noitesDaEstadia } from "@/lib/data";
import { buscarPropriedade, listarTipos } from "@/modules/anfitriao";
import { consultarDisponibilidade } from "@/modules/calendario";
import { SemTarifaError, orcarEstadia } from "@/modules/tarifas";

import { periodo } from "../_esquemas";
import { ErroDeFerramenta, rota } from "../_nucleo";

/**
 * `buscar_disponibilidade` — a ferramenta mais usada da RIIA.
 *
 * Devolve as opções com total, detalhe noite a noite e as regras aplicadas.
 * Sem oferta, devolve o MOTIVO estruturado em vez de um "não" seco: é com
 * ele que a RIIA explica ao hóspede o que impede, e é só assim que ela pode
 * oferecer a alternativa certa — "o mínimo nesse feriado é de 3 noites" leva
 * a uma contraproposta; "indisponível" encerra a conversa.
 *
 * O preço vem do mesmo motor do site e do painel. Não existe um segundo
 * cálculo em lugar nenhum, e é isso que faz os três nunca discordarem.
 */
export const POST = rota({
  ferramenta: "buscar_disponibilidade",
  entrada: periodo,
  async executar(d, ctx) {
    const noites = noitesDaEstadia(d.entrada, d.saida);
    const propriedade = await buscarPropriedade(ctx.tx);
    const tipo = (await listarTipos(ctx.tx))[0];

    if (!tipo) {
      throw new ErroDeFerramenta(
        503,
        "sem_acomodacao",
        "Nenhuma acomodação cadastrada nesta conta.",
      );
    }

    const disponibilidade = await consultarDisponibilidade(ctx.tx, {
      entrada: d.entrada,
      saida: d.saida,
      adultos: d.adultos,
      criancas: d.criancas,
      tipoId: tipo.id,
      // Rota de API: já é tempo de requisição por natureza.
    }, new Date());
    const oferta = disponibilidade.ofertas[0];

    let orcamento = null;
    let semTarifa: string[] | null = null;
    try {
      orcamento = await orcarEstadia(ctx.tx, {
        noites,
        adultos: d.adultos,
        criancas: d.criancas,
        tipo: {
          id: tipo.id,
          modoPreco: tipo.modoPreco,
          ocupacaoBase: tipo.ocupacaoBase,
        },
        propriedadeId: propriedade.id,
        sinalPontosBase: propriedade.sinalPontosBase,
      });
    } catch (e) {
      // Falta de tarifa é falha de cadastro, não resposta ao hóspede. A
      // disponibilidade ainda é informação útil, então a resposta sai com o
      // preço nulo e o motivo explícito, em vez de um 500 que a RIIA
      // traduziria como "o sistema caiu".
      if (e instanceof SemTarifaError) semTarifa = e.noites;
      else throw e;
    }

    return {
      entrada: d.entrada,
      saida: d.saida,
      noites: noites.length,
      pessoas: { adultos: d.adultos, criancas: d.criancas },
      disponivel: oferta?.disponivel ?? false,
      unidadesLivres: oferta?.unidadesLivres.length ?? 0,
      motivos: oferta?.motivos ?? [],
      regras: oferta
        ? {
            minimoDiarias: oferta.regras.minimoDiarias,
            maximoDiarias: oferta.regras.maximoDiarias,
            intervaloLimpezaNoites: oferta.regras.intervaloLimpezaNoites,
          }
        : null,
      preco: orcamento
        ? {
            totalCentavos: orcamento.totalCentavos,
            sinalCentavos: orcamento.sinalCentavos,
            saldoCentavos: orcamento.saldoCentavos,
            subtotalNoitesCentavos: orcamento.subtotalNoitesCentavos,
            adicionalOcupacaoCentavos: orcamento.adicionalOcupacaoCentavos,
            descontoEstadiaLongaCentavos:
              orcamento.descontoEstadiaLongaCentavos,
            noites: orcamento.noites.map((n) => ({
              noite: n.noite,
              precoCentavos: n.precoCentavos,
              regra: n.regraNome,
              feriado: n.feriado,
              fimDeSemana: n.ehFimDeSemana,
            })),
          }
        : null,
      semTarifaNestasNoites: semTarifa,
      acomodacao: {
        nome: tipo.nome,
        capacidade: tipo.capacidade,
        ocupacaoBase: tipo.ocupacaoBase,
      },
      checkin: propriedade.checkinPadrao.slice(0, 5),
      checkout: propriedade.checkoutPadrao.slice(0, 5),
    };
  },
});
