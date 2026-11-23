import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * O cron da Vercel, conferido aqui porque o erro dele é caro.
 *
 * O plano Hobby só aceita cron DIÁRIO. Uma expressão mais frequente não é
 * ignorada nem avisada: faz o deploy inteiro falhar, com a aplicação fora do
 * ar até alguém perceber. Já aconteceu, com uma expressão de dez em dez
 * minutos.
 *
 * Nenhuma ferramenta local valida o `vercel.json` — `next build` passa
 * tranquilo. Este teste é o que avisa antes de empurrar.
 */
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  crons?: { path: string; schedule: string }[];
};

/** Um campo que dispara mais de uma vez por dia. */
function maisDeUmaVezPorDia(campo: string): boolean {
  return campo.includes("*") || campo.includes("/") || campo.includes(",") ||
    campo.includes("-");
}

describe("cron da Vercel", () => {
  it("roda no máximo uma vez por dia (limite do plano Hobby)", () => {
    for (const cron of vercel.crons ?? []) {
      const [minuto, hora] = cron.schedule.split(" ");

      expect(
        maisDeUmaVezPorDia(minuto!),
        `${cron.path}: o minuto "${minuto}" dispara mais de uma vez por dia. ` +
          "O plano Hobby da Vercel recusa, e o BUILD FALHA.",
      ).toBe(false);

      expect(
        maisDeUmaVezPorDia(hora!),
        `${cron.path}: a hora "${hora}" dispara mais de uma vez por dia. ` +
          "O plano Hobby da Vercel recusa, e o BUILD FALHA.",
      ).toBe(false);
    }
  });

  it("tem cinco campos, como o cron padrão", () => {
    for (const cron of vercel.crons ?? []) {
      expect(cron.schedule.split(" ")).toHaveLength(5);
    }
  });

  it("aponta para rotas que existem", () => {
    for (const cron of vercel.crons ?? []) {
      const arquivo = `src/app${cron.path}/route.ts`;
      expect(() => readFileSync(arquivo, "utf8"), arquivo).not.toThrow();
    }
  });
});
