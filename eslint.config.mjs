import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    // Fronteira de módulo, imposta por lint e não por disciplina.
    //
    // A especificação define: "Cada módulo tem suas tabelas e seu serviço; os
    // módulos conversam por serviços e eventos internos, nunca lendo a tabela
    // do vizinho." Em código isso quer dizer que `@/modules/reservas/schema`
    // é proibido de fora do módulo; só `@/modules/reservas` (o índice) vale.
    //
    // Dentro do próprio módulo usa-se import relativo ("./repo"), que esta
    // regra não alcança — de propósito.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*"],
              message:
                "Importe o índice do módulo (@/modules/x), nunca um arquivo interno dele. Precisa de algo que o índice não exporta? Exporte pelo serviço.",
            },
            {
              group: ["@/db/client"],
              message:
                "Não use `db` direto: todo acesso passa por withTenant() (@/db/tenant), que define o contexto do anfitrião que o RLS lê.",
            },
          ],
        },
      ],
    },
  },

  {
    // O próprio withTenant precisa do cliente, e as migrações/seed rodam com o
    // papel de owner, fora do contexto de anfitrião.
    files: ["src/db/**/*.ts", "scripts/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
