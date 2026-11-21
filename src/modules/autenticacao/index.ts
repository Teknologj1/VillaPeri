/**
 * Superfície pública do módulo Autenticação.
 *
 * Expõe a sessão do painel e as checagens de permissão. Não expõe as tabelas
 * do Better Auth: elas são globais e sem isolamento, e quem precisa saber
 * quem é o usuário passa por `carregarSessaoDoPainel`.
 */
export {
  SemPermissaoError,
  carregarSessaoDoPainel,
  descontoDentroDoLimite,
  exigirPermissao,
  nivelEm,
  podeNoModulo,
  type SessaoDoPainel,
} from "./service";
