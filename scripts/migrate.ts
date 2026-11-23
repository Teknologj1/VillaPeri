import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { conectar } from "@/db/conectar";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Aplica as migrações com o papel `villaperi_owner` (dono das tabelas,
 * BYPASSRLS). A aplicação nunca usa esta conexão.
 */
const url = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "Defina DATABASE_URL_MIGRATOR (papel villaperi_owner) antes de migrar.",
  );
}

if (!process.env.DATABASE_URL_MIGRATOR) {
  console.warn(
    "AVISO: DATABASE_URL_MIGRATOR não definida; usando DATABASE_URL.\n" +
      "Se essa for a conexão da aplicação (villaperi_app), a migração vai falhar\n" +
      "por falta de permissão — e é exatamente isso que deve acontecer.",
  );
}

async function aplicar() {
  const cliente = conectar(url!, { max: 1 });
  try {
    await migrate(drizzle(cliente), { migrationsFolder: "./src/db/migrations" });
    console.log("Migrações aplicadas.");
  } finally {
    await cliente.end();
  }
}

aplicar().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
