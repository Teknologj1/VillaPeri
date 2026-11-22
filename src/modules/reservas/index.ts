/**
 * Superfície pública do módulo Reservas.
 *
 * A máquina de status é exportada pura, para o painel saber quais botões
 * mostrar sem perguntar ao banco.
 */
export {
  ACAO_PARA,
  ROTULO_STATUS,
  TODOS_OS_STATUS,
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
  type FichaDoHospede,
  type FiltroDeReservas,
  type HojeNaCasa,
  type HospedeDaLista,
  type ReservaCompleta,
  type ReservaDaLista,
  buscarHospede,
  buscarReservaPorCodigo,
  buscarReservaPorId,
  buscarSolicitacao,
  contarSolicitacoesAbertas,
  hojeNaCasa,
  listarAcessosAoHospede,
  listarHospedes,
  listarReservas,
  listarSolicitacoes,
  preReservasVencidas,
  proximasChegadas,
  registrarAcessoDadoPessoal,
  reservasNoPeriodo,
} from "./consultas";

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
