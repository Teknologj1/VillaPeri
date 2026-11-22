"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { withTenant } from "@/db/tenant";
import { comoNoite } from "@/lib/data";
import { exigirSessao } from "@/lib/sessao";
import { descontoDentroDoLimite, podeNoModulo } from "@/modules/autenticacao";
import { NoiteIndisponivelError, criarReserva } from "@/modules/reservas";
import { SemTarifaError } from "@/modules/tarifas";

export type EstadoDaNova = { erro: string } | null;

const CANAIS = [
  "balcao",
  "whatsapp",
  "site",
  "riia",
  "instagram",
  "indicacao",
  "airbnb",
] as const;

const esquema = z.object({
  unidadeId: z.uuid("Escolha a unidade."),
  tipoId: z.uuid(),
  entrada: z.string(),
  saida: z.string(),
  adultos: z.coerce.number().int().min(1).max(30),
  criancas: z.coerce.number().int().min(0).max(30),
  nome: z.string().trim().min(2, "Informe o nome do hóspede.").max(120),
  telefone: z
    .string()
    .trim()
    .transform((t) => t.replace(/\D/g, ""))
    .refine(
      (t) => t.length === 0 || (t.length >= 10 && t.length <= 13),
      "Telefone inválido.",
    ),
  email: z.union([z.email("E-mail inválido."), z.literal("")]).optional(),
  documento: z.string().trim().max(30).optional(),
  canal: z.enum(CANAIS),
  /** Em pontos-base: 10% = 1000. O formulário manda o percentual. */
  descontoPercentual: z.coerce.number().min(0).max(100).default(0),
  observacoes: z.string().trim().max(500).optional(),
  solicitacaoId: z.union([z.uuid(), z.literal("")]).optional(),
});

/**
 * Cria a reserva a partir do balcão ou do telefone.
 *
 * Nasce como PRÉ-RESERVA, que segura as noites por um prazo — e não como
 * confirmada. Confirmar é uma segunda decisão, que a recepção toma quando o
 * sinal entra. Criar já confirmada pareceria um atalho e tiraria do
 * calendário a diferença entre "alguém falou que vem" e "alguém pagou".
 *
 * Com desconto acima do que o perfil concede, nasce AGUARDANDO APROVAÇÃO: a
 * reserva existe, segura a data e espera o Gerente ou o Proprietário. Recusar
 * o desconto faria a recepção desligar o telefone sem resposta.
 */
export async function criarNovaReserva(
  _estado: EstadoDaNova,
  dados: FormData,
): Promise<EstadoDaNova> {
  const sessao = await exigirSessao();

  if (!podeNoModulo(sessao, "reservas", "lancar")) {
    return { erro: "Seu perfil não pode criar reservas." };
  }

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
  if (saida <= entrada) {
    return { erro: "A saída tem de ser depois da entrada." };
  }

  const descontoPontosBase = Math.round(d.descontoPercentual * 100);
  const precisaAprovacao = !descontoDentroDoLimite(sessao, descontoPontosBase);

  try {
    const criada = await withTenant(sessao.anfitriaoId, (tx) =>
      criarReserva(tx, sessao.anfitriaoId, {
        unidadeId: d.unidadeId,
        tipoId: d.tipoId,
        entrada,
        saida,
        adultos: d.adultos,
        criancas: d.criancas,
        hospede: {
          nome: d.nome,
          telefone: d.telefone || null,
          email: d.email || null,
          documento: d.documento || null,
        },
        canal: d.canal,
        descontoPontosBase,
        statusInicial: precisaAprovacao ? "aguardando_aprovacao" : "pre_reserva",
        solicitacaoId: d.solicitacaoId || null,
        observacoes: d.observacoes || null,
        autor: { tipo: "usuario", id: sessao.usuarioId },
      }),
    );

    redirect(`/painel/reservas/${criada.codigo}`);
  } catch (erro) {
    // A chave única (unidade, noite) é a garantia contra overbooking. Chegar
    // aqui quer dizer que alguém tomou a data entre a cotação e o envio — e a
    // recepção precisa saber QUAL noite, para oferecer outra.
    if (erro instanceof NoiteIndisponivelError) {
      return {
        erro:
          (erro.noite
            ? `A unidade já está ocupada na noite de ${erro.noite}. `
            : "A unidade já está ocupada em alguma destas noites. ") +
          "Alguém pegou a data enquanto você preenchia. Escolha outra data ou outra unidade.",
      };
    }
    if (erro instanceof SemTarifaError) {
      return {
        erro: `Não há diária cadastrada para: ${erro.noites.join(", ")}.`,
      };
    }
    throw erro;
  }
}
