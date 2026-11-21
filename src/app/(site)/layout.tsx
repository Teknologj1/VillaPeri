import { CASA, PRECOS } from "@/modules/conteudo";

import { Cabecalho } from "./_componentes/Cabecalho";
import { Rodape } from "./_componentes/Rodape";

/**
 * Dados estruturados de hospedagem.
 *
 * É o que faz o Google entender que isto é uma casa de temporada em
 * Pirenópolis, e não uma página qualquer com a palavra "casa". Para SEO local
 * — que é por onde chega quem procura "casa para alugar em Pirenópolis" —
 * conta mais que qualquer texto.
 */
function dadosEstruturados() {
  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: CASA.nome,
    description: CASA.subtitulo,
    address: {
      "@type": "PostalAddress",
      addressLocality: CASA.cidade,
      addressRegion: CASA.uf,
      addressCountry: "BR",
    },
    numberOfRooms: CASA.quartos,
    petsAllowed: PRECOS.aceitaPets,
    // Faixa de diárias, da mais barata à de feriado. O Google mostra isso no
    // resultado de busca local.
    priceRange: `R$ ${PRECOS.diariaSemanaCentavos / 100} - R$ ${PRECOS.diariaFeriadoCentavos / 100}`,
    currenciesAccepted: "BRL",
    checkinTime: "14:00",
    checkoutTime: "12:00",
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "Piscina aquecida", value: true },
      { "@type": "LocationFeatureSpecification", name: "Wi-Fi", value: true },
      { "@type": "LocationFeatureSpecification", name: "Churrasqueira", value: true },
      { "@type": "LocationFeatureSpecification", name: "Estacionamento gratuito", value: true },
      { "@type": "LocationFeatureSpecification", name: "Cozinha completa", value: true },
    ],
  };
}

export default function LayoutDoSite({ children }: LayoutProps<"/">) {
  return (
    <>
      <script
        type="application/ld+json"
        // O conteúdo é nosso e estático; não há entrada de usuário aqui.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dadosEstruturados()) }}
      />
      <div className="flex min-h-screen flex-col">
        <Cabecalho />
        <main className="flex-1">{children}</main>
        <Rodape />
      </div>
    </>
  );
}
