"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenant } from "@/db/tenant";
import { exigirSessao } from "@/lib/sessao";
import { podeNoModulo } from "@/modules/autenticacao";
import {
  assumirConversa,
  criarChave,
  revogarChave,
} from "@/modules/riia";

export type EstadoDaRiia =
  | { erro: string }
  | { chaveNova: string; nome: string }
  | { aviso: string }
  | null;

const esquemaChave = z.object({
  nome: z.string().trim().min(2, "Dê um nome à chave.").max(60),
  nivel: z.coerce.number().int().min(1).max(3),
  limite: z.coerce.number().int().min(1).max(10_000).default(60),
});

/**
 * Cria a chave e devolve o segredo UMA vez.
 *
 * Volta no estado do formulário, não numa página nova: o segredo não é
 * guardado em lugar nenhum, então recarregar a página o perde — e recarregar
 * é o que acontece quando se navega.
 *
 * Mexer em chave de API é configuração da conta, não operação do dia: exige
 * `editar` em usuários, que pela matriz é só do Proprietário.
 */
export async function criarChaveDaRiia(
  _estado: EstadoDaRiia,
  dados: FormData,
): Promise<EstadoDaRiia> {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "usuarios", "editar")) {
    return { erro: "Só o proprietário cria chaves de API." };
  }

  const analise = esquemaChave.safeParse(Object.fromEntries(dados));
  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? "Confira os dados." };
  }
  const d = analise.data;

  const resultado = await withTenant(sessao.anfitriaoId, (tx) =>
    criarChave(tx, sessao.anfitriaoId, {
      nome: d.nome,
      nivelAutonomia: d.nivel as 1 | 2 | 3,
      limitePorMinuto: d.limite,
    }),
  );

  revalidatePath("/painel/riia");
  return { chaveNova: resultado.chave, nome: d.nome };
}

export async function revogarChaveDaRiia(
  _estado: EstadoDaRiia,
  dados: FormData,
): Promise<EstadoDaRiia> {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "usuarios", "editar")) {
    return { erro: "Só o proprietário revoga chaves de API." };
  }

  const id = String(dados.get("id") ?? "");
  if (!id) return { erro: "Chave não informada." };

  await withTenant(sessao.anfitriaoId, (tx) => revogarChave(tx, id));

  revalidatePath("/painel/riia");
  return { aviso: "Chave revogada. A próxima chamada já é recusada." };
}

/**
 * A recepção assume um atendimento que a RIIA transferiu.
 *
 * Marcar quem assumiu é o que tira a conversa da fila — sem isso, duas
 * pessoas respondem o mesmo hóspede, ou ninguém responde porque cada uma
 * achou que a outra ia.
 */
export async function assumirAtendimento(
  _estado: EstadoDaRiia,
  dados: FormData,
): Promise<EstadoDaRiia> {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "reservas", "lancar")) {
    return { erro: "Seu perfil não assume atendimentos." };
  }

  const id = String(dados.get("id") ?? "");
  if (!id) return { erro: "Conversa não informada." };

  await withTenant(sessao.anfitriaoId, (tx) =>
    assumirConversa(tx, id, sessao.usuarioId),
  );

  revalidatePath("/painel/riia");
  return { aviso: "Atendimento assumido." };
}
