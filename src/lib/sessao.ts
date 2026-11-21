import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  type SessaoDoPainel,
  carregarSessaoDoPainel,
} from "@/modules/autenticacao";

import { auth } from "./auth";

/**
 * A sessão do painel para a requisição em curso, ou `null`.
 *
 * Esta é a camada de acesso: toda página e toda rota do painel começa por
 * aqui. Não confie no `proxy.ts` para autorizar — ele redireciona cedo, por
 * conforto de navegação, mas quem decide é esta função, junto do dado.
 * Verificação só na borda é o jeito clássico de deixar uma rota desprotegida
 * ao acrescentar um caminho novo.
 */
export async function sessaoAtual(): Promise<SessaoDoPainel | null> {
  const sessao = await auth.api.getSession({ headers: await headers() });
  if (!sessao?.user?.id) return null;

  return carregarSessaoDoPainel({
    id: sessao.user.id,
    nome: sessao.user.name,
    email: sessao.user.email,
    doisFatoresAtivos: sessao.user.twoFactorEnabled === true,
  });
}

/**
 * Como `sessaoAtual`, mas manda para o login em vez de devolver `null`.
 * É o que as páginas do painel usam.
 */
export async function exigirSessao(): Promise<SessaoDoPainel> {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/entrar");
  return sessao;
}
