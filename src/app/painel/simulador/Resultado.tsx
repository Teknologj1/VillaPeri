import { withTenant } from "@/db/tenant";
import { type Noite, noitesDaEstadia } from "@/lib/data";
import { exigirSessao } from "@/lib/sessao";
import {
  buscarPropriedade,
  buscarTipoPorSlug,
  listarTipos,
} from "@/modules/anfitriao";
import { exigirPermissao } from "@/modules/autenticacao";
import { consultarDisponibilidade } from "@/modules/calendario";
import { SemTarifaError, orcarEstadia } from "@/modules/tarifas";

import {
  AvisoDeDisponibilidade,
  NoiteANoite,
  TotalDoOrcamento,
} from "../_componentes/Orcamento";

export type Parametros = {
  entrada: string;
  saida: string;
  adultos: number;
  criancas: number;
  tipoSlug?: string;
};

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-8 rounded-xl border border-vinho/30 bg-vinho/5 px-5 py-4 leading-relaxed text-vinho">
      {children}
    </p>
  );
}

export async function Resultado({ p }: { p: Parametros }) {
  const sessao = await exigirSessao();
  // Ver a tabela de tarifas é o mínimo para simular. Governança, que não vê
  // valores, não passa daqui.
  exigirPermissao(sessao, "tarifas", "ver");

  let noites: Noite[];
  try {
    noites = noitesDaEstadia(p.entrada, p.saida);
  } catch {
    return <Aviso>A saída precisa ser depois da entrada.</Aviso>;
  }

  return withTenant(sessao.anfitriaoId, async (tx) => {
    const propriedade = await buscarPropriedade(tx);
    const tipo = p.tipoSlug
      ? await buscarTipoPorSlug(tx, p.tipoSlug)
      : (await listarTipos(tx))[0];

    if (!tipo) return <Aviso>Nenhum tipo de acomodação cadastrado.</Aviso>;

    const disponibilidade = await consultarDisponibilidade(tx, {
      entrada: p.entrada,
      saida: p.saida,
      adultos: p.adultos,
      criancas: p.criancas,
      tipoId: tipo.id,
      // O painel já leu cabeçalhos em `exigirSessao()`.
    }, new Date());
    const oferta = disponibilidade.ofertas[0];

    let orcamento;
    try {
      orcamento = await orcarEstadia(tx, {
        noites,
        adultos: p.adultos,
        criancas: p.criancas,
        tipo: {
          id: tipo.id,
          modoPreco: tipo.modoPreco,
          ocupacaoBase: tipo.ocupacaoBase,
        },
        propriedadeId: propriedade.id,
        sinalPontosBase: propriedade.sinalPontosBase,
      });
    } catch (erro) {
      if (erro instanceof SemTarifaError) {
        return (
          <Aviso>
            Não há diária cadastrada para {erro.noites.length}{" "}
            {erro.noites.length === 1 ? "noite" : "noites"}:{" "}
            {erro.noites.join(", ")}. Cadastre a diária padrão antes de cotar.
          </Aviso>
        );
      }
      throw erro;
    }

    return (
      <div className="mt-10">
        <AvisoDeDisponibilidade
          disponivel={oferta?.disponivel ?? false}
          unidadesLivres={oferta?.unidadesLivres.length ?? 0}
          motivos={oferta?.motivos ?? []}
        />

        <h2 className="mt-10 font-display text-2xl">Noite a noite</h2>
        <p className="mt-2 text-sm text-tinta-suave">
          Cada linha mostra a regra que gerou o valor. É assim que se confere se
          a tabela está certa — e é a mesma explicação que a recepção dá ao
          hóspede.
        </p>
        <NoiteANoite orcamento={orcamento} />

        <h2 className="mt-10 font-display text-2xl">Total</h2>
        <TotalDoOrcamento
          orcamento={orcamento}
          ocupacaoBase={tipo.ocupacaoBase}
          sinalPontosBase={propriedade.sinalPontosBase}
        />

        {oferta && (
          <p className="mt-6 text-sm text-tinta-suave">
            Regras que valeram: mínimo de {oferta.regras.minimoDiarias}{" "}
            {oferta.regras.minimoDiarias === 1 ? "noite" : "noites"}
            {oferta.regras.procedencia.minimoDiarias !== "padrão" &&
              ` (${oferta.regras.procedencia.minimoDiarias.regraNome})`}
            {oferta.regras.intervaloLimpezaNoites > 0 &&
              ` · intervalo de limpeza de ${oferta.regras.intervaloLimpezaNoites} noite(s)`}
            .
          </p>
        )}
      </div>
    );
  });
}
