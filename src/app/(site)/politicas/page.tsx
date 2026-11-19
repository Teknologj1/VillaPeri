import type { Metadata } from "next";

import { CASA, REGRAS_DA_CASA } from "@/modules/conteudo";

import { BotaoWhatsApp } from "../_componentes/BotaoWhatsApp";

export const metadata: Metadata = {
  title: "Políticas e regras da casa",
  description:
    "Horários de check-in e check-out, regras da casa e o que está incluído na hospedagem da Villa Peri.",
  alternates: { canonical: "/politicas" },
};

const INCLUSO = [
  "Roupas de cama e banho",
  "Toalhas, lençóis, sabonete e papel higiênico",
  "Itens básicos de cozinha: vasilhas, panelas, óleo, sal e pimenta",
  "Wi-Fi",
  "Estacionamento na garagem, para até 4 carros",
  "Uso da piscina, da churrasqueira e do fogão caipira",
];

export default function Politicas() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl">
          Políticas e regras da casa
        </h1>
      </header>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Horários</h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-borda bg-creme-fundo p-5">
            <dt className="text-sm uppercase tracking-wide text-tinta-suave">
              Check-in
            </dt>
            <dd className="mt-1 font-display text-2xl">a partir das {CASA.checkin}</dd>
          </div>
          <div className="rounded-xl border border-borda bg-creme-fundo p-5">
            <dt className="text-sm uppercase tracking-wide text-tinta-suave">
              Check-out
            </dt>
            <dd className="mt-1 font-display text-2xl">até as {CASA.checkout}</dd>
          </div>
        </dl>
        <p className="mt-4 text-tinta-suave">
          Guardamos a bagagem para quem chega cedo ou sai tarde. O anfitrião
          recebe você na chegada.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Regras da casa</h2>
        <ul className="mt-5 space-y-3">
          {REGRAS_DA_CASA.map((regra) => (
            <li
              key={regra}
              className="border-l-2 border-terracota/40 pl-4 leading-relaxed text-tinta-suave"
            >
              {regra}
            </li>
          ))}
        </ul>
        <p className="mt-5 leading-relaxed text-tinta-suave">
          Pedimos bom senso com o barulho durante o dia: a vizinhança é
          residencial e prezamos pelo bom convívio.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">O que está incluído</h2>
        <ul className="mt-5 space-y-2 text-tinta-suave">
          {INCLUSO.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Valores, sinal e cancelamento</h2>
        <p className="mt-4 leading-relaxed text-tinta-suave">
          A diária varia conforme o período do ano, o número de hóspedes e os
          feriados. O valor do sinal e as condições de cancelamento são
          informados junto com a proposta de reserva.
        </p>
        <div className="mt-6">
          <BotaoWhatsApp
            mensagem={`Olá! Gostaria de saber os valores e as condições de reserva da ${CASA.nome}.`}
            variante="secundario"
          >
            Consultar valores e condições
          </BotaoWhatsApp>
        </div>
      </section>
    </div>
  );
}
