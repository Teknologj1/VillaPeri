/**
 * Schema agregado: o drizzle-kit lê só este arquivo para gerar migrações.
 *
 * Cada módulo é dono das suas tabelas (`src/modules/<modulo>/schema.ts`) e as
 * reexporta aqui. Isso mantém a regra de fronteira do projeto: um módulo nunca
 * importa a tabela do vizinho, só o serviço dele — mas as migrações continuam
 * saindo de um lugar só.
 */

export {};
