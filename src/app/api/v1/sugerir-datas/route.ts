import { listarTipos } from "@/modules/anfitriao";
import { sugerirDatas } from "@/modules/calendario";

import { sugestao } from "../_esquemas";
import { rota } from "../_nucleo";

/**
 * `sugerir_datas` — o que a RIIA oferece quando a data pedida não cabe.
 *
 * Procura alternando para frente e para trás a partir da data pedida, para
 * que a primeira sugestão seja a mais próxima: quem queria sexta aceita
 * quinta mais facilmente que a sexta do mês seguinte.
 */
export const POST = rota({
  ferramenta: "sugerir_datas",
  entrada: sugestao,
  async executar(d, ctx) {
    const tipo = (await listarTipos(ctx.tx))[0];

    const datas = await sugerirDatas(ctx.tx, {
      entrada: d.entrada,
      noites: d.noites,
      adultos: d.adultos,
      criancas: d.criancas,
      tipoId: tipo?.id,
      janelaDias: d.janelaDias,
    });

    return {
      pedida: { entrada: d.entrada, noites: d.noites },
      sugestoes: datas,
      // Dito explicitamente para a RIIA não inventar uma desculpa: pode não
      // haver nada livre na janela, e isso é uma resposta legítima.
      encontrou: datas.length > 0,
      janelaDias: d.janelaDias,
    };
  },
});
