import { config } from "dotenv";
import { z } from "zod";

// Em produção e em `next dev` o próprio Next já carregou o ambiente, e o dotenv
// não sobrescreve o que já existe. Isto é para scripts e testes, que rodam
// fora do Next e precisam enxergar o .env.local.
config({ path: [".env.local", ".env"], quiet: true });

/**
 * Variáveis de ambiente validadas no boot. Um valor faltando derruba a
 * aplicação aqui, com o nome da variável, em vez de virar `undefined` que
 * explode três camadas adiante.
 *
 * Só para código de servidor. Nunca importe este arquivo de um componente
 * de cliente: ele lê `process.env`.
 */
const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /**
   * Conexão da APLICAÇÃO: papel `villaperi_app`, sem BYPASSRLS e sem ser dono
   * das tabelas. É o que faz o isolamento por anfitrião valer no banco.
   * Em produção, aponte para o pooler (Neon/Supabase em modo transação).
   */
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),

  /**
   * Conexão das MIGRAÇÕES: papel `villaperi_owner`, dono das tabelas e com
   * BYPASSRLS. Usada só por `npm run db:migrate` e pelo seed — nunca pela
   * aplicação em si.
   */
  DATABASE_URL_MIGRATOR: z.string().min(1).optional(),

  /** Fuso da propriedade. Toda data "de hoje" é resolvida neste fuso. */
  TZ_PROPRIEDADE: z.string().default("America/Sao_Paulo"),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  const problemas = resultado.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Variáveis de ambiente inválidas:\n${problemas}`);
}

export const env = resultado.data;
