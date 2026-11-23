import { randomUUID } from "node:crypto";

import { and, eq, gte, lte } from "drizzle-orm";

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
import { type Autor, auditar } from "@/modules/auditoria";
import { listarFeriados } from "@/modules/tarifas";

import {
  type Pedido,
  type ResultadoConsulta,
  consultarDisponibilidade as calcularDisponibilidade,
} from "./disponibilidade";
import { BloqueioEmConflitoError, type ReservaEmConflito } from "./erros";
import {
  type OrigemNoite,
  buscarNoitesOcupadas,
  buscarRegrasEstadia,
  liberarNoitesPorOrigem,
  ocuparNoitesIgnorandoExistentes,
  reservasNasNoites,
} from "./repo";
import { bloqueio, noiteOcupada } from "./schema";

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

  let noitesFechadas = 0;
  for (const u of alvo) {
    noitesFechadas += await ocuparNoitesIgnorandoExistentes(tx, {
      anfitriaoId,
      unidadeId: u.id,
      origem: "bloqueio",
      origemId: bloqueioId,
      noites,
    });
  }

  // Zero noites: estas datas já estavam fechadas. Deixar o registro nascer
  // assim seria criar um fechamento que não é dono de noite nenhuma — e, ao
  // reabrir o fechamento que de fato as segura, a tela continuaria mostrando
  // este aqui como se as datas estivessem fechadas, com as noites livres.
  //
  // O `throw` desfaz a transação inteira, inclusive a linha já inserida.
  if (noitesFechadas === 0) {
    throw new Error(
      "Estas datas já estão fechadas. Reabra o fechamento existente antes " +
        "de criar outro, para não ficarem dois registros sobre as mesmas noites.",
    );
  }

  return { bloqueioId, noitesFechadas };
}

// ---------------------------------------------------------------------------
// Sugerir datas
// ---------------------------------------------------------------------------

export type PedidoDeSugestao = {
  /** Data que o hóspede queria. A busca sai dela para os dois lados. */
  entrada: Noite;
  noites: number;
  adultos: number;
  criancas: number;
  tipoId?: string;
  /** Quantos dias procurar para frente e para trás. */
  janelaDias?: number;
  /** Quantas sugestões devolver. */
  quantas?: number;
};

export type Sugestao = {
  entrada: Noite;
  saida: Noite;
  /** Dias de distância da data pedida; negativo é antes. */
  distanciaDias: number;
};

/**
 * Datas próximas que cabem nas regras, quando a pedida não cabe.
 *
 * Procura alternando para frente e para trás a partir da data pedida, para
 * que a primeira sugestão seja sempre a mais próxima — quem queria sexta
 * aceita quinta mais facilmente que a sexta do mês seguinte.
 *
 * Carrega o calendário UMA vez para a janela inteira e roda o motor puro em
 * cima dele. Chamar `consultarDisponibilidade` por candidato seriam dezenas
 * de idas ao banco para responder a uma pergunta de WhatsApp.
 */
export async function sugerirDatas(
  tx: Tx,
  pedido: PedidoDeSugestao,
  agora: Date = new Date(),
): Promise<Sugestao[]> {
  const janela = pedido.janelaDias ?? 21;
  const quantas = pedido.quantas ?? 4;

  const propriedade = await buscarPropriedade(tx);
  const [tipos, unidades, regras] = await Promise.all([
    listarTipos(tx),
    listarUnidadesAtivas(tx),
    buscarRegrasEstadia(tx),
  ]);

  const inicioDaJanela = somarDias(pedido.entrada, -janela - 1);
  const fimDaJanela = somarDias(
    pedido.entrada,
    janela + pedido.noites + 8,
  );

  const [ocupadas, feriados] = await Promise.all([
    buscarNoitesOcupadas(tx, {
      unidadeIds: unidades.map((u) => u.id),
      de: inicioDaJanela,
      ate: fimDaJanela,
    }),
    listarFeriados(tx, inicioDaJanela, fimDaJanela),
  ]);

  const diasDeFeriado = new Set(feriados.map((f) => f.data));
  const hoje = hojeNaPropriedade(propriedade.fuso, agora);

  const comum = {
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
    hoje,
  };

  const achadas: Sugestao[] = [];

  for (const distancia of alternando(janela)) {
    const entrada = somarDias(pedido.entrada, distancia);
    // Não sugere passado: seria uma resposta que o hóspede não pode aceitar.
    if (entrada < hoje) continue;

    const saida = somarDias(entrada, pedido.noites);

    const resultado = calcularDisponibilidade({
      ...comum,
      pedido: {
        entrada,
        saida,
        adultos: pedido.adultos,
        criancas: pedido.criancas,
        tipoId: pedido.tipoId,
      },
      entradaEhFeriado: diasDeFeriado.has(entrada),
      horasAteCheckin: horasAteCheckin(
        entrada,
        propriedade.checkinPadrao,
        propriedade.fuso,
        agora,
      ),
    });

    if (resultado.ofertas.some((o) => o.disponivel)) {
      achadas.push({ entrada, saida, distanciaDias: distancia });
      if (achadas.length >= quantas) break;
    }
  }

  return achadas;
}

/** 0, +1, −1, +2, −2… até o limite. A mais próxima primeiro. */
function* alternando(limite: number): Generator<number> {
  yield 0;
  for (let d = 1; d <= limite; d++) {
    yield d;
    yield -d;
  }
}

// ---------------------------------------------------------------------------
// Abrir datas e ver o mês
// ---------------------------------------------------------------------------

export type BloqueioNaTela = typeof bloqueio.$inferSelect;

/**
 * Os fechamentos que tocam um período.
 *
 * Sobreposição, não "começa dentro": um bloqueio de 28/12 a 03/01 tem de
 * aparecer no calendário de dezembro E no de janeiro, pela mesma razão que
 * uma reserva aparece — em ambos os meses a casa está fechada.
 */
export async function listarBloqueios(
  tx: Tx,
  de: Noite,
  ate: Noite,
): Promise<BloqueioNaTela[]> {
  return tx
    .select()
    .from(bloqueio)
    .where(
      and(
        lte(bloqueio.primeiraNoite, ate),
        gte(bloqueio.ultimaNoite, de),
      ),
    )
    .orderBy(bloqueio.primeiraNoite);
}

/**
 * Reabre as datas de um fechamento.
 *
 * Solta as noites E apaga o bloqueio, na mesma transação. Apagar só o
 * registro deixaria as noites ocupadas para sempre, sem nada no sistema
 * explicando por quê — e a recepção veria a casa cheia sem reserva nenhuma.
 */
export async function abrirDatas(
  tx: Tx,
  anfitriaoId: string,
  bloqueioId: string,
  autor: Autor,
): Promise<{ noitesLiberadas: number }> {
  const [alvo] = await tx
    .select()
    .from(bloqueio)
    .where(eq(bloqueio.id, bloqueioId))
    .limit(1);
  if (!alvo) throw new Error("Fechamento não encontrado.");

  // Conta antes de soltar: depois não há mais o que contar, e o número é o
  // que a tela usa para dizer quantas noites voltaram a vender.
  const soltas = await contarNoitesDoBloqueio(tx, bloqueioId);
  await liberarNoitesPorOrigem(tx, "bloqueio", bloqueioId);
  await tx.delete(bloqueio).where(eq(bloqueio.id, bloqueioId));

  await auditar(tx, {
    anfitriaoId,
    entidade: "bloqueio",
    entidadeId: bloqueioId,
    acao: "reabriu",
    valorAntes: {
      primeiraNoite: alvo.primeiraNoite,
      ultimaNoite: alvo.ultimaNoite,
      motivo: alvo.motivo,
    },
    autor,
  });

  return { noitesLiberadas: soltas };
}

async function contarNoitesDoBloqueio(tx: Tx, bloqueioId: string): Promise<number> {
  const linhas = await tx
    .select({ noite: noiteOcupada.noite })
    .from(noiteOcupada)
    .where(
      and(
        eq(noiteOcupada.origem, "bloqueio"),
        eq(noiteOcupada.origemId, bloqueioId),
      ),
    );
  return linhas.length;
}

export type DiaDoCalendario = {
  noite: Noite;
  /** `null` quando a noite está livre. */
  origem: OrigemNoite | null;
  origemId: string | null;
};

export type MesDaUnidade = {
  unidadeId: string;
  unidadeNome: string;
  dias: DiaDoCalendario[];
};

/**
 * O mês de cada unidade, noite a noite.
 *
 * Monta a partir de `noite_ocupada`, que é a verdade sobre ocupação — não de
 * reserva nem de bloqueio separadamente. É o que faz o calendário mostrar a
 * mesma coisa que o motor de disponibilidade decide: se houvesse duas
 * origens de verdade, a tela e a reserva discordariam algum dia.
 */
export async function calendarioDoPeriodo(
  tx: Tx,
  de: Noite,
  ate: Noite,
): Promise<MesDaUnidade[]> {
  const unidades = await listarUnidadesAtivas(tx);
  if (unidades.length === 0) return [];

  const ocupadas = await buscarNoitesOcupadas(tx, {
    unidadeIds: unidades.map((u) => u.id),
    de,
    ate,
  });

  const porUnidade = new Map<string, Map<Noite, { origem: OrigemNoite; origemId: string }>>();
  for (const o of ocupadas) {
    let m = porUnidade.get(o.unidadeId);
    if (!m) {
      m = new Map();
      porUnidade.set(o.unidadeId, m);
    }
    m.set(o.noite, { origem: o.origem, origemId: o.origemId });
  }

  const noites = noitesDaEstadia(de, somarDias(ate, 1));

  return unidades.map((u) => ({
    unidadeId: u.id,
    unidadeNome: u.nome,
    dias: noites.map((noite) => {
      const o = porUnidade.get(u.id)?.get(noite);
      return {
        noite,
        origem: o?.origem ?? null,
        origemId: o?.origemId ?? null,
      };
    }),
  }));
}
