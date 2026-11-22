import { noitesDaEstadia } from "@/lib/data";
import { mesmoTelefone, telefoneCanonico } from "@/lib/telefone";
import { listarTipos } from "@/modules/anfitriao";
import { consultarDisponibilidade } from "@/modules/calendario";
import {
  NoiteIndisponivelError,
  criarReserva,
  listarReservas,
} from "@/modules/reservas";
import { vincularConversa } from "@/modules/riia";
import { SemTarifaError } from "@/modules/tarifas";

import { preReserva } from "../_esquemas";
import { ErroDeFerramenta, RespostaDaFerramenta, rota } from "../_nucleo";

/**
 * `criar_pre_reserva` — o nível 2 da RIIA.
 *
 * Ao contrário do formulário aberto do site, que não segura noites, a RIIA
 * tem chave própria e limites, e por isso PODE segurar — por um prazo curto.
 * A diferença não é de confiança no texto do hóspede: é que aqui há uma
 * credencial revogável, um teto de requisições e um limite de pré-reservas
 * abertas por telefone.
 */

/** Quantas pré-reservas abertas o mesmo telefone pode ter. */
const MAXIMO_ABERTAS_POR_TELEFONE = 2;

/** Quanto tempo a pré-reserva da RIIA segura as noites. */
const MINUTOS_PARA_EXPIRAR = 12 * 60;

export const POST = rota({
  ferramenta: "criar_pre_reserva",
  entrada: preReserva,
  idempotente: true,
  async executar(d, ctx) {
    const telefone = telefoneCanonico(d.telefone);
    const tipo = (await listarTipos(ctx.tx))[0];

    if (!tipo) {
      throw new ErroDeFerramenta(
        503,
        "sem_acomodacao",
        "Nenhuma acomodação cadastrada nesta conta.",
      );
    }

    // O freio contra abuso: um telefone não acumula pré-reservas abertas.
    // Sem isto, uma conversa em laço trancaria o calendário inteiro.
    const abertas = await listarReservas(ctx.tx, {
      status: ["pre_reserva", "aguardando_aprovacao"],
    });
    const desteTelefone = abertas.filter(
      (r) => mesmoTelefone(r.hospedeTelefone, telefone),
    );
    if (desteTelefone.length >= MAXIMO_ABERTAS_POR_TELEFONE) {
      throw new ErroDeFerramenta(
        429,
        "pre_reservas_demais",
        `Este telefone já tem ${desteTelefone.length} pré-reservas abertas. ` +
          "Conclua ou cancele uma antes de abrir outra.",
        { codigos: desteTelefone.map((r) => r.codigo) },
      );
    }

    // A disponibilidade é conferida aqui para dar um motivo ESTRUTURADO à
    // RIIA. Não é a garantia — a garantia é a chave única (unidade, noite),
    // que recusa a gravação. Esta consulta existe para a resposta ser
    // "o mínimo é de 3 noites" em vez de "não deu".
    const disponibilidade = await consultarDisponibilidade(ctx.tx, {
      entrada: d.entrada,
      saida: d.saida,
      adultos: d.adultos,
      criancas: d.criancas,
      tipoId: tipo.id,
    });
    const oferta = disponibilidade.ofertas[0];

    if (!oferta?.disponivel || oferta.unidadesLivres.length === 0) {
      // Pedido de desconto ou de exceção ao mínimo vindo no texto do hóspede
      // não muda nada aqui: a RIIA não tem como afrouxar a regra, só como
      // transferir para uma pessoa que pode.
      throw new ErroDeFerramenta(
        409,
        "sem_disponibilidade",
        "Estas datas não estão disponíveis pelas regras da casa.",
        { motivos: oferta?.motivos ?? [] },
      );
    }

    const unidadeId = oferta.unidadesLivres[0]!;

    try {
      const criada = await criarReserva(ctx.tx, ctx.anfitriaoId, {
        unidadeId,
        tipoId: tipo.id,
        entrada: d.entrada,
        saida: d.saida,
        adultos: d.adultos,
        criancas: d.criancas,
        hospede: {
          nome: d.nome,
          telefone,
          email: d.email || null,
        },
        canal: "riia",
        minutosParaExpirar: MINUTOS_PARA_EXPIRAR,
        observacoes: d.observacao || null,
        autor: { tipo: "riia", chaveId: ctx.chave.id, conversaId: ctx.conversaId ?? undefined },
      });

      if (ctx.conversaId) {
        await vincularConversa(ctx.tx, ctx.conversaId, {
          hospedeId: criada.hospedeId,
          reservaId: criada.id,
        });
      }

      return new RespostaDaFerramenta(
        {
          codigo: criada.codigo,
          status: criada.status,
          entrada: criada.entrada,
          saida: criada.saida,
          noites: noitesDaEstadia(criada.entrada, criada.saida).length,
          totalCentavos: criada.totalCentavos,
          sinalCentavos: criada.sinalCentavos,
          saldoCentavos: criada.totalCentavos - criada.sinalCentavos,
          expiraEm: criada.expiraEm,
          // A reserva ainda NÃO está confirmada, e a RIIA tem de dizer isso
          // com todas as letras. "Reservado" para quem só segurou a data é a
          // promessa que vira reclamação no balcão.
          mensagemSugerida:
            `Segurei as datas de ${criada.entrada} a ${criada.saida} com o código ` +
            `${criada.codigo}. A reserva se confirma com o sinal; enquanto isso ` +
            `a data fica guardada até ${criada.expiraEm?.toISOString()}.`,
        },
        201,
      );
    } catch (e) {
      if (e instanceof NoiteIndisponivelError) {
        // Alguém tomou a data entre a consulta e a gravação. É exatamente o
        // caso que a chave única existe para pegar.
        throw new ErroDeFerramenta(
          409,
          "noite_ocupada",
          "A data acabou de ser ocupada por outra reserva.",
          { noite: e.noite ?? null },
        );
      }
      if (e instanceof SemTarifaError) {
        throw new ErroDeFerramenta(
          503,
          "sem_tarifa",
          "Não há diária cadastrada para estas noites. Transfira para a recepção.",
          { noites: e.noites },
        );
      }
      throw e;
    }
  },
});
