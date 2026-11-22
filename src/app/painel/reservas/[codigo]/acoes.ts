"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenant } from "@/db/tenant";
import { env } from "@/env";
import { comoNoite, hojeNaPropriedade } from "@/lib/data";
import { centavosDeTexto, formatarReais } from "@/lib/dinheiro";
import { exigirSessao } from "@/lib/sessao";
import { podeNoModulo } from "@/modules/autenticacao";
import {
  TODOS_OS_STATUS,
  TransicaoInvalidaError,
  buscarReservaPorCodigo,
  mudarStatus,
  registrarPagamento,
} from "@/modules/reservas";

export type EstadoDaAcao = { erro?: string; aviso?: string } | null;

const esquemaStatus = z.object({
  codigo: z.string().trim().min(3).max(20),
  para: z.enum(TODOS_OS_STATUS as [string, ...string[]]),
  motivo: z.string().trim().max(500).optional(),
});

/**
 * Move a reserva de status.
 *
 * A permissão é conferida AQUI, no servidor, e não só pelos botões que a tela
 * mostra: uma action é um endpoint, e quem souber o nome dela pode chamá-la
 * sem passar pela página. Esconder o botão é conforto; isto é a trava.
 */
export async function mudarStatusDaReserva(
  _estado: EstadoDaAcao,
  dados: FormData,
): Promise<EstadoDaAcao> {
  const sessao = await exigirSessao();

  const analise = esquemaStatus.safeParse(Object.fromEntries(dados));
  if (!analise.success) return { erro: "Pedido inválido." };
  const { codigo, para, motivo } = analise.data;

  // Check-in e check-out são operação de recepção (`lancar`); cancelar e
  // reverter mexem em reserva já fechada, e são de quem tem `editar`.
  const exige = para === "hospedado" || para === "concluida" ? "lancar" : "editar";
  if (!podeNoModulo(sessao, "reservas", exige)) {
    return {
      erro: `Seu perfil não pode fazer isso (precisa de "${exige}" em reservas).`,
    };
  }

  if (para === "cancelada" && !motivo) {
    return { erro: "Diga o motivo do cancelamento." };
  }

  const hoje = hojeNaPropriedade(env.TZ_PROPRIEDADE);

  try {
    const resultado = await withTenant(sessao.anfitriaoId, async (tx) => {
      const ficha = await buscarReservaPorCodigo(tx, codigo);
      if (!ficha) return null;

      return mudarStatus(tx, sessao.anfitriaoId, ficha.reserva.id, para as never, {
        autor: { tipo: "usuario", id: sessao.usuarioId },
        motivo,
        hojeNaCasa: hoje,
      });
    });

    if (!resultado) return { erro: "Reserva não encontrada." };

    revalidatePath(`/painel/reservas/${codigo}`);
    revalidatePath("/painel/reservas");
    revalidatePath("/painel/hoje");

    // A devolução é CALCULADA e avisada, não lançada sozinha: o dinheiro só
    // sai quando alguém manda, e inventar um reembolso na tabela antes de a
    // transferência existir faria o financeiro mentir.
    if (resultado.devolucaoCentavos && resultado.devolucaoCentavos > 0) {
      return {
        aviso: `Cancelada. Pela política, devolver ${formatarReais(
          resultado.devolucaoCentavos,
        )} — lance o reembolso quando a transferência sair.`,
      };
    }
    return null;
  } catch (erro) {
    // A máquina de status já explica o que é possível a partir de onde a
    // reserva está; repassar isso é mais útil que "erro inesperado".
    if (erro instanceof TransicaoInvalidaError) return { erro: erro.message };
    throw erro;
  }
}

const esquemaPagamento = z.object({
  codigo: z.string().trim().min(3).max(20),
  tipo: z.enum(["sinal", "saldo", "extra", "reembolso"]),
  metodo: z.enum(["pix", "cartao", "dinheiro", "transferencia", "outro"]),
  /** Em reais, como a pessoa digita: "1.234,56" ou "1234.56". */
  valor: z.string().trim().min(1, "Informe o valor."),
  data: z.string(),
  observacao: z.string().trim().max(300).optional(),
});

export async function lancarPagamento(
  _estado: EstadoDaAcao,
  dados: FormData,
): Promise<EstadoDaAcao> {
  const sessao = await exigirSessao();

  if (!podeNoModulo(sessao, "reservas", "lancar")) {
    return { erro: "Seu perfil não pode lançar pagamentos." };
  }

  const analise = esquemaPagamento.safeParse(Object.fromEntries(dados));
  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? "Confira os dados." };
  }
  const d = analise.data;

  const centavos = centavosDeTexto(d.valor);
  if (centavos === null || centavos === 0) {
    return { erro: "Valor inválido. Escreva como 1.234,56." };
  }

  let data: string;
  try {
    data = comoNoite(d.data);
  } catch {
    return { erro: "Data inválida." };
  }

  // O reembolso é o único que entra negativo, e entra sempre: é o que faz a
  // soma dos lançamentos ser a receita real da reserva.
  const valorCentavos =
    d.tipo === "reembolso" ? -Math.abs(centavos) : Math.abs(centavos);

  const ok = await withTenant(sessao.anfitriaoId, async (tx) => {
    const ficha = await buscarReservaPorCodigo(tx, d.codigo);
    if (!ficha) return false;

    await registrarPagamento(tx, sessao.anfitriaoId, {
      reservaId: ficha.reserva.id,
      tipo: d.tipo,
      metodo: d.metodo,
      valorCentavos,
      data,
      observacao: d.observacao || null,
      autor: { tipo: "usuario", id: sessao.usuarioId },
    });
    return true;
  });

  if (!ok) return { erro: "Reserva não encontrada." };

  revalidatePath(`/painel/reservas/${d.codigo}`);
  revalidatePath("/painel/reservas");
  return null;
}
