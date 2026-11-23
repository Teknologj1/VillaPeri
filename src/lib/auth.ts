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

/**
 * Montada na PRIMEIRA leitura, não ao carregar o módulo.
 *
 * Mesma razão de `src/env.ts` e `src/db/client.ts`: o `next build` avalia os
 * módulos de toda rota para coletar a configuração dela, e construir isto no
 * topo do arquivo lê `BETTER_AUTH_SECRET` e `DATABASE_URL` antes de existir
 * qualquer requisição. Num ambiente sem essas variáveis o build falha
 * inteiro — inclusive para as páginas da vitrine, que não têm login.
 *
 * Adiando, o painel exige as variáveis quando alguém tenta entrar, e o site
 * publica sem elas.
 */
let instancia: ReturnType<typeof montar> | null = null;

function montar() {
  return betterAuth({
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
}

function real() {
  instancia ??= montar();
  return instancia;
}

/**
 * Proxy sobre a instância preguiçosa, para o resto do sistema continuar
 * escrevendo `auth.api.getSession(...)`.
 */
export const auth = new Proxy({} as ReturnType<typeof montar>, {
  get(_alvo, propriedade) {
    const alvo = real();
    const valor = Reflect.get(alvo, propriedade, alvo);
    return typeof valor === "function" ? valor.bind(alvo) : valor;
  },
});

export type Sessao = ReturnType<typeof montar>["$Infer"]["Session"];
