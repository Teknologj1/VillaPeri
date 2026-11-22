"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenant } from "@/db/tenant";
import { env } from "@/env";
import { comoNoite, hojeNaPropriedade } from "@/lib/data";
import { centavosDeTexto, formatarReais } from "@/lib/dinheiro";
import { exigirSessao } from "@/lib/sessao";
import { podeNoModulo } from "@/modules/autenticacao";
import { NoiteIndisponivelError } from "@/modules/calendario";
import {
  AlteracaoInvalidaError,
  TODOS_OS_STATUS,
  TransicaoInvalidaError,
  buscarReservaPorCodigo,
  conferirFnrh,
  enviarLinkDaFnrh,
  mudarStatus,
  registrarPagamento,
  remarcar,
  saidaAntecipada,
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

// ---------------------------------------------------------------------------
// Ficha de registro de hóspedes
// ---------------------------------------------------------------------------

const esquemaFnrh = z.object({
  codigo: z.string().trim().min(3).max(20),
  acao: z.enum(["enviar", "conferir"]),
});

/**
 * Manda o link da ficha ao hóspede, ou marca a ficha como conferida.
 *
 * Duas ações numa action só porque são o mesmo botão em momentos diferentes
 * do mesmo fluxo — e a tela decide qual mostrar pelo estado da ficha.
 */
export async function acaoDaFnrh(
  _estado: EstadoDaAcao,
  dados: FormData,
): Promise<EstadoDaAcao> {
  const sessao = await exigirSessao();

  const analise = esquemaFnrh.safeParse(Object.fromEntries(dados));
  if (!analise.success) return { erro: "Pedido inválido." };
  const { codigo, acao } = analise.data;

  if (!podeNoModulo(sessao, "reservas", "lancar")) {
    return { erro: "Seu perfil não pode mexer na ficha de registro." };
  }

  try {
    const resultado = await withTenant(sessao.anfitriaoId, async (tx) => {
      const ficha = await buscarReservaPorCodigo(tx, codigo);
      if (!ficha) return null;

      const autor = { tipo: "usuario" as const, id: sessao.usuarioId };

      if (acao === "conferir") {
        await conferirFnrh(tx, sessao.anfitriaoId, ficha.reserva.id, autor);
        return { aviso: "Ficha conferida." };
      }

      const { url } = await enviarLinkDaFnrh(
        tx,
        sessao.anfitriaoId,
        ficha.reserva.id,
        autor,
      );
      // O link vai na resposta para a recepção poder mandar à mão quando
      // quiser — e, enquanto não houver provedor configurado, é o único jeito
      // de ele chegar ao hóspede. A fila guarda a mensagem; ela não some.
      return { aviso: `Link enfileirado para envio: ${url}` };
    });

    if (!resultado) return { erro: "Reserva não encontrada." };

    revalidatePath(`/painel/reservas/${codigo}`);
    revalidatePath("/painel/reservas");
    revalidatePath("/painel/hoje");
    return resultado;
  } catch (erro) {
    // `conferirFnrh` recusa conferir o que não foi preenchido, com a razão
    // escrita. Repassar é mais útil que "erro inesperado".
    if (erro instanceof Error && erro.message.startsWith("Só se confere")) {
      return { erro: erro.message };
    }
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Variações: remarcar, trocar de unidade, estender, sair antes
// ---------------------------------------------------------------------------

const esquemaRemarcacao = z.object({
  codigo: z.string().trim().min(3).max(20),
  entrada: z.string().optional(),
  saida: z.string().optional(),
  unidadeId: z.union([z.uuid(), z.literal("")]).optional(),
});

/**
 * Remarca datas e/ou troca de unidade.
 *
 * Exige `editar` em reservas: mexe em reserva já fechada, com efeito no
 * calendário e no que o hóspede deve. Check-in e check-out são operação de
 * recepção; isto é decisão de quem pode alterar um acordo.
 */
export async function remarcarReserva(
  _estado: EstadoDaAcao,
  dados: FormData,
): Promise<EstadoDaAcao> {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "reservas", "editar")) {
    return { erro: "Seu perfil não remarca reservas." };
  }

  const analise = esquemaRemarcacao.safeParse(Object.fromEntries(dados));
  if (!analise.success) return { erro: "Pedido inválido." };
  const d = analise.data;

  let entrada: string | undefined;
  let saida: string | undefined;
  try {
    entrada = d.entrada ? comoNoite(d.entrada) : undefined;
    saida = d.saida ? comoNoite(d.saida) : undefined;
  } catch {
    return { erro: "Datas inválidas." };
  }

  try {
    const resultado = await withTenant(sessao.anfitriaoId, async (tx) => {
      const ficha = await buscarReservaPorCodigo(tx, d.codigo);
      if (!ficha) return null;

      return remarcar(tx, sessao.anfitriaoId, ficha.reserva.id, {
        entrada,
        saida,
        unidadeId: d.unidadeId || undefined,
        autor: { tipo: "usuario", id: sessao.usuarioId },
      });
    });

    if (!resultado) return { erro: "Reserva não encontrada." };

    revalidatePath(`/painel/reservas/${d.codigo}`);
    revalidatePath("/painel/reservas");
    revalidatePath("/painel/hoje");

    const dif = resultado.diferencaCentavos;
    return {
      aviso: !resultado.recalculou
        ? "Unidade trocada. O preço não muda dentro do mesmo tipo."
        : dif > 0
          ? `Remarcada. O hóspede passa a dever mais ${formatarReais(dif)}.`
          : dif < 0
            ? `Remarcada. Há ${formatarReais(-dif)} de crédito a devolver.`
            : "Remarcada. O total não mudou.",
    };
  } catch (erro) {
    if (erro instanceof AlteracaoInvalidaError) return { erro: erro.message };
    if (erro instanceof NoiteIndisponivelError) {
      return {
        erro:
          (erro.noite
            ? `A noite de ${erro.noite} já está ocupada. `
            : "Alguma das novas noites já está ocupada. ") +
          "Nada foi alterado: a reserva continua com as datas que tinha.",
      };
    }
    throw erro;
  }
}

const esquemaSaida = z.object({
  codigo: z.string().trim().min(3).max(20),
  novaSaida: z.string(),
});

/**
 * O hóspede vai embora antes.
 *
 * Libera as noites não usadas no calendário — a casa volta a vender — e
 * aplica a política configurada, que na Villa Peri cobra a estadia inteira.
 */
export async function registrarSaidaAntecipada(
  _estado: EstadoDaAcao,
  dados: FormData,
): Promise<EstadoDaAcao> {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "reservas", "editar")) {
    return { erro: "Seu perfil não registra saída antecipada." };
  }

  const analise = esquemaSaida.safeParse(Object.fromEntries(dados));
  if (!analise.success) return { erro: "Pedido inválido." };

  let novaSaida: string;
  try {
    novaSaida = comoNoite(analise.data.novaSaida);
  } catch {
    return { erro: "Data inválida." };
  }

  try {
    const resultado = await withTenant(sessao.anfitriaoId, async (tx) => {
      const ficha = await buscarReservaPorCodigo(tx, analise.data.codigo);
      if (!ficha) return null;

      return saidaAntecipada(
        tx,
        sessao.anfitriaoId,
        ficha.reserva.id,
        novaSaida,
        { tipo: "usuario", id: sessao.usuarioId },
      );
    });

    if (!resultado) return { erro: "Reserva não encontrada." };

    revalidatePath(`/painel/reservas/${analise.data.codigo}`);
    revalidatePath("/painel/reservas");
    revalidatePath("/painel/hoje");

    const n = resultado.noitesLiberadas;
    return {
      aviso:
        `${n} ${n === 1 ? "noite liberada" : "noites liberadas"} no calendário. ` +
        (resultado.devolucaoCentavos > 0
          ? `Pela política, devolver ${formatarReais(resultado.devolucaoCentavos)} — ` +
            "lance o reembolso quando a transferência sair."
          : "Pela política da casa, a estadia é cobrada por inteiro: nada a devolver."),
    };
  } catch (erro) {
    if (erro instanceof AlteracaoInvalidaError) return { erro: erro.message };
    throw erro;
  }
}
