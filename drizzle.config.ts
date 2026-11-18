import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// O Next.js lê .env.local sozinho; scripts e testes não. Sem isto, o
// drizzle-kit só enxerga .env e falha com a variável "faltando".
config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "Defina DATABASE_URL_MIGRATOR (papel villaperi_owner) para gerar/aplicar migrações.",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  // Necessário para que o drizzle-kit enxergue papéis e políticas de RLS.
  // `villaperi_app` e `villaperi_owner` são criados pelo scripts/db-local.sh
  // (e pelo provedor, em produção), não pelas migrações.
  entities: {
    roles: { provider: "", exclude: ["villaperi_app", "villaperi_owner"] },
  },
  verbose: true,
  strict: true,
});
