import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/env";

/**
 * Autenticação do painel.
 *
 * As tabelas do Better Auth (`user`, `session`, `account`, `verification` e as
 * de dois fatores) NÃO têm coluna de anfitrião e NÃO têm RLS, de propósito: o
 * login acontece antes de existir contexto de anfitrião — é preciso achar o
 * usuário pelo e-mail para só então descobrir de quem ele é. Quem liga um
 * usuário a um anfitrião e a um perfil é a tabela `membro`, essa sim isolada.
 *
 * Consequência prática: nenhuma rota pode devolver linha dessas tabelas sem
 * antes resolver o membro. O ponto de entrada é `sessaoAtual()`, em
 * `src/lib/sessao.ts`.
 */
function segredo(): string {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET não está definida. O painel precisa dela para " +
        "assinar sessões; gere uma com `openssl rand -base64 32`.",
    );
  }
  return env.BETTER_AUTH_SECRET;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: segredo(),
  baseURL: env.BETTER_AUTH_URL ?? "http://localhost:3000",

  emailAndPassword: {
    enabled: true,
    // Sem cadastro aberto: quem cria usuário é o Proprietário, no painel.
    // Um painel de gestão com autosserviço de conta é porta de entrada.
    disableSignUp: true,
    minPasswordLength: 10,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  plugins: [
    // A especificação exige verificação em dois passos obrigatória para o
    // Proprietário. O plugin oferece o mecanismo; quem exige é o perfil,
    // pela coluna `exige_dois_fatores`.
    twoFactor({ issuer: "Villa Peri" }),
  ],
});

export type Sessao = typeof auth.$Infer.Session;
