/**
 * Superfície pública do módulo Auditoria.
 *
 * "Toda alteração relevante grava auditoria: quem, quando, valor antes e
 * depois." Quem registra passa o `tx` da própria mudança.
 */
export {
  type Autor,
  type RegistroDeAuditoria,
  auditar,
  historicoDe,
} from "./service";
