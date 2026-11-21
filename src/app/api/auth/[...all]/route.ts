import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

/**
 * Rotas do Better Auth: login, logout, sessão e dois fatores.
 *
 * Não há rota de cadastro ativa — `disableSignUp` está ligado. Quem cria
 * usuário é o Proprietário, pelo painel.
 */
export const { GET, POST } = toNextJsHandler(auth);
