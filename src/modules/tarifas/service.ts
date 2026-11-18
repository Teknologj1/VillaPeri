import { and, eq, gte, lte } from "drizzle-orm";

import type { Tx } from "@/db/tenant";
import type { Noite } from "@/lib/data";
import { buscarPropriedade } from "@/modules/anfitriao";

import { feriadosNoPeriodo } from "./feriados";
import {
  type Catalogo,
  type Orcamento,
  type PedidoDePreco,
  orcar,
} from "./motor";
import {
  cupom,
  descontoEstadiaLonga,
  extra,
  feriado,
  politicaCancelamento,
  regraTarifa,
} from "./schema";

/**
 * Carrega o catálogo de preços e orça a estadia.
 *
 * É a única porta de entrada para preço no sistema. O site, o simulador do
 * painel e a reserva chamam esta função — não existe um segundo cálculo em
 * lugar nenhum, porque o portão da Fase 1A exige que os três deem o mesmo
 * valor em centavos.
 */
export async function orcarEstadia(
  tx: Tx,
  pedido: PedidoDePreco,
): Promise<Orcamento> {
  const propriedade = await buscarPropriedade(tx);

  const primeira = pedido.noites[0]!;
  const ultima = pedido.noites[pedido.noites.length - 1]!;

  const [regras, feriados, extras, descontos] = await Promise.all([
    tx.select().from(regraTarifa).where(eq(regraTarifa.ativa, true)),
    // A véspera pode puxar a regra de feriado para a noite anterior, então a
    // busca começa um dia antes.
    tx
      .select()
      .from(feriado)
      .where(and(gte(feriado.data, primeira), lte(feriado.data, ultima))),
    tx.select().from(extra).where(eq(extra.ativo, true)),
    tx
      .select()
      .from(descontoEstadiaLonga)
      .where(eq(descontoEstadiaLonga.ativo, true)),
  ]);

  // Feriados do dia seguinte ao último, para cobrir "vale na véspera".
  const feriadosSeguinte = await tx
    .select()
    .from(feriado)
    .where(and(gte(feriado.data, ultima), lte(feriado.data, proximoDia(ultima))));

  const catalogo: Catalogo = {
    regras: regras.map((r) => ({
      id: r.id,
      nome: r.nome,
      nivel: r.nivel,
      propriedadeId: r.propriedadeId,
      tipoId: r.tipoId,
      unidadeId: r.unidadeId,
      vigenciaInicio: r.vigenciaInicio,
      vigenciaFim: r.vigenciaFim,
      precoSemanaCentavos: r.precoSemanaCentavos,
      precoFimDeSemanaCentavos: r.precoFimDeSemanaCentavos,
      precoFixoCentavos: r.precoFixoCentavos,
      ajustePontosBase: r.ajustePontosBase,
      valorPessoaExtraCentavos: r.valorPessoaExtraCentavos,
      valorCriancaCentavos: r.valorCriancaCentavos,
      aplicaNaVespera: r.aplicaNaVespera,
      prioridade: r.prioridade,
      ativa: r.ativa,
    })),
    feriados: [...feriados, ...feriadosSeguinte].map((f) => ({
      data: f.data,
      nome: f.nome,
      valeNaVespera: f.valeNaVespera,
    })),
    extras: extras.map((e) => ({
      id: e.id,
      nome: e.nome,
      valorCentavos: e.valorCentavos,
      cobranca: e.cobranca,
      obrigatorio: e.obrigatorio,
    })),
    descontosEstadiaLonga: descontos.map((d) => ({
      noitesMinimas: d.noitesMinimas,
      percentualPontosBase: d.percentualPontosBase,
    })),
    diasFimDeSemana: propriedade.diasFimDeSemana,
  };

  return orcar(pedido, catalogo);
}

function proximoDia(n: Noite): Noite {
  const d = new Date(`${n}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Gera e grava os feriados nacionais de um intervalo de anos.
 *
 * Só os nacionais. Os municipais de Pirenópolis e a Festa do Divino, que é o
 * período de maior demanda da cidade, o proprietário cadastra à mão e
 * confirma a cada ano — a data efetiva não sai de fórmula.
 */
export async function sincronizarFeriadosNacionais(
  tx: Tx,
  anfitriaoId: string,
  anoInicial: number,
  anoFinal: number,
): Promise<number> {
  const gerados = feriadosNoPeriodo(anoInicial, anoFinal);

  const inseridos = await tx
    .insert(feriado)
    .values(
      gerados.map((f) => ({
        anfitriaoId,
        data: f.data,
        nome: f.nome,
        ambito: f.ambito,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: feriado.id });

  return inseridos.length;
}

export async function listarFeriados(tx: Tx, de: Noite, ate: Noite) {
  return tx
    .select()
    .from(feriado)
    .where(and(gte(feriado.data, de), lte(feriado.data, ate)));
}

export async function listarRegrasTarifa(tx: Tx) {
  return tx.select().from(regraTarifa);
}

export async function listarExtras(tx: Tx) {
  return tx.select().from(extra).where(eq(extra.ativo, true));
}

export async function buscarCupom(tx: Tx, codigo: string) {
  const [c] = await tx
    .select()
    .from(cupom)
    .where(and(eq(cupom.codigo, codigo), eq(cupom.ativo, true)))
    .limit(1);
  return c;
}

export async function buscarPoliticaPadrao(tx: Tx) {
  const [p] = await tx
    .select()
    .from(politicaCancelamento)
    .where(eq(politicaCancelamento.padrao, true))
    .limit(1);
  return p;
}
