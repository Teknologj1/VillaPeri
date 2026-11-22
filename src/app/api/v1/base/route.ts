import { PIRENOPOLIS } from "@/modules/conteudo";
import { consultarBase } from "@/modules/riia";

import { buscaNaBase } from "../_esquemas";
import { rota } from "../_nucleo";

/**
 * `consultar_base_local` — passeios, como chegar e perguntas frequentes.
 *
 * Responde do que está CADASTRADO, nunca do que o modelo sabe. A RIIA
 * interpreta a pergunta; o conteúdo vem daqui. É o que impede a secretária de
 * recomendar uma cachoeira que fechou ou um restaurante que nunca existiu.
 *
 * Quando a base ainda não tem nada sobre o assunto, devolve o conteúdo do
 * site como fallback e diz que veio dele — para a RIIA saber que aquilo é
 * material geral, não resposta cadastrada.
 */
export const GET = rota({
  ferramenta: "consultar_base_local",
  entrada: buscaNaBase,
  deQuery: true,
  async executar(d, ctx) {
    const itens = await consultarBase(ctx.tx, {
      tema: d.tema,
      busca: d.busca,
    });

    return {
      busca: d.busca ?? null,
      tema: d.tema ?? null,
      itens: itens.map((i) => ({
        tema: i.tema,
        titulo: i.titulo,
        texto: i.texto,
      })),
      doSite:
        itens.length === 0
          ? { pirenopolis: PIRENOPOLIS }
          : null,
      // Dito em voz alta para a RIIA não preencher o vazio por conta própria.
      aviso:
        itens.length === 0
          ? "Nada cadastrado sobre isso. Use só o conteúdo devolvido; não complete com informação de fora."
          : null,
    };
  },
});
