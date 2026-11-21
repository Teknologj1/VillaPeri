/**
 * O conteúdo da casa, como o site o exibe.
 *
 * Hoje é estático, e de propósito: assim o site compila e publica sem depender
 * de banco. Os mesmos dados já estão no seed (`src/db/seed.ts`), e quando o
 * banco estiver provisionado na Vercel este arquivo passa a ler do módulo
 * Anfitrião — as formas aqui foram desenhadas para bater com as colunas de
 * `tipo_acomodacao` e `propriedade`, de modo que a troca seja num arquivo só.
 */

export const CASA = {
  nome: "Villa Peri",
  chamada: "Casa inteira em Pirenópolis, para você e os seus",
  subtitulo:
    "Três suítes, piscina aquecida e quintal arborizado a seis minutos do Centro Histórico. Locada inteira e exclusiva para uma única reserva.",

  cidade: "Pirenópolis",
  uf: "GO",
  bairro: "Jardim Santa Bárbara",

  capacidade: 11,
  quartos: 3,
  camas: 6,
  banheiros: 3,

  checkin: "14h",
  checkout: "12h",

  descricao: [
    "Casa de temporada no Jardim Santa Bárbara, vizinha a uma reserva ambiental e a seis minutos de carro do Centro Histórico de Pirenópolis.",
    "Locada inteira e exclusiva para uma única reserva.",
    "Fácil acesso às atrações históricas e gastronômicas da cidade e da região, assim como às cachoeiras, aos parques de ecoturismo e ao turismo de aventura.",
    "Três suítes com entrada independente, cozinha completa, piscina com aquecimento solar, área de churrasco com fogão caipira, varandas com redes, portão automático e garagem privativa.",
    "A Villa é bem arborizada, o que deixa o ambiente mais fresco. Recebemos com frequência a visita de animais silvestres, principalmente micos — pedimos que não sejam alimentados.",
  ],
} as const;

/**
 * Tarifas e condições, como informadas pelo proprietário.
 *
 * Dinheiro em centavos, pela mesma razão do resto do sistema. Este objeto é a
 * fonte única: o seed do banco (`src/db/seed.ts`) importa daqui, para o site e
 * o motor de preços não poderem divergir.
 *
 * O site publica só a diária MÍNIMA ("a partir de"). O total de um grupo
 * grande depende de `ocupacaoBase`, que ainda não foi confirmada, e preço
 * errado em página pública vira discussão no check-in.
 */
export const PRECOS = {
  diariaSemanaCentavos: 54_300,
  diariaFimDeSemanaCentavos: 75_000,
  diariaFeriadoCentavos: 137_500,

  pessoaAdicionalCentavos: 11_000,
  /** A CONFIRMAR: quantas pessoas a diária já cobre. */
  ocupacaoBase: 4,

  /**
   * Faixa que paga meia. Abaixo de `idadeMinimaCrianca` é cortesia: não paga
   * e não conta como pessoa adicional. Confirmado pelo proprietário.
   */
  idadeMinimaCrianca: 5,
  idadeMaximaCrianca: 9,

  sinalPercentual: 30,
  minimoNoites: 2,
  minimoNoitesFeriado: 3,
  /** Prazo para cancelar com devolução integral. */
  diasParaCancelar: 7,

  aceitaPets: false,
} as const;

export type Suite = {
  nome: string;
  capacidade: number;
  descricao: string;
  destaques: string[];
  /** Usado pelo seed para calcular o total de camas e o kit de enxoval. */
  camasCasal: number;
  camasSolteiro: number;
};

export const SUITES: Suite[] = [
  {
    nome: "Suíte 01",
    capacidade: 3,
    descricao:
      "Quarto térreo com cama de casal e cama de solteiro, banheiro privativo e entrada independente. Pode ser usada conjugada com a Suíte 02.",
    destaques: ["Cama de casal", "Cama de solteiro", "Banheiro privativo", "Frigobar", "Ventilador de teto"],
    camasCasal: 1,
    camasSolteiro: 1,
  },
  {
    nome: "Suíte 02",
    capacidade: 3,
    descricao:
      "Quarto térreo com cama de casal e cama de solteiro, banheiro privativo e entrada independente. Pode ser usada conjugada com a Suíte 01.",
    destaques: ["Cama de casal", "Cama de solteiro", "Banheiro privativo", "Ar-condicionado", "TV", "Ventilador de teto"],
    camasCasal: 1,
    camasSolteiro: 1,
  },
  {
    nome: "Suíte 03",
    capacidade: 4,
    descricao:
      "Chalé de dois andares com duas camas de casal e banheiro privativo, em pé-direito alto e escada de madeira.",
    destaques: ["Duas camas de casal", "Dois andares", "Banheiro privativo", "TV", "Frigobar", "Ventilador de teto"],
    camasCasal: 2,
    camasSolteiro: 0,
  },
];

export type GrupoComodidades = { titulo: string; itens: string[] };

export const COMODIDADES: GrupoComodidades[] = [
  {
    titulo: "Lazer",
    itens: [
      "Piscina privativa com aquecimento solar",
      "Quintal privado totalmente cercado",
      "Churrasqueira com pia e bancada",
      "Fogão caipira a lenha",
      "Área de jantar ao ar livre",
      "Varandas com redes",
      "Espreguiçadeiras e guarda-sol",
    ],
  },
  {
    titulo: "Cozinha",
    itens: [
      "Cozinha completa equipada",
      "Geladeira e frigobar",
      "Cooktop e forno elétrico",
      "Airfryer, grill e sanduicheira",
      "Cafeteira com coador",
      "Liquidificador e espremedor de laranja",
      "Panela elétrica de arroz e chaleira elétrica",
      "Pratos, talheres e taças de vinho",
      "Cooler térmico para uso dos hóspedes",
      "Mesa de jantar",
    ],
  },
  {
    titulo: "Conforto",
    itens: [
      "Wi-Fi e conexão Ethernet",
      "TV de 32 polegadas",
      "Ar-condicionado split",
      "Ventilador de teto",
      "Lareira interna",
      "Água quente e chuveiro externo",
      "Roupas de cama e banho fornecidas",
      "Máquina de lavar",
      "Ferro de passar e varal",
    ],
  },
  {
    titulo: "Chegada e segurança",
    itens: [
      "Garagem para 4 carros, sombreada",
      "Estacionamento gratuito na rua",
      "Portão automático e casa murada",
      "Entrada independente para cada suíte",
      "Extintor de incêndio",
      "Guarda-volumes para chegada cedo ou saída tarde",
      "O anfitrião recebe você",
    ],
  },
];

export const REGRAS_DA_CASA: string[] = [
  "Não é permitido festa ou churrasco com pessoas além das contratadas na hospedagem.",
  "Não é permitido barulho depois das 22 horas.",
  "Durante o dia, pedimos bom senso com o volume: evite música alta.",
  "Som automotivo é proibido.",
  "Recebemos a visita de animais silvestres, principalmente micos. Pedimos que não sejam alimentados.",
];

/**
 * O que a cidade oferece. Conteúdo próprio, e não copiado de guia turístico:
 * é a base do SEO local e o que a RIIA responde quando perguntam "o que dá
 * para fazer por aí?".
 */
export const PIRENOPOLIS = [
  {
    titulo: "Centro Histórico",
    texto:
      "A seis minutos de carro. Igreja Matriz do Rosário, ruas de pedra, ateliês de prata e a gastronomia da Rua do Rosário.",
  },
  {
    titulo: "Cachoeiras",
    texto:
      "Os Dragões, Santa Maria, Bonsucesso e Abade estão entre as mais procuradas. A maioria fica a menos de 30 minutos da casa.",
  },
  {
    titulo: "Turismo de aventura",
    texto:
      "Tirolesa, rapel, arvorismo e trilhas nos parques de ecoturismo da região, vários deles no caminho das cachoeiras.",
  },
  {
    titulo: "Festa do Divino e Cavalhadas",
    texto:
      "A festa mais tradicional da cidade, em Pentecostes, com as Cavalhadas e os mascarados. É o período de maior procura do ano — vale reservar com antecedência.",
  },
  {
    titulo: "Como chegar",
    texto:
      "Cerca de 150 km de Goiânia e 190 km de Brasília, pela GO-338 e BR-070. A casa fica no Jardim Santa Bárbara, com garagem para quatro carros.",
  },
];

/**
 * O número do WhatsApp da recepção, em formato internacional e só dígitos
 * (ex.: 5562999999999). Vem do ambiente para poder ser trocado na Vercel sem
 * mexer no código. Sem ele, os botões levam à página de contato.
 */
export const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP ?? "";

export function linkWhatsApp(mensagem: string): string | null {
  if (!WHATSAPP) return null;
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
}
