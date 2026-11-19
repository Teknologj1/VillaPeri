import type { Metadata } from "next";
import Image from "next/image";

import {
  CASA,
  CATEGORIAS,
  FOTOS,
  caminhoFoto,
  fotosDaCategoria,
} from "@/modules/conteudo";

export const metadata: Metadata = {
  title: "Galeria",
  description: `Fotos da ${CASA.nome}: piscina aquecida, varandas com redes, área de churrasco, cozinha, suítes e o jardim arborizado.`,
  alternates: { canonical: "/galeria" },
};

export default function Galeria() {
  const comFotos = CATEGORIAS.map((c) => ({
    ...c,
    fotos: fotosDaCategoria(c.id),
  })).filter((c) => c.fotos.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <header className="max-w-3xl">
        <h1 className="font-display text-4xl sm:text-5xl">Galeria</h1>
        <p className="mt-5 text-lg leading-relaxed text-tinta-suave">
          {FOTOS.length} fotos da casa, do quintal e do que há em volta.
        </p>
      </header>

      {/*
        Índice de seções: numa página com dezenas de fotos, rolar até achar a
        piscina é trabalho. Âncora resolve sem precisar de JavaScript.
      */}
      <nav aria-label="Seções da galeria" className="mt-8 flex flex-wrap gap-2">
        {comFotos.map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            className="rounded-full border border-borda bg-creme-fundo px-4 py-2 text-sm text-tinta-suave transition-colors hover:border-vinho hover:text-vinho"
          >
            {c.titulo}
          </a>
        ))}
      </nav>

      {comFotos.map((categoria) => (
        <section key={categoria.id} id={categoria.id} className="mt-16 scroll-mt-24">
          <h2 className="font-display text-2xl sm:text-3xl">{categoria.titulo}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoria.fotos.map((foto) => (
              <figure
                key={foto.arquivo}
                className="relative aspect-4/3 overflow-hidden rounded-xl bg-creme-fundo"
              >
                <Image
                  src={caminhoFoto(foto)}
                  alt={foto.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 hover:scale-105"
                />
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
