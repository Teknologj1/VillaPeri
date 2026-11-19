import type { Metadata } from "next";
import Image from "next/image";

import {
  CASA,
  COMODIDADES,
  SUITES,
  caminhoFoto,
  fotosDaCategoria,
} from "@/modules/conteudo";

import { BotaoWhatsApp } from "../_componentes/BotaoWhatsApp";

export const metadata: Metadata = {
  title: "A casa",
  description: `${CASA.capacidade} hóspedes, ${CASA.quartos} suítes, ${CASA.camas} camas e ${CASA.banheiros} banheiros. Piscina aquecida, cozinha completa e área de churrasco com fogão caipira.`,
  alternates: { canonical: "/a-casa" },
};

const FOTOS_SUITES = fotosDaCategoria("suites");
const FOTOS_COZINHA = fotosDaCategoria("cozinha");
const FOTOS_CHURRASCO = fotosDaCategoria("churrasco");

export default function ACasa() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <header className="max-w-3xl">
        <h1 className="font-display text-4xl sm:text-5xl">A casa</h1>
        <p className="mt-5 text-lg leading-relaxed text-tinta-suave">
          {CASA.capacidade} hóspedes · {CASA.quartos} suítes · {CASA.camas} camas ·{" "}
          {CASA.banheiros} banheiros. Locada inteira e exclusiva para uma única
          reserva — você não divide a casa com ninguém.
        </p>
      </header>

      {/* ----------------------------------------------------------------- */}
      <section className="mt-16">
        <h2 className="font-display text-3xl">As três suítes</h2>
        <p className="mt-3 max-w-2xl text-tinta-suave">
          Cada suíte tem banheiro privativo e entrada independente pelo pátio.
        </p>

        {/*
          Sem foto dentro de cada cartão de propósito. Só existem duas fotos de
          suíte no acervo, e repeti-las entre as três faria a mesma porta
          ilustrar quartos diferentes — a escada, por exemplo, é do chalé da
          Suíte 03 e apareceria na 02. As fotos vão abaixo, legendadas pelo que
          de fato são.
        */}
        <div className="mt-9 grid gap-6 lg:grid-cols-3">
          {SUITES.map((suite) => (
            <article
              key={suite.nome}
              className="rounded-2xl border border-borda bg-creme-fundo p-6"
            >
              <h3 className="font-display text-2xl">{suite.nome}</h3>
              <p className="mt-1 text-sm text-terracota">
                até {suite.capacidade} pessoas
              </p>
              <p className="mt-3 leading-relaxed text-tinta-suave">
                {suite.descricao}
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {suite.destaques.map((d) => (
                  <li
                    key={d}
                    className="rounded-full border border-borda bg-creme px-3 py-1 text-sm text-tinta-suave"
                  >
                    {d}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="mt-6 text-sm text-tinta-suave">
          As Suítes 01 e 02 podem ser usadas conjugadas, o que ajuda quando o
          grupo tem crianças.
        </p>

        {FOTOS_SUITES.length > 0 && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {FOTOS_SUITES.map((foto) => (
              <figure key={foto.arquivo}>
                <div className="relative aspect-4/3 overflow-hidden rounded-xl">
                  <Image
                    src={caminhoFoto(foto)}
                    alt={foto.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-2 text-sm text-tinta-suave">
                  {foto.arquivo === "escada-chale.jpg"
                    ? "A escada do chalé de dois andares, na Suíte 03."
                    : "Cada suíte tem entrada independente pelo pátio."}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* ----------------------------------------------------------------- */}
      <section className="mt-20">
        <h2 className="font-display text-3xl">Cozinha e área de churrasco</h2>
        <p className="mt-3 max-w-2xl text-tinta-suave">
          Cozinha totalmente equipada, churrasqueira com pia e bancada, e fogão
          caipira a lenha para quem quiser cozinhar devagar.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...FOTOS_CHURRASCO, ...FOTOS_COZINHA].slice(0, 6).map((foto) => (
            <div
              key={foto.arquivo}
              className="relative aspect-4/3 overflow-hidden rounded-xl"
            >
              <Image
                src={caminhoFoto(foto)}
                alt={foto.alt}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      <section className="mt-20">
        <h2 className="font-display text-3xl">Comodidades</h2>
        <div className="mt-9 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {COMODIDADES.map((grupo) => (
            <div key={grupo.titulo}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-terracota">
                {grupo.titulo}
              </h3>
              <ul className="mt-4 space-y-2 text-tinta-suave">
                {grupo.itens.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      <section className="mt-20 rounded-2xl bg-creme-fundo p-10 text-center">
        <h2 className="font-display text-3xl">Consulte suas datas</h2>
        <p className="mx-auto mt-3 max-w-xl text-tinta-suave">
          Respondemos pelo WhatsApp com disponibilidade e valores.
        </p>
        <div className="mt-7">
          <BotaoWhatsApp
            mensagem={`Olá! Vi o site da ${CASA.nome} e gostaria de consultar disponibilidade e valores.`}
          >
            Falar no WhatsApp
          </BotaoWhatsApp>
        </div>
      </section>
    </div>
  );
}
