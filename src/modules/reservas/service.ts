import { randomBytes, randomUUID } from "node:crypto";

import { and, count, eq, gte } from "drizzle-orm";

import type { Tx } from "@/db/tenant";
import { type Noite, diferencaEmDias, noitesDaEstadia } from "@/lib/data";
import { apenasDigitos } from "@/lib/telefone";
import { buscarPropriedade, listarTipos } from "@/modules/anfitriao";
import { type Autor, auditar } from "@/modules/auditoria";
import { NoiteIndisponivelError, liberarNoitesPorOrigem, ocuparNoites } from "@/modules/calendario";
import {
  enfileirar,
  reservaConfirmadaParaAnfitriao,
  reservaConfirmadaParaHospede,
  solicitacaoParaAnfitriao,
  solicitacaoParaHospede,
} from "@/modules/notificacoes";
import { buscarPoliticaPadrao, orcarEstadia } from "@/modules/tarifas";

import { hospede, pagamento, reserva, solicitacao } from "./schema";
import {
  type StatusReserva,
  devolucaoAoCancelar,
  exigirTransicao,
  seguraNoites,
} from "./status";

/**
 * Código curto para o hóspede citar na conversa.
 *
 * Sem 0, O, 1, I e L: ditado por telefone, "zero" e "ó" viram a mesma coisa.
 * Quatro caracteres de um alfabeto de 27 dão ~531 mil combinações, de sobra
 * para uma casa — e a unicidade é garantida pela chave do banco, não por
 * esperança.
 */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function gerarCodigo(prefixo: string): string {
  const bytes = randomBytes(4);
  let sufixo = "";
  for (let i = 0; i < 4; i++) {
    sufixo += ALFABETO[bytes[i]! % ALFABETO.length];
  }
  return `${prefixo}-${sufixo}`;
}

// ---------------------------------------------------------------------------
// Solicitação
// ---------------------------------------------------------------------------

export type DadosDaSolicitacaoNova = {
  nome: string;
  telefone?: string | null;
  email?: string | null;
  entrada: Noite;
  saida: Noite;
  adultos: number;
  criancas: number;
  tipoId?: string | null;
  totalCotadoCentavos?: number | null;
  origem?: "site" | "riia" | "whatsapp" | "instagram" | "indicacao" | "balcao";
  observacao?: string | null;
};

/**
 * Registra um pedido vindo do site e avisa as duas partes.
 *
 * NÃO segura as noites, por decisão da especificação: um formulário aberto
 * que reserva datas é um formulário que robôs usam para travar o calendário.
 * A recepção confere e converte em pré-reserva, que aí sim segura.
 *
 * As quatro mensagens (hóspede e anfitrião, por e-mail e WhatsApp) são
 * enfileiradas NA MESMA transação: se o pedido não for gravado, ninguém
 * recebe aviso de um pedido que não existe.
 */
export async function criarSolicitacao(
  tx: Tx,
  anfitriaoId: string,
  dados: DadosDaSolicitacaoNova,
) {
  const noites = noitesDaEstadia(dados.entrada, dados.saida);
  const propriedade = await buscarPropriedade(tx);
  const codigo = gerarCodigo("VP");

  const [criada] = await tx
    .insert(solicitacao)
    .values({
      anfitriaoId,
      codigo,
      nome: dados.nome.trim(),
      telefone: dados.telefone?.trim() || null,
      email: dados.email?.trim() || null,
      tipoId: dados.tipoId ?? null,
      entrada: dados.entrada,
      saida: dados.saida,
      adultos: dados.adultos,
      criancas: dados.criancas,
      totalCotadoCentavos: dados.totalCotadoCentavos ?? null,
      origem: dados.origem ?? "site",
      observacao: dados.observacao ?? null,
    })
    .returning();

  if (!criada) throw new Error("Não foi possível registrar a solicitação.");

  const comum = {
    codigo,
    nome: criada.nome,
    entrada: dados.entrada,
    saida: dados.saida,
    noites: noites.length,
    adultos: dados.adultos,
    criancas: dados.criancas,
    totalCotadoCentavos: dados.totalCotadoCentavos ?? null,
    telefone: criada.telefone,
    email: criada.email,
    observacao: criada.observacao,
    nomeDaCasa: propriedade.nome,
  };

  const paraHospede = solicitacaoParaHospede(comum);
  const paraAnfitriao = solicitacaoParaAnfitriao(comum);

  await enfileirar(tx, [
    ...(criada.email
      ? [
          {
            anfitriaoId,
            canal: "email" as const,
            paraQuem: "hospede" as const,
            destinatario: criada.email,
            nomeDestinatario: criada.nome,
            ...paraHospede,
            evento: "solicitacao.criada",
            referenciaTipo: "solicitacao",
            referenciaId: criada.id,
          },
        ]
      : []),
    ...(criada.telefone
      ? [
          {
            anfitriaoId,
            canal: "whatsapp" as const,
            paraQuem: "hospede" as const,
            destinatario: apenasDigitos(criada.telefone),
            nomeDestinatario: criada.nome,
            assunto: null,
            corpo: paraHospede.corpo,
            evento: "solicitacao.criada",
            referenciaTipo: "solicitacao",
            referenciaId: criada.id,
          },
        ]
      : []),
    ...(propriedade.emailContato
      ? [
          {
            anfitriaoId,
            canal: "email" as const,
            paraQuem: "anfitriao" as const,
            destinatario: propriedade.emailContato,
            nomeDestinatario: propriedade.nome,
            ...paraAnfitriao,
            evento: "solicitacao.criada",
            referenciaTipo: "solicitacao",
            referenciaId: criada.id,
          },
        ]
      : []),
    ...(propriedade.whatsappContato
      ? [
          {
            anfitriaoId,
            canal: "whatsapp" as const,
            paraQuem: "anfitriao" as const,
            destinatario: apenasDigitos(propriedade.whatsappContato),
            nomeDestinatario: propriedade.nome,
            assunto: null,
            corpo: paraAnfitriao.corpo,
            evento: "solicitacao.criada",
            referenciaTipo: "solicitacao",
            referenciaId: criada.id,
          },
        ]
      : []),
  ]);

  await auditar(tx, {
    anfitriaoId,
    entidade: "solicitacao",
    entidadeId: criada.id,
    acao: "criou",
    valorDepois: { codigo, entrada: dados.entrada, saida: dados.saida },
    autor: { tipo: "sistema" },
  });

  return criada;
}

/**
 * Quantos pedidos este telefone abriu desde um instante.
 *
 * Usado pelo site como freio contra repetição. Fica no serviço, e não na
 * action, porque a tabela é do módulo — quem está fora pergunta, não lê.
 */
export async function contarSolicitacoesRecentes(
  tx: Tx,
  telefone: string,
  desde: Date,
): Promise<number> {
  const [linha] = await tx
    .select({ total: count() })
    .from(solicitacao)
    .where(
      and(eq(solicitacao.telefone, telefone), gte(solicitacao.criadoEm, desde)),
    );
  return linha?.total ?? 0;
}

// ---------------------------------------------------------------------------
// Reserva
// ---------------------------------------------------------------------------

export type DadosDaReservaNova = {
  unidadeId: string;
  tipoId: string;
  entrada: Noite;
  saida: Noite;
  adultos: number;
  criancas: number;
  hospede: {
    id?: string;
    nome: string;
    telefone?: string | null;
    email?: string | null;
    documento?: string | null;
  };
  canal?:
    | "site"
    | "riia"
    | "whatsapp"
    | "instagram"
    | "indicacao"
    | "balcao"
    | "airbnb"
    | "marketplace";
  descontoPontosBase?: number;
  /** Minutos que a pré-reserva segura as noites. */
  minutosParaExpirar?: number;
  solicitacaoId?: string | null;
  observacoes?: string | null;
  statusInicial?: Extract<StatusReserva, "pre_reserva" | "aguardando_aprovacao">;
  autor: Autor;
};

/**
 * Cria a reserva e ocupa as noites, numa transação só.
 *
 * A ordem importa: o orçamento é calculado e CONGELADO na reserva antes de as
 * noites serem gravadas. Se a gravação falhar por conflito — outra reserva
 * tomou a data no mesmo instante —, a transação inteira é desfeita e nada
 * fica pela metade.
 *
 * Não há verificação prévia de disponibilidade aqui de propósito. A garantia
 * é a chave única `(unidade, noite)`; consultar antes só diminui a chance de
 * o erro acontecer, não o impede.
 */
export async function criarReserva(
  tx: Tx,
  anfitriaoId: string,
  dados: DadosDaReservaNova,
) {
  const noites = noitesDaEstadia(dados.entrada, dados.saida);
  const propriedade = await buscarPropriedade(tx);

  const tipos = await listarTipos(tx);
  const tipo = tipos.find((t) => t.id === dados.tipoId);
  if (!tipo) throw new Error("Tipo de acomodação não encontrado.");

  const orcamento = await orcarEstadia(tx, {
    noites,
    adultos: dados.adultos,
    criancas: dados.criancas,
    tipo: {
      id: tipo.id,
      modoPreco: tipo.modoPreco,
      ocupacaoBase: tipo.ocupacaoBase,
    },
    propriedadeId: propriedade.id,
    unidadeId: dados.unidadeId,
    descontoManualPontosBase: dados.descontoPontosBase,
    sinalPontosBase: propriedade.sinalPontosBase,
  });

  const titular = await acharOuCriarHospede(tx, anfitriaoId, dados.hospede);
  const politica = await buscarPoliticaPadrao(tx);

  const reservaId = randomUUID();
  const codigo = gerarCodigo("R");
  const minutos = dados.minutosParaExpirar ?? 60 * 24;

  const [criada] = await tx
    .insert(reserva)
    .values({
      id: reservaId,
      anfitriaoId,
      codigo,
      unidadeId: dados.unidadeId,
      tipoId: dados.tipoId,
      entrada: dados.entrada,
      saida: dados.saida,
      status: dados.statusInicial ?? "pre_reserva",
      canal: dados.canal ?? "balcao",
      hospedeId: titular.id,
      adultos: dados.adultos,
      criancas: dados.criancas,
      orcamento,
      totalCentavos: orcamento.totalCentavos,
      sinalCentavos: orcamento.sinalCentavos,
      descontoPontosBase: dados.descontoPontosBase ?? 0,
      politicaCancelamentoId: politica?.id ?? null,
      solicitacaoId: dados.solicitacaoId ?? null,
      observacoes: dados.observacoes ?? null,
      expiraEm: new Date(Date.now() + minutos * 60_000),
    })
    .returning();

  if (!criada) throw new Error("Não foi possível criar a reserva.");

  // Aqui é onde o overbooking morre: se alguma noite já estiver tomada, isto
  // levanta NoiteIndisponivelError e desfaz tudo acima.
  await ocuparNoites(tx, {
    anfitriaoId,
    unidadeId: dados.unidadeId,
    origem: "reserva",
    origemId: reservaId,
    noites: orcamento.noites.map((n) => ({
      noite: n.noite,
      precoCentavos: n.precoCentavos,
      regraTarifaId: n.regraId,
    })),
  });

  if (dados.solicitacaoId) {
    await tx
      .update(solicitacao)
      .set({ status: "convertida" })
      .where(eq(solicitacao.id, dados.solicitacaoId));
  }

  await auditar(tx, {
    anfitriaoId,
    entidade: "reserva",
    entidadeId: reservaId,
    acao: "criou",
    valorDepois: {
      codigo,
      status: criada.status,
      entrada: dados.entrada,
      saida: dados.saida,
      totalCentavos: orcamento.totalCentavos,
    },
    autor: dados.autor,
  });

  return criada;
}

async function acharOuCriarHospede(
  tx: Tx,
  anfitriaoId: string,
  dados: DadosDaReservaNova["hospede"],
) {
  if (dados.id) {
    const [existente] = await tx
      .select()
      .from(hospede)
      .where(eq(hospede.id, dados.id))
      .limit(1);
    if (existente) return existente;
  }

  // Sem documento, o telefone é o melhor identificador que há — é por ele
  // que a recepção reconhece quem já se hospedou antes.
  if (dados.telefone) {
    const [porTelefone] = await tx
      .select()
      .from(hospede)
      .where(
        and(
          eq(hospede.anfitriaoId, anfitriaoId),
          eq(hospede.telefone, dados.telefone),
        ),
      )
      .limit(1);
    if (porTelefone) {
      await tx
        .update(hospede)
        .set({ recorrente: true })
        .where(eq(hospede.id, porTelefone.id));
      return porTelefone;
    }
  }

  const [novo] = await tx
    .insert(hospede)
    .values({
      anfitriaoId,
      nome: dados.nome.trim(),
      telefone: dados.telefone?.trim() || null,
      email: dados.email?.trim() || null,
      documento: dados.documento?.trim() || null,
    })
    .returning();

  if (!novo) throw new Error("Não foi possível criar a ficha do hóspede.");
  return novo;
}

// ---------------------------------------------------------------------------
// Pagamentos
// ---------------------------------------------------------------------------

export type DadosDoPagamento = {
  reservaId: string;
  tipo: "sinal" | "saldo" | "extra" | "reembolso";
  metodo: "pix" | "cartao" | "dinheiro" | "transferencia" | "outro";
  /** Em centavos. Reembolso entra NEGATIVO. */
  valorCentavos: number;
  data: Noite;
  comprovante?: string | null;
  observacao?: string | null;
  autor: Autor;
};

/**
 * Lança um pagamento na reserva.
 *
 * Na v1 é lançamento manual — Pix, cartão, dinheiro, transferência. Na fase 3
 * o provedor confirma por webhook e cai nesta mesma tabela, pela mesma função:
 * é o ponto de extensão que evita reescrever a tela de financeiro depois.
 *
 * Não muda o status da reserva. Receber o sinal e confirmar são duas decisões
 * distintas: o dinheiro pode cair antes de a recepção checar a data, e a
 * confirmação pode ser dada por telefone antes de o Pix aparecer no extrato.
 * Juntar as duas coisas aqui tiraria da recepção o controle de uma delas.
 */
export async function registrarPagamento(
  tx: Tx,
  anfitriaoId: string,
  dados: DadosDoPagamento,
) {
  if (!Number.isInteger(dados.valorCentavos) || dados.valorCentavos === 0) {
    throw new Error("Valor do pagamento tem de ser inteiro em centavos e não zero.");
  }
  if (dados.tipo === "reembolso" && dados.valorCentavos > 0) {
    throw new Error("Reembolso entra com valor negativo.");
  }
  if (dados.tipo !== "reembolso" && dados.valorCentavos < 0) {
    throw new Error("Só reembolso entra com valor negativo.");
  }

  const [criado] = await tx
    .insert(pagamento)
    .values({
      anfitriaoId,
      reservaId: dados.reservaId,
      tipo: dados.tipo,
      metodo: dados.metodo,
      valorCentavos: dados.valorCentavos,
      data: dados.data,
      comprovante: dados.comprovante ?? null,
      observacao: dados.observacao ?? null,
    })
    .returning();

  if (!criado) throw new Error("Não foi possível lançar o pagamento.");

  await auditar(tx, {
    anfitriaoId,
    entidade: "pagamento",
    entidadeId: criado.id,
    acao: "lancou",
    valorDepois: {
      reservaId: dados.reservaId,
      tipo: dados.tipo,
      metodo: dados.metodo,
      valorCentavos: dados.valorCentavos,
      data: dados.data,
    },
    autor: dados.autor,
  });

  return criado;
}

// ---------------------------------------------------------------------------
// Mudança de status
// ---------------------------------------------------------------------------

export type ResultadoDaMudanca = {
  status: StatusReserva;
  noitesLiberadas: boolean;
  devolucaoCentavos?: number;
};

/**
 * Move a reserva de status, com os efeitos de cada passagem.
 *
 * Um ponto só de entrada para todas as mudanças, porque cada passagem tem
 * consequência — liberar noites, gerar token de FNRH, avisar o hóspede — e
 * espalhar isso por várias funções é como uma delas acaba esquecendo um
 * efeito.
 */
export async function mudarStatus(
  tx: Tx,
  anfitriaoId: string,
  reservaId: string,
  novo: StatusReserva,
  contexto: { autor: Autor; motivo?: string; hojeNaCasa?: Noite },
): Promise<ResultadoDaMudanca> {
  const [atual] = await tx
    .select()
    .from(reserva)
    .where(eq(reserva.id, reservaId))
    .limit(1);
  if (!atual) throw new Error("Reserva não encontrada.");

  const de = atual.status as StatusReserva;
  exigirTransicao(de, novo);

  const liberar = seguraNoites(de) && !seguraNoites(novo);

  let devolucaoCentavos: number | undefined;
  if (novo === "cancelada") {
    devolucaoCentavos = await calcularDevolucao(tx, atual, contexto.hojeNaCasa);
  }

  await tx
    .update(reserva)
    .set({
      status: novo,
      atualizadoEm: new Date(),
      ...(novo === "confirmada" ? { expiraEm: null } : {}),
      ...(novo === "cancelada" || novo === "no_show"
        ? { canceladaEm: new Date(), motivoCancelamento: contexto.motivo ?? null }
        : {}),
      ...(novo === "confirmada" && !atual.fnrhToken
        ? {
            fnrhToken: randomBytes(24).toString("base64url"),
            fnrhExpiraEm: new Date(Date.now() + 60 * 24 * 60 * 60_000),
          }
        : {}),
    })
    .where(eq(reserva.id, reservaId));

  if (liberar) {
    await liberarNoitesPorOrigem(tx, "reserva", reservaId);
  }

  if (novo === "confirmada") {
    await avisarConfirmacao(tx, anfitriaoId, reservaId);
  }

  await auditar(tx, {
    anfitriaoId,
    entidade: "reserva",
    entidadeId: reservaId,
    acao: `mudou_para_${novo}`,
    valorAntes: { status: de },
    valorDepois: { status: novo, motivo: contexto.motivo ?? null },
    autor: contexto.autor,
  });

  return { status: novo, noitesLiberadas: liberar, devolucaoCentavos };
}

async function calcularDevolucao(
  tx: Tx,
  r: typeof reserva.$inferSelect,
  hoje?: Noite,
): Promise<number> {
  const politica = await buscarPoliticaPadrao(tx);
  if (!politica || !hoje) return 0;

  const pagos = await tx
    .select()
    .from(pagamento)
    .where(eq(pagamento.reservaId, r.id));
  const pagoCentavos = pagos.reduce((s, p) => s + p.valorCentavos, 0);
  if (pagoCentavos <= 0) return 0;

  const { devolverCentavos } = devolucaoAoCancelar(
    politica.faixas,
    diferencaEmDias(hoje, r.entrada),
    pagoCentavos,
  );
  return devolverCentavos;
}

async function avisarConfirmacao(tx: Tx, anfitriaoId: string, reservaId: string) {
  const [r] = await tx.select().from(reserva).where(eq(reserva.id, reservaId)).limit(1);
  if (!r) return;

  const [titular] = await tx
    .select()
    .from(hospede)
    .where(eq(hospede.id, r.hospedeId))
    .limit(1);
  const propriedade = await buscarPropriedade(tx);

  const dados = {
    codigo: r.codigo,
    nomeHospede: titular?.nome ?? "hóspede",
    entrada: r.entrada,
    saida: r.saida,
    noites: noitesDaEstadia(r.entrada, r.saida).length,
    totalCentavos: r.totalCentavos,
    sinalCentavos: r.sinalCentavos,
    checkin: propriedade.checkinPadrao.slice(0, 5),
    checkout: propriedade.checkoutPadrao.slice(0, 5),
    nomeDaCasa: propriedade.nome,
  };

  const paraHospede = reservaConfirmadaParaHospede(dados);
  const paraAnfitriao = reservaConfirmadaParaAnfitriao(dados);
  const base = {
    anfitriaoId,
    evento: "reserva.confirmada",
    referenciaTipo: "reserva",
    referenciaId: reservaId,
  };

  await enfileirar(tx, [
    ...(titular?.email
      ? [{ ...base, canal: "email" as const, paraQuem: "hospede" as const, destinatario: titular.email, nomeDestinatario: titular.nome, ...paraHospede }]
      : []),
    ...(titular?.telefone
      ? [{ ...base, canal: "whatsapp" as const, paraQuem: "hospede" as const, destinatario: apenasDigitos(titular.telefone), nomeDestinatario: titular.nome, assunto: null, corpo: paraHospede.corpo }]
      : []),
    ...(propriedade.emailContato
      ? [{ ...base, canal: "email" as const, paraQuem: "anfitriao" as const, destinatario: propriedade.emailContato, nomeDestinatario: propriedade.nome, ...paraAnfitriao }]
      : []),
    ...(propriedade.whatsappContato
      ? [{ ...base, canal: "whatsapp" as const, paraQuem: "anfitriao" as const, destinatario: apenasDigitos(propriedade.whatsappContato), nomeDestinatario: propriedade.nome, assunto: null, corpo: paraAnfitriao.corpo }]
      : []),
  ]);
}

export { NoiteIndisponivelError };
