/**
 * Superfície pública do módulo Reservas.
 *
 * A máquina de status é exportada pura, para o painel saber quais botões
 * mostrar sem perguntar ao banco.
 */
export {
  type FaixaCancelamento,
  type StatusReserva,
  TransicaoInvalidaError,
  destinosDe,
  devolucaoAoCancelar,
  ehFinal,
  exigirTransicao,
  podeIrPara,
  seguraNoites,
} from "./status";

export {
  type DadosDaReservaNova,
  type DadosDaSolicitacaoNova,
  type ResultadoDaMudanca,
  NoiteIndisponivelError,
  contarSolicitacoesRecentes,
  criarReserva,
  criarSolicitacao,
  mudarStatus,
} from "./service";
