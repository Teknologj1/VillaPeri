/**
 * Superfície pública do módulo Conteúdo.
 *
 * Alimenta o site e, a partir da Fase 2, a base de conhecimento que a RIIA
 * consulta no WhatsApp — a mesma fonte para os dois, para a secretária de IA
 * nunca responder diferente do que está publicado.
 */
export {
  CASA,
  COMODIDADES,
  PIRENOPOLIS,
  REGRAS_DA_CASA,
  SUITES,
  WHATSAPP,
  linkWhatsApp,
  type GrupoComodidades,
  type Suite,
} from "./casa";

export {
  CATEGORIAS,
  FOTOS,
  FOTOS_DESTAQUE,
  FOTO_CAPA,
  caminhoFoto,
  fotosDaCategoria,
  type CategoriaFoto,
  type Foto,
} from "./fotos";
