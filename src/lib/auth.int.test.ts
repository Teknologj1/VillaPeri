import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";

import { fecharConexao } from "@/db/client";

import { auth } from "./auth";

config({ path: [".env.local", ".env"], quiet: true });

afterAll(async () => {
  await fecharConexao();
});

/**
 * O contrato que o `auth` precisa cumprir para o login funcionar.
 *
 * Estes casos existem por um defeito real que chegou ao ar: o `auth` virou um
 * proxy preguiçoso (para o build passar sem variáveis de ambiente) e ficou só
 * com o trap de `get`. O `toNextJsHandler` do Better Auth faz
 *
 *     "handler" in auth ? auth.handler(request) : auth(request)
 *
 * e o `in`, sem trap de `has`, consulta o alvo vazio do proxy. A biblioteca
 * concluiu que recebera uma função, chamou o proxy e derrubou o login com
 * `auth is not a function`.
 *
 * O build passou. O typecheck passou. Os testes de unidade passaram. Só quem
 * tentou entrar descobriu — em produção.
 */
describe("o objeto de autenticação", () => {
  it("responde ao `in`, que é como o Better Auth decide o que recebeu", () => {
    expect("handler" in auth).toBe(true);
    expect("api" in auth).toBe(true);
    expect("naoExiste" in auth).toBe(false);
  });

  it("entrega o handler e a api como funções chamáveis", () => {
    expect(typeof auth.handler).toBe("function");
    expect(typeof auth.api).toBe("object");
    expect(typeof auth.api.getSession).toBe("function");
  });

  it("é enumerável, para quem percorrer as chaves", () => {
    const chaves = Object.keys(auth);
    expect(chaves).toContain("handler");
    expect(chaves).toContain("api");
  });

  it("monta uma vez só, e a mesma instância responde sempre", () => {
    // Memoizado: montar o Better Auth a cada acesso criaria adaptadores de
    // banco novos a cada leitura de sessão.
    expect(auth.handler).toBe(auth.handler);
    expect(auth.api).toBe(auth.api);
  });

  it("o handler do Next sai montado sobre ele sem explodir", async () => {
    // Exercita o caminho exato que quebrou: a função que a rota de login usa.
    const { toNextJsHandler } = await import("better-auth/next-js");
    const rota = toNextJsHandler(auth);

    expect(typeof rota.GET).toBe("function");
    expect(typeof rota.POST).toBe("function");

    // E a rota responde de verdade a uma requisição malformada, em vez de
    // estourar com "auth is not a function".
    const resposta = await rota.POST(
      new Request("http://teste.local/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ninguem@teste.local", password: "x" }),
      }),
    );

    expect(resposta).toBeInstanceOf(Response);
    // Credencial errada: o que importa é ter CHEGADO à validação.
    expect(resposta.status).toBeGreaterThanOrEqual(400);
    expect(resposta.status).toBeLessThan(500);
  });
});
