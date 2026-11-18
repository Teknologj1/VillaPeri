/**
 * Superfície pública do módulo Anfitrião.
 *
 * Outros módulos importam daqui e só daqui — `@/modules/anfitriao/schema` é
 * proibido de fora, por regra de ESLint. É o que mantém "os módulos conversam
 * por serviços, nunca lendo a tabela do vizinho" como fato e não como intenção.
 */
export {
  buscarPropriedade,
  buscarTipoPorSlug,
  listarTipos,
  listarUnidades,
  listarUnidadesAtivas,
  type Propriedade,
  type TipoAcomodacao,
  type Unidade,
} from "./service";
