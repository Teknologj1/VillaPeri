import { randomUUID } from "node:crypto";

import type { Tx } from "@/db/tenant";
import {
  type Noite,
  diaDaSemana,
  hojeNaPropriedade,
  horasAteCheckin,
  noitesDaEstadia,
  somarDias,
} from "@/lib/data";
import {
  buscarPropriedade,
  listarTipos,
  listarUnidadesAtivas,
} from "@/modules/anfitriao";
import { listarFeriados } from "@/modules/tarifas";

import {
  type Pedido,
  type ResultadoConsulta,
  consultarDisponibilidade as calcularDisponibilidade,
} from "./disponibilidade";
import { BloqueioEmConflitoError, type ReservaEmConflito } from "./erros";
import {
  buscarNoitesOcupadas,
  buscarRegrasEstadia,
  ocuparNoitesIgnorandoExistentes,
  reservasNasNoites,
} from "./repo";
import { bloqueio } from "./schema";

/**
 * Disponibilidade e preço-regra para um pedido, carregando o que o motor
 * precisa e chamando a função pura.
 *
 * A mesma função serve o site, o painel e a RIIA. É isso que faz os três
 * darem sempre a mesma resposta — não há um segundo motor em lugar nenhum.
 */
export async function consultarDisponibilidade(
  tx: Tx,
  pedido: Pedido,
  agora: Date = new Date(),
): Promise<ResultadoConsulta> {
  const propriedade = await buscarPropriedade(tx);
  const [tipos, unidades, regras, feriadosNaEntrada] = await Promise.all([
    listarTipos(tx),
    listarUnidadesAtivas(tx),
    buscarRegrasEstadia(tx),
    // Só a noite de entrada interessa: é ela que determina a regra de estadia.
    listarFeriados(tx, pedido.entrada, pedido.entrada),
  ]);

  const noites = noitesDaEstadia(pedido.entrada, pedido.saida);
  const primeira = noites[0]!;
  const ultima = noites[noites.length - 1]!;

  // A janela de busca vai além da saída para alcançar as folgas de limpeza
  // que esta reserva criaria — sem isso o motor não enxerga o conflito.
  const ocupadas = await buscarNoitesOcupadas(tx, {
    unidadeIds: unidades.map((u) => u.id),
    de: somarDias(primeira, -1),
    ate: somarDias(ultima, 8),
  });

  return calcularDisponibilidade({
    pedido,
    propriedadeId: propriedade.id,
    tipos: tipos.map((t) => ({
      id: t.id,
      nome: t.nome,
      capacidade: t.capacidade,
    })),
    unidades: unidades.map((u) => ({
      id: u.id,
      tipoId: u.tipoId,
      ativa: u.ativa,
    })),
    ocupadas: ocupadas.map((o) => ({ unidadeId: o.unidadeId, noite: o.noite })),
    regras: regras.map((r) => ({
      id: r.id,
      nome: r.nome,
      propriedadeId: r.propriedadeId,
      tipoId: r.tipoId,
      unidadeId: r.unidadeId,
      vigenciaInicio: r.vigenciaInicio,
      vigenciaFim: r.vigenciaFim,
      diasDaSemana: r.diasDaSemana,
      somenteEmFeriado: r.somenteEmFeriado,
      minimoDiarias: r.minimoDiarias,
      maximoDiarias: r.maximoDiarias,
      diasDeEntrada: r.diasDeEntrada,
      antecedenciaMinimaHoras: r.antecedenciaMinimaHoras,
      janelaMaximaDias: r.janelaMaximaDias,
      intervaloLimpezaNoites: r.intervaloLimpezaNoites,
      lacunaCurtaPermitida: r.lacunaCurtaPermitida,
      prioridade: r.prioridade,
      ativa: r.ativa,
    })),
    hoje: hojeNaPropriedade(propriedade.fuso, agora),
    entradaEhFeriado: feriadosNaEntrada.length > 0,
    horasAteCheckin: horasAteCheckin(
      pedido.entrada,
      propriedade.checkinPadrao,
      propriedade.fuso,
      agora,
    ),
  });
}

export type EscopoBloqueio =
  | { propriedadeId: string }
  | { tipoId: string }
  | { unidadeId: string };

export type DadosBloqueio = {
  escopo: EscopoBloqueio;
  primeiraNoite: Noite;
  ultimaNoite: Noite;
  motivo: "reforma" | "uso_proprietario" | "fechamento" | "evento_privado" | "outro";
  observacao?: string;
  /** Fechamento que se repete, ex.: `{ diasDaSemana: [2] }` para toda terça. */
  repeticao?: { diasDaSemana: number[] } | null;
};

/** As noites do período, filtradas pela repetição quando houver. */
function expandirNoites(dados: DadosBloqueio): Noite[] {
  // O bloqueio é inclusivo nos dois extremos, ao contrário da reserva.
  const todas = noitesDaEstadia(dados.primeiraNoite, somarDias(dados.ultimaNoite, 1));
  if (!dados.repeticao) return todas;
  const dias = dados.repeticao.diasDaSemana;
  return todas.filter((n) => dias.includes(diaDaSemana(n)));
}

/**
 * Fecha datas, recusando se alcançar noite já reservada.
 *
 * "O sistema recusa bloqueio sobre noite que já tem reserva e lista as
 * reservas em conflito para remanejar." Listar é o ponto: só recusar obrigaria
 * a recepção a procurar na mão qual reserva está no caminho.
 *
 * Bloqueio sobre noite já bloqueada é aceito e ignorado — fechar um período
 * que se sobrepõe a outro fechamento é operação normal.
 */
export async function fecharDatas(
  tx: Tx,
  anfitriaoId: string,
  dados: DadosBloqueio,
): Promise<{ bloqueioId: string; noitesFechadas: number }> {
  const unidades = await listarUnidadesAtivas(tx);

  // Em const local: o TypeScript não mantém o estreitamento de
  // `dados.escopo` dentro das arrow functions abaixo, por ser acesso a
  // propriedade e não ligação imutável.
  const escopo = dados.escopo;
  const alvo =
    "unidadeId" in escopo
      ? unidades.filter((u) => u.id === escopo.unidadeId)
      : "tipoId" in escopo
        ? unidades.filter((u) => u.tipoId === escopo.tipoId)
        : unidades;

  if (alvo.length === 0) {
    throw new Error("O escopo do bloqueio não alcança nenhuma unidade ativa.");
  }

  const noites = expandirNoites(dados);
  if (noites.length === 0) {
    throw new Error("O período informado não contém nenhuma noite.");
  }

  // --- Conflito com reservas -----------------------------------------------

  const reservas = await reservasNasNoites(tx, {
    unidadeIds: alvo.map((u) => u.id),
    de: noites[0]!,
    ate: noites[noites.length - 1]!,
  });

  const noitesAlvo = new Set(noites);
  const porReserva = new Map<string, ReservaEmConflito>();
  for (const r of reservas) {
    if (!noitesAlvo.has(r.noite)) continue; // repetição pode pular dias
    const atual = porReserva.get(r.reservaId);
    if (atual) atual.noites.push(r.noite);
    else
      porReserva.set(r.reservaId, {
        reservaId: r.reservaId,
        unidadeId: r.unidadeId,
        noites: [r.noite],
      });
  }
  if (porReserva.size > 0) {
    throw new BloqueioEmConflitoError([...porReserva.values()]);
  }

  // --- Gravação ------------------------------------------------------------

  const bloqueioId = randomUUID();
  await tx.insert(bloqueio).values({
    id: bloqueioId,
    anfitriaoId,
    propriedadeId: "propriedadeId" in escopo ? escopo.propriedadeId : null,
    tipoId: "tipoId" in escopo ? escopo.tipoId : null,
    unidadeId: "unidadeId" in escopo ? escopo.unidadeId : null,
    primeiraNoite: dados.primeiraNoite,
    ultimaNoite: dados.ultimaNoite,
    motivo: dados.motivo,
    observacao: dados.observacao ?? null,
    repeticao: dados.repeticao ?? null,
    origem: "manual",
  });

  for (const u of alvo) {
    await ocuparNoitesIgnorandoExistentes(tx, {
      anfitriaoId,
      unidadeId: u.id,
      origem: "bloqueio",
      origemId: bloqueioId,
      noites,
    });
  }

  return { bloqueioId, noitesFechadas: noites.length * alvo.length };
}
