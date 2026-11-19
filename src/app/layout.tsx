import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";

import { CASA } from "@/modules/conteudo";

import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fonte-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--fonte-sans",
  display: "swap",
});

/**
 * `metadataBase` resolve as URLs relativas das imagens de Open Graph. Sem
 * ela, o link compartilhado no WhatsApp e no Instagram vem sem a prévia —
 * que é justamente por onde a Villa Peri recebe hóspedes hoje.
 */
const URL_SITE = process.env.NEXT_PUBLIC_URL_SITE ?? "https://villaperi.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(URL_SITE),
  title: {
    default: `${CASA.nome} — casa inteira em ${CASA.cidade}`,
    template: `%s · ${CASA.nome}`,
  },
  description: CASA.subtitulo,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: CASA.nome,
    title: `${CASA.nome} — casa inteira em ${CASA.cidade}`,
    description: CASA.subtitulo,
    images: [
      {
        url: "/fotos/piscina-vista-pergolado.jpg",
        width: 1167,
        height: 627,
        alt: "Piscina da Villa Peri vista de baixo do pergolado",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  // O vinho do selo da casa: é a cor que a barra do navegador no celular
  // assume, e combinar com a logo faz o site parecer da mesma marca.
  themeColor: "#6d1f1a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
