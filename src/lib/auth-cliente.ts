import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Cliente de autenticação para os componentes do navegador.
 *
 * Só o painel usa. O site público não tem login e não carrega nada disto.
 */
export const authCliente = createAuthClient({
  plugins: [twoFactorClient()],
});

export const { signIn, signOut, useSession } = authCliente;
