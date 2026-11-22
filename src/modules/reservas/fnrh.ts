import { randomBytes } from "node:crypto";

import { and, eq, gt, inArray } from "drizzle-orm";

import type { Tx } from "@/db/tenant";
import { type Noite } from "@/lib/data";
import { apenasDigitos } from "@/lib/telefone";
import { buscarPropriedade } from "@/modules/anfitriao";
import { type Autor, auditar } from "@/modules/auditoria";
import { enfileirar, linkDaFnrh } from "@/modules/notificacoes";

import { acompanhante, hospede, reserva } from "./schema";

/**
 * A Ficha Nacional de Registro de Hóspedes.
 *
 * Obrigatória em formato digital desde 20/04/2026. Na prática é o cadastro do
 * hóspede e de quem vem com ele — e é por isso que ela NÃO tem tabela
 * própria: o documento, o nascimento e a origem são da pessoa, e guardá-los
 * numa cópia por reserva criaria duas verdades sobre o mesmo ser humano, que
 * divergem na segunda estadia.
 *
 * O que é da reserva — enviada, preenchida, conferida — fica na reserva.
 */

/** Quantos dias o link vale. Depois disso o hóspede pede outro. */
const DIAS_DE_VALIDADE = 60;

export type StatusFnrh =
  | "nao_enviada"
  | "link_enviado"
  | "preenchida"
  | "conferida";

/**
 * Gera (ou reaproveita) o token e manda o link ao hóspede.
 *
 * Reaproveita o token existente quando ainda está no prazo: o hóspede pode ter
 * guardado o link da primeira mensagem, e invalidá-lo a cada reenvio faria o
 * reenvio quebrar justamente quem estava tentando usar o primeiro.
 */
export async function enviarLinkDaFnrh(
  tx: Tx,
  anfitriaoId: string,
  reservaId: string,
  autor: Autor,
): Promise<{ token: string; url: string }> {
  const [r] = await tx
    .select()
    .from(reserva)
    .where(eq(reserva.id, reservaId))
    .limit(1);
  if (!r) throw new Error("Reserva não encontrada.");

  const agora = new Date();
  const aindaVale =
    r.fnrhToken && r.fnrhExpiraEm && r.fnrhExpiraEm.getTime() > agora.getTime();

  const token = aindaVale ? r.fnrhToken! : randomBytes(24).toString("base64url");
  const expiraEm = aindaVale
    ? r.fnrhExpiraEm!
    : new Date(agora.getTime() + DIAS_DE_VALIDADE * 24 * 60 * 60_000);

  await tx
    .update(reserva)
    .set({
      fnrhToken: token,
      fnrhExpiraEm: expiraEm,
      // Quem já preencheu não volta para "enviada" só porque alguém reenviou
      // o link: o estado anda para frente, e perder "preenchida" faria a
      // recepção conferir de novo o que já estava conferido.
      fnrhStatus: r.fnrhStatus === "nao_enviada" ? "link_enviado" : r.fnrhStatus,
      atualizadoEm: agora,
    })
    .where(eq(reserva.id, reservaId));

  const [titular] = await tx
    .select()
    .from(hospede)
    .where(eq(hospede.id, r.hospedeId))
    .limit(1);
  const propriedade = await buscarPropriedade(tx);

  const mensagem = linkDaFnrh({
    nomeHospede: titular?.nome ?? "hóspede",
    nomeDaCasa: propriedade.nome,
    entrada: r.entrada,
    token,
  });

  const base = {
    anfitriaoId,
    evento: "fnrh.link_enviado",
    referenciaTipo: "reserva",
    referenciaId: reservaId,
    paraQuem: "hospede" as const,
    nomeDestinatario: titular?.nome ?? null,
  };

  await enfileirar(tx, [
    ...(titular?.email
      ? [{ ...base, canal: "email" as const, destinatario: titular.email, ...mensagem }]
      : []),
    ...(titular?.telefone
      ? [
          {
            ...base,
            canal: "whatsapp" as const,
            destinatario: apenasDigitos(titular.telefone),
            assunto: null,
            corpo: mensagem.corpo,
          },
        ]
      : []),
  ]);

  await auditar(tx, {
    anfitriaoId,
    entidade: "reserva",
    entidadeId: reservaId,
    acao: "enviou_link_fnrh",
    valorDepois: { expiraEm, reaproveitado: Boolean(aindaVale) },
    autor,
  });

  return { token, url: mensagem.url };
}

// ---------------------------------------------------------------------------
// A página pública
// ---------------------------------------------------------------------------

export type FichaParaPreencher = {
  reservaId: string;
  codigo: string;
  entrada: Noite;
  saida: Noite;
  adultos: number;
  criancas: number;
  status: StatusFnrh;
  nomeDaCasa: string;
  titular: {
    id: string;
    nome: string;
    documento: string | null;
    nascimento: string | null;
    nacionalidade: string | null;
    cidade: string | null;
    uf: string | null;
    motivoViagem: string | null;
  };
  acompanhantes: { nome: string; documento: string | null; nascimento: string | null }[];
};

/**
 * O que a página pública mostra, e só isso.
 *
 * Não devolve preço, nem pagamento, nem nota interna. A pessoa do outro lado
 * tem um link e mais nada — e um link que vaza não pode virar acesso ao
 * financeiro da casa.
 *
 * O token já foi validado pela função do banco que descobriu o anfitrião; a
 * condição é repetida aqui de propósito. A função devolve só um uuid, e quem
 * confia nela sozinha abre a porta para alguém que tenha o id do anfitrião
 * por outro caminho pedir qualquer reserva.
 */
export async function fichaPorToken(
  tx: Tx,
  token: string,
): Promise<FichaParaPreencher | null> {
  const [r] = await tx
    .select()
    .from(reserva)
    .where(
      and(
        eq(reserva.fnrhToken, token),
        gt(reserva.fnrhExpiraEm, new Date()),
        inArray(reserva.status, ["confirmada", "hospedado"]),
      ),
    )
    .limit(1);
  if (!r) return null;

  const [titular] = await tx
    .select()
    .from(hospede)
    .where(eq(hospede.id, r.hospedeId))
    .limit(1);
  if (!titular) return null;

  const acompanhantes = await tx
    .select()
    .from(acompanhante)
    .where(eq(acompanhante.reservaId, r.id));

  const propriedade = await buscarPropriedade(tx);

  return {
    reservaId: r.id,
    codigo: r.codigo,
    entrada: r.entrada,
    saida: r.saida,
    adultos: r.adultos,
    criancas: r.criancas,
    status: r.fnrhStatus as StatusFnrh,
    nomeDaCasa: propriedade.nome,
    titular: {
      id: titular.id,
      nome: titular.nome,
      documento: titular.documento,
      nascimento: titular.nascimento,
      nacionalidade: titular.nacionalidade,
      cidade: titular.cidade,
      uf: titular.uf,
      motivoViagem: titular.motivoViagem,
    },
    acompanhantes: acompanhantes.map((a) => ({
      nome: a.nome,
      documento: a.documento,
      nascimento: a.nascimento,
    })),
  };
}

export type DadosDaFnrh = {
  documento: string;
  nascimento: Noite;
  nacionalidade: string;
  cidade: string;
  uf: string;
  motivoViagem?: string | null;
  acompanhantes: {
    nome: string;
    documento?: string | null;
    nascimento?: string | null;
  }[];
};

/**
 * Grava o que o hóspede preencheu.
 *
 * O token é revalidado aqui, e não só na leitura da página: entre abrir o
 * formulário e enviá-lo pode ter passado um mês, a reserva pode ter sido
 * cancelada e o prazo pode ter vencido. Validar só na exibição é confiar que
 * o mundo não muda entre duas requisições.
 *
 * Os acompanhantes são substituídos por inteiro, e não somados: o hóspede que
 * corrige um nome e reenvia espera ver a lista que digitou, não a antiga com
 * a nova grudada embaixo.
 */
export async function preencherFnrh(
  tx: Tx,
  anfitriaoId: string,
  token: string,
  dados: DadosDaFnrh,
): Promise<{ codigo: string } | null> {
  const [r] = await tx
    .select()
    .from(reserva)
    .where(
      and(
        eq(reserva.fnrhToken, token),
        gt(reserva.fnrhExpiraEm, new Date()),
        inArray(reserva.status, ["confirmada", "hospedado"]),
      ),
    )
    .limit(1);
  if (!r) return null;

  const agora = new Date();

  await tx
    .update(hospede)
    .set({
      documento: dados.documento.trim(),
      nascimento: dados.nascimento,
      nacionalidade: dados.nacionalidade.trim(),
      cidade: dados.cidade.trim(),
      uf: dados.uf.trim().toUpperCase().slice(0, 2),
      motivoViagem: dados.motivoViagem?.trim() || null,
      // O aceite é dado aqui, pelo próprio titular, e fica datado: é a prova
      // de que os dados foram entregues com consentimento.
      aceiteLgpd: true,
      aceiteLgpdEm: agora,
      atualizadoEm: agora,
    })
    .where(eq(hospede.id, r.hospedeId));

  await tx.delete(acompanhante).where(eq(acompanhante.reservaId, r.id));

  const novos = dados.acompanhantes.filter((a) => a.nome.trim().length > 1);
  if (novos.length > 0) {
    await tx.insert(acompanhante).values(
      novos.map((a) => ({
        anfitriaoId,
        reservaId: r.id,
        nome: a.nome.trim(),
        documento: a.documento?.trim() || null,
        nascimento: a.nascimento || null,
      })),
    );
  }

  await tx
    .update(reserva)
    .set({
      // Quem já estava "conferida" e corrige um dado volta para "preenchida":
      // a conferência valeu para o que a recepção viu, não para o que veio
      // depois.
      fnrhStatus: "preenchida",
      atualizadoEm: agora,
    })
    .where(eq(reserva.id, r.id));

  await auditar(tx, {
    anfitriaoId,
    entidade: "reserva",
    entidadeId: r.id,
    acao: "preencheu_fnrh",
    valorDepois: { acompanhantes: novos.length },
    // O autor é o próprio hóspede, que não é usuário do sistema. Fica como
    // "sistema" porque a auditoria registra usuários, RIIA e o sistema — e
    // inventar um quarto tipo para um ator sem conta não ajudaria ninguém.
    autor: { tipo: "sistema" },
  });

  return { codigo: r.codigo };
}

/** A recepção confere a ficha preenchida. É o último estado. */
export async function conferirFnrh(
  tx: Tx,
  anfitriaoId: string,
  reservaId: string,
  autor: Autor,
): Promise<void> {
  const [r] = await tx
    .select()
    .from(reserva)
    .where(eq(reserva.id, reservaId))
    .limit(1);
  if (!r) throw new Error("Reserva não encontrada.");

  if (r.fnrhStatus !== "preenchida") {
    throw new Error(
      "Só se confere uma ficha preenchida. Esta está como " +
        `"${r.fnrhStatus}".`,
    );
  }

  await tx
    .update(reserva)
    .set({ fnrhStatus: "conferida", atualizadoEm: new Date() })
    .where(eq(reserva.id, reservaId));

  await auditar(tx, {
    anfitriaoId,
    entidade: "reserva",
    entidadeId: reservaId,
    acao: "conferiu_fnrh",
    autor,
  });
}
