/**
 * Superfície pública do módulo RIIA.
 *
 * A regra que organiza o módulo inteiro: a RIIA propõe, o sistema decide.
 * Nada de preço, disponibilidade ou política mora aqui — isso é de Tarifas,
 * Calendário e Reservas. Este módulo cuida de QUEM está chamando (a chave),
 * de QUEM está falando (a conversa) e do que já foi feito (a trilha).
 */
export {
  FERRAMENTAS,
  NIVEIS,
  TODAS_AS_FERRAMENTAS,
  type Ferramenta,
  type NivelAutonomia,
  ferramentasDoNivel,
  motivoDaNegativa,
  podeUsar,
} from "./ferramentas";

export {
  type ChaveNova,
  type ChaveReconhecida,
  type FalhaDeAutenticacao,
  criarChave,
  dentroDoLimite,
  hashDaChave,
  limparLimites,
  listarChaves,
  reconhecerChave,
  revogarChave,
} from "./chaves";

export {
  type AcaoParaRegistrar,
  type Conversa,
  type ItemDeConhecimento,
  type TemaDeConhecimento,
  acharOuCriarConversa,
  acoesDaConversa,
  assumirConversa,
  buscarConversa,
  consultarBase,
  registrarAcao,
  transferenciasAbertas,
  transferirParaHumano,
  vincularConversa,
} from "./service";
