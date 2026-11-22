/**
 * Superfície pública do módulo Notificações.
 *
 * Quem origina um fato chama `enfileirar` dentro da própria transação; quem
 * entrega é a tarefa que chama `drenarFila`. Os textos ficam em `textos.ts`,
 * exportados aqui para o módulo de Reservas montar as mensagens sem conhecer
 * a tabela.
 */
export {
  type Enviador,
  type MensagemParaEnviar,
  SemProvedorError,
  enviadorDoCanal,
  variavelFaltante,
} from "./enviadores";

export {
  type Canal,
  type NotificacaoParaEnfileirar,
  type ParaQuem,
  type ResultadoDaDrenagem,
  drenarFila,
  enfileirar,
  notificacoesDe,
} from "./service";

export {
  type DadosDaReserva,
  type DadosDaSolicitacao,
  reservaConfirmadaParaAnfitriao,
  reservaConfirmadaParaHospede,
  solicitacaoParaAnfitriao,
  solicitacaoParaHospede,
} from "./textos";
