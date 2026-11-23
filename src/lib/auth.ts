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
 *
 * Os traps de `has`, `ownKeys` e `getOwnPropertyDescriptor` NÃO são enfeite.
 * O `toNextJsHandler` do Better Auth decide o que recebeu assim:
 *
 *     "handler" in auth ? auth.handler(request) : auth(request)
 *
 * Com apenas o `get`, o `in` consulta o ALVO do proxy — que é `{}` — e
 * responde que não há `handler`. O Better Auth então trata o proxy como se
 * fosse a própria função e a chama, com `auth is not a function`: o login
 * inteiro para, e nem o build nem os testes de unidade percebem, porque o
 * erro só aparece quando alguém tenta entrar.
 *
 * Qualquer proxy sobre objeto de biblioteca precisa dos quatro traps. Foi a
 * lição de deixar o login fora do ar por um deploy.
 */
const ligadas = new Map<PropertyKey, unknown>();

export const auth = new Proxy({} as ReturnType<typeof montar>, {
  get(_alvo, propriedade) {
    const alvo = real();
    const valor = Reflect.get(alvo, propriedade, alvo);
    if (typeof valor !== "function") return valor;

    // A função ligada é guardada: sem isto, cada acesso a `auth.handler`
    // devolveria uma função NOVA, e `auth.handler === auth.handler` seria
    // falso. Quem guardar a referência e comparar depois se perderia.
    if (!ligadas.has(propriedade)) {
      ligadas.set(propriedade, valor.bind(alvo));
    }
    return ligadas.get(propriedade);
  },
  has: (_alvo, propriedade) => propriedade in real(),
  ownKeys: () => Reflect.ownKeys(real()),
  getOwnPropertyDescriptor(_alvo, propriedade) {
    const d = Reflect.getOwnPropertyDescriptor(real(), propriedade);
    // `ownKeys` só pode listar o que é configurável quando o alvo é um
    // objeto comum vazio; sem isto o JavaScript recusa a enumeração.
    return d && { ...d, configurable: true };
  },
});

export type Sessao = ReturnType<typeof montar>["$Infer"]["Session"];
