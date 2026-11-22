/**
 * Superfície pública do módulo Calendário.
 *
 * O que sai daqui: consultar disponibilidade, fechar datas, ocupar e liberar
 * noites. O que NÃO sai: as tabelas. Quem precisa saber se uma noite está
 * livre pergunta ao serviço; ninguém lê `noite_ocupada` direto.
 */
export {
  type EntradaConsulta,
  type MotivoIndisponivel,
  type OfertaTipo,
  type Pedido,
  type ResultadoConsulta,
  consultarDisponibilidade as calcularDisponibilidade,
} from "./disponibilidade";

export {
  BloqueioEmConflitoError,
  NoiteIndisponivelError,
  type ReservaEmConflito,
} from "./erros";

export {
  PADROES as PADROES_ESTADIA,
  type RegraEstadia,
  type RegrasEfetivas,
  resolverRegras,
} from "./regras";

export {
  type NoiteParaOcupar,
  type OrigemNoite,
  buscarNoitesOcupadas,
  liberarNoitesPorOrigem,
  ocuparNoites,
} from "./repo";

export {
  type DadosBloqueio,
  type EscopoBloqueio,
  type PedidoDeSugestao,
  type Sugestao,
  consultarDisponibilidade,
  fecharDatas,
  sugerirDatas,
} from "./service";
