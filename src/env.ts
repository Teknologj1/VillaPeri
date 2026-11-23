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

  /**
   * Segredo que assina sessões e tokens de dois fatores.
   *
   * Opcional aqui e exigido em `src/lib/auth.ts`, onde é usado de verdade: o
   * site público não tem login e precisa publicar sem ele. Exigir no boot
   * quebraria o build da vitrine por uma variável que ela não usa.
   */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().min(1).optional(),
});

type Ambiente = z.infer<typeof esquema>;

let validado: Ambiente | null = null;

/**
 * Valida na PRIMEIRA leitura, não ao carregar o módulo.
 *
 * A intenção continua a mesma: um valor faltando derruba o programa com o
 * nome da variável, em vez de virar `undefined` que explode três camadas
 * adiante. O que mudou é QUANDO.
 *
 * Lançar no carregamento do módulo parecia equivalente a "no boot", e não é:
 * o `next build` avalia os módulos de toda rota para coletar a configuração
 * dela, muito antes de qualquer requisição. Uma rota que nem toca no banco,
 * mas que alcance este arquivo por uma cadeia de importações, derruba o
 * build inteiro num ambiente sem as variáveis de servidor — foi assim que o
 * deploy na Vercel falhou com `/api/v1/openapi.json`, que só serve um JSON
 * estático.
 *
 * Adiando para a primeira LEITURA, a garantia fica onde interessa: quem
 * precisa da variável falha alto, e quem não precisa publica sem ela.
 */
function ler(): Ambiente {
  if (validado) return validado;

  const resultado = esquema.safeParse(process.env);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${problemas}`);
  }

  validado = resultado.data;
  return validado;
}

/**
 * As variáveis validadas. Um proxy, para `env.DATABASE_URL` continuar sendo
 * a forma de ler em todo o sistema.
 */
export const env = new Proxy({} as Ambiente, {
  get: (_alvo, propriedade) => ler()[propriedade as keyof Ambiente],
  has: (_alvo, propriedade) => propriedade in ler(),
  ownKeys: () => Reflect.ownKeys(ler()),
  getOwnPropertyDescriptor: (_alvo, propriedade) =>
    Reflect.getOwnPropertyDescriptor(ler(), propriedade),
});
