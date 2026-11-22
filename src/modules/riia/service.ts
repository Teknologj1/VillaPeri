import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import type { Tx } from "@/db/tenant";

import { acaoRiia, baseConhecimento, conversa } from "./schema";

/**
 * A conversa, a trilha de ações e a base de conhecimento.
 *
 * O que NÃO está aqui: regra de negócio. A RIIA propõe e o sistema decide —
 * e quem decide são os módulos de Calendário, Tarifas e Reservas, chamados
 * pelas rotas. Este módulo cuida de quem está falando e do que já foi feito.
 */

// ---------------------------------------------------------------------------
// Conversa
// ---------------------------------------------------------------------------

export type Conversa = typeof conversa.$inferSelect;

/**
 * A conversa daquele telefone, criada na primeira mensagem.
 *
 * O telefone é a identidade do hóspede no WhatsApp: é por ele que
 * `consultar_reserva` decide se quem pergunta é o titular, e é por ele que a
 * recepção reencontra o fio da conversa ao assumir um atendimento.
 */
export async function acharOuCriarConversa(
  tx: Tx,
  anfitriaoId: string,
  telefone: string,
  nome?: string | null,
): Promise<string> {
  const [existente] = await tx
    .select({ id: conversa.id })
    .from(conversa)
    .where(eq(conversa.telefone, telefone))
    .limit(1);

  if (existente) {
    await tx
      .update(conversa)
      .set({ ultimaMensagemEm: new Date(), ...(nome ? { nome } : {}) })
      .where(eq(conversa.id, existente.id));
    return existente.id;
  }

  const [criada] = await tx
    .insert(conversa)
    .values({
      anfitriaoId,
      telefone,
      nome: nome ?? null,
      ultimaMensagemEm: new Date(),
    })
    .returning({ id: conversa.id });

  if (!criada) throw new Error("Não foi possível abrir a conversa.");
  return criada.id;
}

export async function buscarConversa(
  tx: Tx,
  id: string,
): Promise<Conversa | null> {
  const [linha] = await tx
    .select()
    .from(conversa)
    .where(eq(conversa.id, id))
    .limit(1);
  return linha ?? null;
}

/**
 * Passa a conversa para uma pessoa.
 *
 * Vira tarefa da recepção: a conversa muda de dono e entra na lista de
 * transferências do painel com o resumo que a RIIA escreveu. É o que a
 * especificação pede em desconto acima do limite, exceção ao mínimo,
 * reclamação e em qualquer pedido que nenhuma ferramenta cobre.
 */
export async function transferirParaHumano(
  tx: Tx,
  id: string,
  dados: { motivo: string; resumo?: string | null },
): Promise<void> {
  await tx
    .update(conversa)
    .set({
      atendidaPor: "pessoa",
      transferidaEm: new Date(),
      motivoTransferencia: dados.motivo,
      ...(dados.resumo ? { resumo: dados.resumo } : {}),
      // Uma transferência nova volta a esperar alguém, mesmo que a anterior
      // já tivesse sido assumida.
      assumidaPor: null,
      assumidaEm: null,
      atualizadoEm: new Date(),
    })
    .where(eq(conversa.id, id));
}

/** A recepção assume o atendimento transferido. */
export async function assumirConversa(
  tx: Tx,
  id: string,
  usuarioId: string,
): Promise<void> {
  await tx
    .update(conversa)
    .set({ assumidaPor: usuarioId, assumidaEm: new Date() })
    .where(eq(conversa.id, id));
}

/** As transferências esperando alguém da recepção. */
export async function transferenciasAbertas(tx: Tx): Promise<Conversa[]> {
  return tx
    .select()
    .from(conversa)
    .where(and(isNotNull(conversa.transferidaEm), isNull(conversa.assumidaPor)))
    .orderBy(desc(conversa.transferidaEm));
}

/** Liga a conversa ao hóspede e à reserva, quando a reserva é criada. */
export async function vincularConversa(
  tx: Tx,
  id: string,
  dados: { hospedeId?: string; reservaId?: string },
): Promise<void> {
  await tx
    .update(conversa)
    .set({
      ...(dados.hospedeId ? { hospedeId: dados.hospedeId } : {}),
      ...(dados.reservaId ? { reservaId: dados.reservaId } : {}),
      atualizadoEm: new Date(),
    })
    .where(eq(conversa.id, id));
}

// ---------------------------------------------------------------------------
// Trilha de ações
// ---------------------------------------------------------------------------

export type AcaoParaRegistrar = {
  chaveApiId: string | null;
  conversaId: string | null;
  ferramenta: string;
  chaveIdempotencia?: string | null;
  parametros?: unknown;
  resultado?: unknown;
  statusHttp: number;
};

/**
 * Registra cada chamada de ferramenta, inclusive as recusadas.
 *
 * As recusas são o registro mais útil: é por elas que se descobre que a RIIA
 * está tentando algo que o nível não permite, ou que uma chave está sem um
 * escopo que deveria ter.
 */
export async function registrarAcao(
  tx: Tx,
  anfitriaoId: string,
  acao: AcaoParaRegistrar,
): Promise<void> {
  await tx.insert(acaoRiia).values({
    anfitriaoId,
    chaveApiId: acao.chaveApiId,
    conversaId: acao.conversaId,
    ferramenta: acao.ferramenta,
    chaveIdempotencia: acao.chaveIdempotencia ?? null,
    parametros: (acao.parametros ?? null) as object,
    resultado: (acao.resultado ?? null) as object,
    statusHttp: acao.statusHttp,
  });
}

export async function acoesDaConversa(
  tx: Tx,
  conversaId: string,
  limite = 50,
): Promise<(typeof acaoRiia.$inferSelect)[]> {
  return tx
    .select()
    .from(acaoRiia)
    .where(eq(acaoRiia.conversaId, conversaId))
    .orderBy(desc(acaoRiia.criadoEm))
    .limit(limite);
}

// ---------------------------------------------------------------------------
// Base de conhecimento
// ---------------------------------------------------------------------------

export type ItemDeConhecimento = typeof baseConhecimento.$inferSelect;

export type TemaDeConhecimento =
  | "politica"
  | "passeio"
  | "como_chegar"
  | "pergunta_frequente"
  | "a_casa";

/**
 * O que responder sobre passeios, como chegar e perguntas frequentes.
 *
 * A busca é por termo simples sobre título, texto e palavras-chave — sem
 * busca semântica de propósito. Quem faz a interpretação da pergunta é a
 * RIIA, que é um modelo de linguagem; o papel daqui é entregar o texto certo
 * sem inventar nada. Uma base de algumas dezenas de itens não precisa de mais.
 */
export async function consultarBase(
  tx: Tx,
  filtro: { tema?: TemaDeConhecimento; busca?: string; limite?: number } = {},
): Promise<ItemDeConhecimento[]> {
  const itens = await tx
    .select()
    .from(baseConhecimento)
    .where(
      filtro.tema
        ? and(
            eq(baseConhecimento.publicado, true),
            eq(baseConhecimento.tema, filtro.tema),
          )
        : eq(baseConhecimento.publicado, true),
    )
    .orderBy(baseConhecimento.ordem, baseConhecimento.titulo);

  const termo = filtro.busca?.trim().toLowerCase();
  const escolhidos = termo
    ? itens.filter((i) => combina(i, termo))
    : itens;

  return escolhidos.slice(0, filtro.limite ?? 20);
}

/**
 * Compara sem acento e sem caixa.
 *
 * O hóspede escreve "cachoeira" e o item diz "Cachoeiras"; escreve "pirenopolis"
 * e o item diz "Pirenópolis". Exigir o acento certo numa busca de WhatsApp é
 * garantir que metade das perguntas não ache nada.
 */
function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function combina(item: ItemDeConhecimento, termo: string): boolean {
  const alvo = normalizar(termo);
  const palavras = alvo.split(/\s+/).filter((p) => p.length > 2);
  const texto = normalizar(
    `${item.titulo} ${item.texto} ${item.termos.join(" ")}`,
  );
  if (palavras.length === 0) return texto.includes(alvo);
  return palavras.some((p) => texto.includes(p));
}
