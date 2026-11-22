"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { withTenant } from "@/db/tenant";
import { anfitriaoDaCasa } from "@/lib/anfitriao-publico";
import { comoNoite } from "@/lib/data";
import { contarSolicitacoesRecentes, criarSolicitacao } from "@/modules/reservas";

const esquema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome.").max(120),
  telefone: z
    .string()
    .trim()
    .transform((t) => t.replace(/\D/g, ""))
    .refine((t) => t.length >= 10 && t.length <= 13, "Informe um WhatsApp válido."),
  email: z.union([z.email(), z.literal("")]).optional(),
  entrada: z.string(),
  saida: z.string(),
  adultos: z.coerce.number().int().min(1).max(20),
  criancas: z.coerce.number().int().min(0).max(20),
  totalCentavos: z.coerce.number().int().min(0).optional(),
  observacao: z.string().trim().max(500).optional(),
});

export type EstadoDoPedido = { erro: string } | null;

/** Quantos pedidos o mesmo telefone pode abrir por hora. */
const LIMITE_POR_TELEFONE = 3;

/**
 * Registra o pedido e leva à página de confirmação.
 *
 * O pedido NÃO segura as noites — é a decisão da especificação, e é por isso
 * que o formulário pode ficar aberto a qualquer visitante. O que protege o
 * sistema aqui é o limite por telefone, não o calendário.
 */
export async function solicitarReserva(
  _estado: EstadoDoPedido,
  dados: FormData,
): Promise<EstadoDoPedido> {
  const analise = esquema.safeParse(Object.fromEntries(dados));
  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? "Confira os dados." };
  }
  const d = analise.data;

  let entrada: string;
  let saida: string;
  try {
    entrada = comoNoite(d.entrada);
    saida = comoNoite(d.saida);
  } catch {
    return { erro: "Datas inválidas." };
  }
  if (saida <= entrada) return { erro: "A saída tem de ser depois da entrada." };

  const anfitriaoId = await anfitriaoDaCasa();
  if (!anfitriaoId) return { erro: "Não foi possível registrar o pedido agora." };

  const umaHoraAtras = new Date(Date.now() - 60 * 60_000);

  const codigo = await withTenant(anfitriaoId, async (tx) => {
    // Freio simples contra repetição: o mesmo telefone não abre dezenas de
    // pedidos em sequência. Não substitui proteção contra robôs, mas segura
    // o caso comum de quem clica várias vezes.
    const recentes = await contarSolicitacoesRecentes(tx, d.telefone, umaHoraAtras);
    if (recentes >= LIMITE_POR_TELEFONE) return null;

    const criada = await criarSolicitacao(tx, anfitriaoId, {
      nome: d.nome,
      telefone: d.telefone,
      email: d.email || null,
      entrada,
      saida,
      adultos: d.adultos,
      criancas: d.criancas,
      totalCotadoCentavos: d.totalCentavos ?? null,
      origem: "site",
      observacao: d.observacao || null,
    });

    return criada.codigo;
  });

  if (!codigo) {
    return {
      erro:
        "Você já enviou alguns pedidos na última hora. Fale com a gente direto no WhatsApp.",
    };
  }

  redirect(`/reservar/enviado?codigo=${encodeURIComponent(codigo)}`);
}
