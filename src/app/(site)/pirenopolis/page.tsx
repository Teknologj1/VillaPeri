import type { Metadata } from "next";
import Image from "next/image";

import { CASA, PIRENOPOLIS, caminhoFoto, fotosDaCategoria } from "@/modules/conteudo";

export const metadata: Metadata = {
  title: "Pirenópolis e como chegar",
  description:
    "O que fazer em Pirenópolis: Centro Histórico, cachoeiras, turismo de aventura e a Festa do Divino. Como chegar de Goiânia e de Brasília.",
  alternates: { canonical: "/pirenopolis" },
};

const FOTOS_NATUREZA = fotosDaCategoria("natureza");
const FOTOS_JARDIM = fotosDaCategoria("jardim");

export default function Pirenopolis() {
  const [mico] = FOTOS_NATUREZA;

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <header className="max-w-3xl">
        <h1 className="font-display text-4xl sm:text-5xl">
          Pirenópolis e como chegar
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-tinta-suave">
          A {CASA.nome} fica no {CASA.bairro}, vizinha a uma reserva ambiental e
          a seis minutos de carro do Centro Histórico.
        </p>
      </header>

      <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="space-y-10">
          {PIRENOPOLIS.map((item) => (
            <section key={item.titulo}>
              <h2 className="font-display text-2xl">{item.titulo}</h2>
              <p className="mt-3 leading-relaxed text-tinta-suave">{item.texto}</p>
            </section>
          ))}

          <section>
            <h2 className="font-display text-2xl">Os micos</h2>
            <p className="mt-3 leading-relaxed text-tinta-suave">
              O quintal é arborizado e recebe visita frequente de animais
              silvestres, principalmente micos. São bem-vindos — mas pedimos que
              não sejam alimentados: comida de gente faz mal a eles e os deixa
              dependentes.
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          {mico && (
            <div className="relative aspect-4/3 overflow-hidden rounded-2xl">
              <Image
                src={caminhoFoto(mico)}
                alt={mico.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 380px"
                className="object-cover"
              />
            </div>
          )}
          {FOTOS_JARDIM.slice(0, 2).map((foto) => (
            <div
              key={foto.arquivo}
              className="relative aspect-4/3 overflow-hidden rounded-2xl"
            >
              <Image
                src={caminhoFoto(foto)}
                alt={foto.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 380px"
                className="object-cover"
              />
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
