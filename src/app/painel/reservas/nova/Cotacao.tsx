import { withTenant } from "@/db/tenant";
import { type Noite, formatarPeriodo, noitesDaEstadia } from "@/lib/data";
import { exigirSessao } from "@/lib/sessao";
import {
  buscarPropriedade,
  listarTipos,
  listarUnidadesAtivas,
} from "@/modules/anfitriao";
import { podeNoModulo } from "@/modules/autenticacao";
import { consultarDisponibilidade } from "@/modules/calendario";
import { buscarSolicitacao } from "@/modules/reservas";
import { SemTarifaError, orcarEstadia } from "@/modules/tarifas";

import {
  AvisoDeDisponibilidade,
  NoiteANoite,
  TotalDoOrcamento,
} from "../../_componentes/Orcamento";
import { SemAcesso } from "../../_componentes/SemAcesso";
import { Confirmar } from "./Confirmar";

export type Pedido = {
  entrada: string;
  saida: string;
  adultos: number;
  criancas: number;
  solicitacaoId?: string;
};

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-8 rounded-xl border border-vinho/30 bg-vinho/5 px-5 py-4 leading-relaxed text-vinho">
      {children}
    </p>
  );
}

/**
 * A cotação e, logo abaixo, a confirmação.
 *
 * O preço que a recepção vê aqui é o MESMO que a reserva grava, porque vem do
 * mesmo motor — e é essa igualdade que o portão da Fase 1A cobra. A reserva
 * recalcula na hora de gravar em vez de receber o número da tela: um valor
 * vindo do formulário seria um valor que o cliente pode editar.
 */
export async function Cotacao({ pedido }: { pedido: Pedido }) {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "reservas", "lancar")) {
    return <SemAcesso modulo="criação de reservas" />;
  }

  let noites: Noite[];
  try {
    noites = noitesDaEstadia(pedido.entrada, pedido.saida);
  } catch {
    return <Aviso>A saída precisa ser depois da entrada.</Aviso>;
  }

  return withTenant(sessao.anfitriaoId, async (tx) => {
    const propriedade = await buscarPropriedade(tx);
    const tipo = (await listarTipos(tx))[0];
    if (!tipo) return <Aviso>Nenhum tipo de acomodação cadastrado.</Aviso>;

    const [disponibilidade, unidades, solicitacao] = await Promise.all([
      consultarDisponibilidade(tx, {
        entrada: pedido.entrada,
        saida: pedido.saida,
        adultos: pedido.adultos,
        criancas: pedido.criancas,
        tipoId: tipo.id,
        // O painel já leu cabeçalhos em `exigirSessao()`.
      }, new Date()),
      listarUnidadesAtivas(tx),
      pedido.solicitacaoId
        ? buscarSolicitacao(tx, pedido.solicitacaoId)
        : Promise.resolve(null),
    ]);

    const oferta = disponibilidade.ofertas[0];
    const livres = new Set(oferta?.unidadesLivres ?? []);

    let orcamento;
    try {
      orcamento = await orcarEstadia(tx, {
        noites,
        adultos: pedido.adultos,
        criancas: pedido.criancas,
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
            Não há diária cadastrada para: {erro.noites.join(", ")}. Cadastre a
            tarifa antes de criar a reserva.
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

        <h2 className="mt-10 font-display text-2xl">
          {formatarPeriodo(pedido.entrada, pedido.saida)}
        </h2>
        <NoiteANoite orcamento={orcamento} />

        <TotalDoOrcamento
          orcamento={orcamento}
          ocupacaoBase={tipo.ocupacaoBase}
          sinalPontosBase={propriedade.sinalPontosBase}
        />

        <h2 className="mt-12 font-display text-2xl">Quem está reservando</h2>

        {/*
          O formulário aparece mesmo sem oferta. A recepção fecha reserva em
          caso que o motor recusa — um hóspede conhecido abaixo do mínimo, uma
          exceção combinada com o proprietário —, e a única coisa que o sistema
          não deixa passar de jeito nenhum é a noite já ocupada, que a chave
          única recusa no banco.
        */}
        {!oferta?.disponivel && (
          <p className="mt-4 rounded-xl border border-dourado bg-dourado/15 px-5 py-4 text-sm leading-relaxed">
            As regras recusam estas datas pelo motivo acima. Se for uma exceção
            combinada, dá para criar assim mesmo — menos sobre noite já
            ocupada, que o banco não aceita.
          </p>
        )}

        <Confirmar
          ctx={{
            tipoId: tipo.id,
            entrada: pedido.entrada,
            saida: pedido.saida,
            adultos: pedido.adultos,
            criancas: pedido.criancas,
            unidades: unidades.map((u) => ({
              id: u.id,
              nome: u.nome,
              livre: livres.has(u.id),
            })),
            limiteDeDesconto: sessao.perfil.descontoMaximoPontosBase / 100,
            solicitacaoId: pedido.solicitacaoId,
            prefill: solicitacao
              ? {
                  nome: solicitacao.nome,
                  telefone: solicitacao.telefone ?? undefined,
                  email: solicitacao.email ?? undefined,
                  observacoes: solicitacao.observacao ?? undefined,
                }
              : undefined,
          }}
        />
      </div>
    );
  });
}
