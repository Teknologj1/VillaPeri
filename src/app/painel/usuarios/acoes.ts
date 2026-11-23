"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenant } from "@/db/tenant";
import { exigirSessao } from "@/lib/sessao";
import {
  AcessoJaExisteError,
  criarAcessoAoPainel,
  definirAtivoDoMembro,
  listarAcessos,
  podeNoModulo,
  sortearSenhaNova,
  trocarPerfilDoMembro,
} from "@/modules/autenticacao";

export type EstadoDosUsuarios =
  | { erro: string }
  | { aviso: string }
  | { senhaNova: string; nome: string; email: string; novo: boolean }
  | null;

/**
 * Mexer em quem entra no painel exige `editar` em usuários, que pela matriz é
 * só do Proprietário.
 *
 * A checagem fica em cada ação, não só na página: a página esconde o
 * formulário, e esconder não é proteger — uma ação de servidor é um endpoint
 * HTTP que qualquer um pode chamar direto.
 */
async function exigirDono() {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "usuarios", "editar")) return null;
  return sessao;
}

const esquemaNovo = z.object({
  nome: z.string().trim().min(2, "Escreva o nome completo.").max(80),
  email: z.email("E-mail inválido."),
  perfilId: z.uuid("Escolha um perfil."),
});

export async function criarAcesso(
  _estado: EstadoDosUsuarios,
  dados: FormData,
): Promise<EstadoDosUsuarios> {
  const sessao = await exigirDono();
  if (!sessao) return { erro: "Só o proprietário cria acessos." };

  const analise = esquemaNovo.safeParse(Object.fromEntries(dados));
  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? "Confira os dados." };
  }
  const d = analise.data;

  try {
    const r = await withTenant(sessao.anfitriaoId, (tx) =>
      criarAcessoAoPainel(tx, sessao.anfitriaoId, d, {
        tipo: "usuario",
        id: sessao.usuarioId,
      }),
    );

    revalidatePath("/painel/usuarios");
    return {
      senhaNova: r.senha,
      nome: d.nome,
      email: d.email.trim().toLowerCase(),
      novo: true,
    };
  } catch (erro) {
    if (erro instanceof AcessoJaExisteError) return { erro: erro.message };
    if (erro instanceof Error) return { erro: erro.message };
    throw erro;
  }
}

const esquemaPerfil = z.object({
  membroId: z.uuid(),
  perfilId: z.uuid("Escolha um perfil."),
});

export async function trocarPerfil(
  _estado: EstadoDosUsuarios,
  dados: FormData,
): Promise<EstadoDosUsuarios> {
  const sessao = await exigirDono();
  if (!sessao) return { erro: "Só o proprietário muda perfis." };

  const analise = esquemaPerfil.safeParse(Object.fromEntries(dados));
  if (!analise.success) return { erro: "Pedido inválido." };
  const d = analise.data;

  const proprio = await ehOProprio(sessao.anfitriaoId, sessao.usuarioId, d.membroId);
  if (proprio) {
    // A trava contra trancar-se fora. O proprietário que se rebaixa a Recepção
    // perde `usuarios: editar` no mesmo instante — e aí não há mais ninguém que
    // possa devolvê-lo, a não ser pelo banco.
    return {
      erro:
        "Você não pode mudar o seu próprio perfil. Perder o acesso a esta " +
        "tela trancaria a casa por fora. Peça a outro proprietário, ou crie " +
        "um segundo acesso de proprietário antes.",
    };
  }

  try {
    await withTenant(sessao.anfitriaoId, (tx) =>
      trocarPerfilDoMembro(tx, sessao.anfitriaoId, d.membroId, d.perfilId, {
        tipo: "usuario",
        id: sessao.usuarioId,
      }),
    );
  } catch (erro) {
    if (erro instanceof Error) return { erro: erro.message };
    throw erro;
  }

  revalidatePath("/painel/usuarios");
  return { aviso: "Perfil trocado. Vale na próxima tela que a pessoa abrir." };
}

const esquemaAtivo = z.object({
  membroId: z.uuid(),
  ativo: z.enum(["sim", "nao"]),
});

export async function mudarAtivo(
  _estado: EstadoDosUsuarios,
  dados: FormData,
): Promise<EstadoDosUsuarios> {
  const sessao = await exigirDono();
  if (!sessao) return { erro: "Só o proprietário ativa e desativa acessos." };

  const analise = esquemaAtivo.safeParse(Object.fromEntries(dados));
  if (!analise.success) return { erro: "Pedido inválido." };
  const d = analise.data;

  if (
    d.ativo === "nao" &&
    (await ehOProprio(sessao.anfitriaoId, sessao.usuarioId, d.membroId))
  ) {
    return {
      erro:
        "Você não pode desativar o seu próprio acesso — ficaria sem como " +
        "voltar. Crie outro acesso de proprietário primeiro, e peça a ele.",
    };
  }

  try {
    await withTenant(sessao.anfitriaoId, (tx) =>
      definirAtivoDoMembro(
        tx,
        sessao.anfitriaoId,
        d.membroId,
        d.ativo === "sim",
        { tipo: "usuario", id: sessao.usuarioId },
      ),
    );
  } catch (erro) {
    if (erro instanceof Error) return { erro: erro.message };
    throw erro;
  }

  revalidatePath("/painel/usuarios");
  return {
    aviso:
      d.ativo === "sim"
        ? "Acesso reativado. A pessoa já pode entrar com a senha dela."
        : "Acesso desativado. As sessões abertas caíram.",
  };
}

export async function novaSenha(
  _estado: EstadoDosUsuarios,
  dados: FormData,
): Promise<EstadoDosUsuarios> {
  const sessao = await exigirDono();
  if (!sessao) return { erro: "Só o proprietário sorteia senhas." };

  const membroId = String(dados.get("membroId") ?? "");
  if (!z.uuid().safeParse(membroId).success) return { erro: "Pedido inválido." };

  try {
    const r = await withTenant(sessao.anfitriaoId, (tx) =>
      sortearSenhaNova(tx, sessao.anfitriaoId, membroId, {
        tipo: "usuario",
        id: sessao.usuarioId,
      }),
    );

    revalidatePath("/painel/usuarios");
    return {
      senhaNova: r.senha,
      nome: String(dados.get("nome") ?? r.email),
      email: r.email,
      novo: false,
    };
  } catch (erro) {
    if (erro instanceof Error) return { erro: erro.message };
    throw erro;
  }
}

/**
 * Se o vínculo informado é o de quem está pedindo.
 *
 * Compara pelo `usuarioId` da SESSÃO contra o vínculo lido do banco, e não
 * por um campo escondido no formulário: o formulário é do cliente, e um
 * `membroId` trocado na mão é exatamente o jeito de driblar a trava.
 */
async function ehOProprio(
  anfitriaoId: string,
  usuarioId: string,
  membroId: string,
): Promise<boolean> {
  const acessos = await withTenant(anfitriaoId, (tx) => listarAcessos(tx));
  const alvo = acessos.find((a) => a.membroId === membroId);
  return alvo?.usuarioId === usuarioId;
}
