/**
 * Superfície pública do módulo Tarifas.
 *
 * O motor é exportado puro (`orcar`) para o simulador e os testes, e
 * embrulhado (`orcarEstadia`) para quem precisa dele com o catálogo do banco.
 * As tabelas não saem daqui.
 */
export {
  type AmbitoFeriado,
  type FeriadoGerado,
  type PeriodoEspecial,
  domingoDePascoa,
  feriadosNacionais,
  feriadosNoPeriodo,
  periodosEspeciais,
} from "./feriados";

export {
  type Catalogo,
  type Cupom,
  type DescontoEstadiaLonga,
  type Extra,
  type Feriado,
  type NivelTarifa,
  type NoitePrecificada,
  type Orcamento,
  type PedidoDePreco,
  type RegraTarifa,
  type TipoParaPreco,
  SemTarifaError,
  orcar,
} from "./motor";

export {
  type PoliticaParaEditar,
  type RegraParaEditar,
  atualizarPoliticaPadrao,
  atualizarRegraTarifa,
  buscarCupom,
  buscarPoliticaPadrao,
  listarExtras,
  listarFeriados,
  listarRegrasTarifa,
  orcarEstadia,
  sincronizarFeriadosNacionais,
} from "./service";

export type { FaixaCancelamento } from "./schema";
