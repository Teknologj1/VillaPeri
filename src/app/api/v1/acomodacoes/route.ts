import { buscarPropriedade, listarTipos } from "@/modules/anfitriao";
import { CASA, COMODIDADES, FOTOS_DESTAQUE, SUITES, caminhoFoto } from "@/modules/conteudo";

import { semParametros } from "../_esquemas";
import { rota } from "../_nucleo";

/**
 * `obter_acomodacoes` — descrição, capacidade, comodidades e fotos.
 *
 * As fotos saem como URL absoluta: a RIIA manda a imagem no WhatsApp, e um
 * caminho relativo não resolve fora do site.
 */
export const GET = rota({
  ferramenta: "obter_acomodacoes",
  entrada: semParametros,
  deQuery: true,
  async executar(_d, ctx) {
    const propriedade = await buscarPropriedade(ctx.tx);
    const tipos = await listarTipos(ctx.tx);
    const base = (process.env.NEXT_PUBLIC_URL_SITE ?? "").replace(/\/$/, "");

    return {
      casa: {
        nome: propriedade.nome,
        chamada: CASA.chamada,
        descricao: CASA.descricao,
        cidade: propriedade.cidade ?? CASA.cidade,
        uf: propriedade.uf ?? CASA.uf,
        capacidade: CASA.capacidade,
        quartos: CASA.quartos,
        camas: CASA.camas,
        banheiros: CASA.banheiros,
        // A casa é locada INTEIRA e exclusiva para uma única reserva: é a
        // primeira coisa que a RIIA tem de saber para não oferecer "um
        // quarto" a quem perguntar.
        locadaInteira: true,
      },
      tipos: tipos.map((t) => ({
        id: t.id,
        nome: t.nome,
        slug: t.slug,
        capacidade: t.capacidade,
        ocupacaoBase: t.ocupacaoBase,
        modoPreco: t.modoPreco,
      })),
      suites: SUITES.map((s) => ({
        nome: s.nome,
        capacidade: s.capacidade,
        descricao: s.descricao,
        destaques: s.destaques,
        camasCasal: s.camasCasal,
        camasSolteiro: s.camasSolteiro,
      })),
      comodidades: COMODIDADES,
      fotos: FOTOS_DESTAQUE.map((f) => ({
        url: `${base}${caminhoFoto(f)}`,
        descricao: f.alt,
      })),
    };
  },
});
