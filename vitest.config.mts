import path from "node:path";

import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  test: {
    projects: [
      {
        // Testes puros: motor de tarifas, motor de disponibilidade, datas,
        // dinheiro. Não tocam no banco, então rodam em qualquer lugar.
        resolve: { alias },
        test: {
          name: "unidade",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        // Testes de integração: precisam de um PostgreSQL 16 de verdade
        // (./scripts/db-local.sh em desenvolvimento, service container no CI).
        // É aqui que moram isolamento por RLS, concorrência e idempotência —
        // coisas que um banco falso não provaria.
        resolve: { alias },
        test: {
          name: "integracao",
          environment: "node",
          include: ["src/**/*.int.test.ts", "tests/**/*.int.test.ts"],
          // Transações concorrentes disputando a mesma noite precisam rodar
          // contra o mesmo banco sem que outro arquivo mexa nele ao mesmo tempo.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
