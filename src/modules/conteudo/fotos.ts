/**
 * As fotos da casa, com texto alternativo e categoria.
 *
 * O texto alternativo não é enfeite de acessibilidade: é o que leitor de tela
 * lê e o que o Google usa para entender a imagem. Por isso descreve a cena, e
 * não repete "foto da Villa Peri" quarenta vezes.
 */
export type CategoriaFoto =
  | "piscina"
  | "varandas"
  | "churrasco"
  | "cozinha"
  | "suites"
  | "interiores"
  | "jardim"
  | "fachada"
  | "natureza";

export type Foto = {
  arquivo: string;
  alt: string;
  categoria: CategoriaFoto;
};

export const CATEGORIAS: { id: CategoriaFoto; titulo: string }[] = [
  { id: "piscina", titulo: "Piscina e lazer" },
  { id: "varandas", titulo: "Varandas e redes" },
  { id: "churrasco", titulo: "Churrasco e fogão caipira" },
  { id: "cozinha", titulo: "Cozinha" },
  { id: "suites", titulo: "Suítes" },
  { id: "interiores", titulo: "Ambientes internos" },
  { id: "jardim", titulo: "Jardim e área externa" },
  { id: "fachada", titulo: "A casa por fora" },
  { id: "natureza", titulo: "Natureza ao redor" },
];

export const FOTOS: Foto[] = [
  // Piscina
  { arquivo: "piscina-vista-pergolado.jpg", alt: "Piscina vista de baixo do pergolado, com cortinas brancas ao vento", categoria: "piscina" },
  { arquivo: "piscina-espreguicadeiras.jpg", alt: "Piscina com espreguiçadeiras, guarda-sol e cadeiras ao redor", categoria: "piscina" },
  { arquivo: "pergolado-cortinas-piscina.jpg", alt: "Pergolado de madeira com cortinas brancas, ao lado da piscina", categoria: "piscina" },
  { arquivo: "piscina-samambaias.jpg", alt: "Piscina emoldurada por samambaias e árvores", categoria: "piscina" },
  { arquivo: "piscina-guarda-sol.jpg", alt: "Piscina retangular com guarda-sol e mesa de apoio", categoria: "piscina" },
  { arquivo: "piscina-vasos.jpg", alt: "Piscina com guarda-sol azul e vasos de palmeira", categoria: "piscina" },

  // Varandas
  { arquivo: "varanda-flores-vermelhas.jpg", alt: "Varanda de pilares de madeira com flores vermelhas e redes ao fundo", categoria: "varandas" },
  { arquivo: "varanda-rede-vermelha.jpg", alt: "Varanda comprida de piso vermelho com rede branca e vermelha", categoria: "varandas" },
  { arquivo: "varanda-rede-azul.jpg", alt: "Varanda com rede azul e branca sob telhado de madeira", categoria: "varandas" },
  { arquivo: "rede-azul-janela.jpg", alt: "Rede azul e branca armada junto a uma janela de madeira", categoria: "varandas" },
  { arquivo: "varanda-bancos-madeira.jpg", alt: "Varanda com bancos de madeira e vegetação em volta", categoria: "varandas" },
  { arquivo: "varanda-bandeirinhas.jpg", alt: "Varanda decorada com bandeirinhas e rede vermelha", categoria: "varandas" },
  { arquivo: "varanda-mesa-rede.jpg", alt: "Varanda com mesa de madeira e rede vermelha", categoria: "varandas" },
  { arquivo: "varanda-rede-fachada.jpg", alt: "Varanda com rede vermelha e vista para a fachada da casa", categoria: "varandas" },
  { arquivo: "rede-azul-patio.jpg", alt: "Rede azul armada no pátio de pedra, à sombra das árvores", categoria: "varandas" },

  // Churrasco
  { arquivo: "area-churrasco.jpg", alt: "Área de churrasco com churrasqueira de alvenaria, pia e bancada de azulejos", categoria: "churrasco" },
  { arquivo: "fogao-caipira.jpg", alt: "Fogão caipira a lenha com panelas de alumínio sobre bancada de azulejos", categoria: "churrasco" },

  // Cozinha
  { arquivo: "cozinha-janela-varanda.jpg", alt: "Janela da cozinha, com bancada de madeira, aberta para a varanda", categoria: "cozinha" },
  { arquivo: "cozinha-vista-patio.jpg", alt: "Vista do pátio e das árvores pela janela da cozinha", categoria: "cozinha" },
  { arquivo: "cozinha-aparador.jpg", alt: "Cozinha com aparador de madeira e janela ampla", categoria: "cozinha" },

  // Suítes
  { arquivo: "suite-entrada-independente.jpg", alt: "Porta de uma das suítes, com entrada independente pelo pátio", categoria: "suites" },
  { arquivo: "escada-chale.jpg", alt: "Escada de madeira que leva ao segundo andar do chalé", categoria: "suites" },

  // Interiores
  { arquivo: "sala-moveis-madeira.jpg", alt: "Sala com móveis de madeira e abertura para o pátio", categoria: "interiores" },
  { arquivo: "varanda-mesa-jantar.jpg", alt: "Varanda coberta com mesa de jantar de madeira", categoria: "interiores" },
  { arquivo: "sofas-madeira-varanda.jpg", alt: "Conjunto de sofás e mesa de centro de madeira na varanda", categoria: "interiores" },
  { arquivo: "hall-aparador.jpg", alt: "Hall de entrada com aparador amarelo e espelho", categoria: "interiores" },
  { arquivo: "janela-banco-madeira.jpg", alt: "Janela de madeira aberta com banco rústico embaixo", categoria: "interiores" },
  { arquivo: "janela-vista-patio.jpg", alt: "Janela de madeira aberta para o pátio e a garagem", categoria: "interiores" },

  // Jardim
  { arquivo: "jardim-mesa-guarda-sol.jpg", alt: "Jardim gramado com mesa, cadeiras e guarda-sol", categoria: "jardim" },
  { arquivo: "area-externa-mesas.jpg", alt: "Área externa com mesas de madeira, redes e muro vermelho", categoria: "jardim" },
  { arquivo: "patio-tucano.jpg", alt: "Pátio de pedra com escultura de tucano e rede ao fundo", categoria: "jardim" },
  { arquivo: "pergolado-arvores.jpg", alt: "Pergolado de madeira construído entre as árvores do quintal", categoria: "jardim" },
  { arquivo: "jardim-pedras-arara.jpg", alt: "Canteiro de pedras brancas com escultura de arara", categoria: "jardim" },
  { arquivo: "orquideas-varanda.jpg", alt: "Orquídeas cor-de-rosa floridas junto à mesa da varanda", categoria: "jardim" },
  { arquivo: "orquideas-garagem.jpg", alt: "Orquídeas no tronco de uma árvore, perto da garagem sombreada", categoria: "jardim" },
  { arquivo: "caminho-entrada.jpg", alt: "Caminho de pedra sombreado por árvores até a entrada da casa", categoria: "jardim" },
  { arquivo: "varanda-entrada.jpg", alt: "Varanda com vista para a entrada e a garagem", categoria: "jardim" },

  // Fachada
  { arquivo: "fachada-arvore.jpg", alt: "Fachada branca de telha colonial, com uma árvore grande em frente", categoria: "fachada" },
  { arquivo: "fachada-porta-madeira.jpg", alt: "Fachada da casa com porta de madeira maciça", categoria: "fachada" },
  { arquivo: "fachada-janela-porta.jpg", alt: "Fachada com janela e porta de madeira sob telhado colonial", categoria: "fachada" },
  { arquivo: "entrada-portao.jpg", alt: "Entrada da casa com portão e muro de tijolo aparente", categoria: "fachada" },

  // Natureza
  { arquivo: "mico-arvore.jpg", alt: "Mico sentado num galho, entre as folhas de uma árvore do quintal", categoria: "natureza" },
];

/** Caminho público da foto, para o `src` do next/image. */
export function caminhoFoto(foto: Foto): string {
  return `/fotos/${foto.arquivo}`;
}

export function fotosDaCategoria(categoria: CategoriaFoto): Foto[] {
  return FOTOS.filter((f) => f.categoria === categoria);
}

function porArquivo(arquivo: string): Foto {
  const f = FOTOS.find((x) => x.arquivo === arquivo);
  if (!f) throw new Error(`Foto não encontrada no catálogo: ${arquivo}`);
  return f;
}

/** A foto de abertura: é a primeira coisa que o visitante vê. */
export const FOTO_CAPA = porArquivo("piscina-vista-pergolado.jpg");

/** As que abrem a página inicial, escolhidas para contar a casa em cinco imagens. */
export const FOTOS_DESTAQUE: Foto[] = [
  porArquivo("varanda-flores-vermelhas.jpg"),
  porArquivo("piscina-espreguicadeiras.jpg"),
  porArquivo("area-churrasco.jpg"),
  porArquivo("varanda-rede-azul.jpg"),
  porArquivo("mico-arvore.jpg"),
];
