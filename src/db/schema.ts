/**
 * Schema agregado: o drizzle-kit lê só este arquivo para gerar migrações.
 *
 * Cada módulo é dono das suas tabelas (`src/modules/<modulo>/schema.ts`) e as
 * reexporta aqui. Isso mantém a regra de fronteira do projeto: um módulo nunca
 * importa a tabela do vizinho, só o serviço dele — mas as migrações continuam
 * saindo de um lugar só.
 */

export * from "@/modules/anfitriao/schema";
// Tabelas do Better Auth (user, session, account, verification, two_factor).
// Globais e sem RLS de propósito — veja a explicação em src/lib/auth.ts.
export * from "@/modules/autenticacao/schema";
export * from "@/modules/autenticacao/schema-membro";
export * from "@/modules/auditoria/schema";
export * from "@/modules/calendario/schema";
export * from "@/modules/tarifas/schema";
