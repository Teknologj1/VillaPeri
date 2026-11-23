"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenant } from "@/db/tenant";
import { comoNoite } from "@/lib/data";
import { exigirSessao } from "@/lib/sessao";
import { podeNoModulo } from "@/modules/autenticacao";
import {
  BloqueioEmConflitoError,
  abrirDatas,
  fecharDatas,
} from "@/modules/calendario";

export type EstadoDoCalendario = { erro?: string; aviso?: string } | null;

const MOTIVOS = [
  "reforma",
  "uso_proprietario",
  "fechamento",
  "evento_privado",
  "outro",
] as const;

const esquemaFechar = z.object({
  primeiraNoite: z.string(),
  ultimaNoite: z.string(),
  motivo: z.enum(MOTIVOS),
  observacao: z.string().trim().max(300).optional(),
  unidadeId: z.union([z.uuid(), z.literal("")]).optional(),
  propriedadeId: z.uuid(),
});

/**
 * Fecha datas no calendário.
 *
 * Exige `editar` em calendário: tirar noites de venda é decisão de quem manda
 * na agenda da casa, não operação de balcão.
 *
 * O serviço RECUSA fechar por cima de reserva e devolve quais são. Isso é
 * deliberado: um bloqueio que apagasse a reserva em silêncio deixaria um
 * hóspede com data confirmada e sem lugar. O sistema prefere mostrar o
 * conflito e deixar a pessoa remanejar.
 */
export async function fecharDatasNoCalendario(
  _estado: EstadoDoCalendario,
  dados: FormData,
): Promise<EstadoDoCalendario> {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "calendario", "editar")) {
    return { erro: "Seu perfil não fecha datas." };
  }

  const analise = esquemaFechar.safeParse(Object.fromEntries(dados));
  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? "Confira os dados." };
  }
  const d = analise.data;

  let primeira: string;
  let ultima: string;
  try {
    primeira = comoNoite(d.primeiraNoite);
    ultima = comoNoite(d.ultimaNoite);
  } catch {
    return { erro: "Datas inválidas." };
  }
  if (ultima < primeira) {
    return { erro: "A última noite não pode ser antes da primeira." };
  }

  try {
    const r = await withTenant(sessao.anfitriaoId, (tx) =>
      fecharDatas(tx, sessao.anfitriaoId, {
        // Sem unidade escolhida, fecha a propriedade inteira — que na Villa
        // Peri é o caso normal: a casa é locada inteira.
        escopo: d.unidadeId
          ? { unidadeId: d.unidadeId }
          : { propriedadeId: d.propriedadeId },
        primeiraNoite: primeira,
        ultimaNoite: ultima,
        motivo: d.motivo,
        observacao: d.observacao || undefined,
      }),
    );

    revalidatePath("/painel/calendario");
    revalidatePath("/painel/hoje");
    return {
      aviso: `${r.noitesFechadas} ${
        r.noitesFechadas === 1 ? "noite fechada" : "noites fechadas"
      }.`,
    };
  } catch (erro) {
    if (erro instanceof BloqueioEmConflitoError) {
      const quantas = erro.conflitos.reduce((s, c) => s + c.noites.length, 0);
      return {
        erro:
          `Há reserva nessas datas (${quantas} noite${quantas === 1 ? "" : "s"} ` +
          `em ${erro.conflitos.length} reserva${erro.conflitos.length === 1 ? "" : "s"}). ` +
          "O sistema não fecha por cima: remarque ou cancele a reserva antes, " +
          "para o hóspede não ficar com data confirmada e sem lugar.",
      };
    }
    if (erro instanceof Error) return { erro: erro.message };
    throw erro;
  }
}

export async function reabrirDatas(
  _estado: EstadoDoCalendario,
  dados: FormData,
): Promise<EstadoDoCalendario> {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "calendario", "editar")) {
    return { erro: "Seu perfil não reabre datas." };
  }

  const id = String(dados.get("id") ?? "");
  if (!id) return { erro: "Fechamento não informado." };

  const r = await withTenant(sessao.anfitriaoId, (tx) =>
    abrirDatas(tx, sessao.anfitriaoId, id, {
      tipo: "usuario",
      id: sessao.usuarioId,
    }),
  );

  revalidatePath("/painel/calendario");
  revalidatePath("/painel/hoje");
  return {
    aviso: `${r.noitesLiberadas} ${
      r.noitesLiberadas === 1 ? "noite voltou" : "noites voltaram"
    } a vender.`,
  };
}
