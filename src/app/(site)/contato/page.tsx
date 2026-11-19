import type { Metadata } from "next";
import Image from "next/image";

import { CASA, WHATSAPP, caminhoFoto, fotosDaCategoria } from "@/modules/conteudo";

import { BotaoWhatsApp } from "../_componentes/BotaoWhatsApp";

export const metadata: Metadata = {
  title: "Contato",
  description: `Fale com a ${CASA.nome} para consultar datas, valores e condições de reserva.`,
  alternates: { canonical: "/contato" },
};

const [FACHADA] = fotosDaCategoria("fachada");

export default function Contato() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl">Contato</h1>
          <p className="mt-5 text-lg leading-relaxed text-tinta-suave">
            Fale com a gente para consultar datas, valores e condições. A casa é
            locada inteira e exclusiva para uma única reserva.
          </p>

          <div className="mt-8">
            <BotaoWhatsApp
              mensagem={`Olá! Vi o site da ${CASA.nome} e gostaria de consultar disponibilidade e valores.`}
            >
              {WHATSAPP ? "Falar no WhatsApp" : "WhatsApp"}
            </BotaoWhatsApp>
          </div>

          {!WHATSAPP && (
            /*
              Enquanto o número não está configurado, o site diz isso em vez de
              oferecer um botão que não leva a lugar nenhum. Some sozinho
              quando NEXT_PUBLIC_WHATSAPP for definido.
            */
            <p className="mt-4 rounded-lg border border-borda bg-creme-fundo p-4 text-sm text-tinta-suave">
              O número de WhatsApp ainda não foi configurado neste site. Defina
              a variável <code className="font-mono">NEXT_PUBLIC_WHATSAPP</code>{" "}
              com o número em formato internacional, só dígitos.
            </p>
          )}

          <dl className="mt-10 space-y-5 text-tinta-suave">
            <div>
              <dt className="text-sm uppercase tracking-wide text-tinta">
                Onde fica
              </dt>
              <dd className="mt-1">
                {CASA.bairro}, {CASA.cidade} — {CASA.uf}
                <br />
                A 6 minutos de carro do Centro Histórico.
              </dd>
            </div>
            <div>
              <dt className="text-sm uppercase tracking-wide text-tinta">
                Como chegar
              </dt>
              <dd className="mt-1">
                Cerca de 150 km de Goiânia e 190 km de Brasília. Garagem
                sombreada para até 4 carros.
              </dd>
            </div>
          </dl>
        </div>

        {FACHADA && (
          <div className="relative aspect-4/3 overflow-hidden rounded-2xl">
            <Image
              src={caminhoFoto(FACHADA)}
              alt={FACHADA.alt}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        )}
      </div>
    </div>
  );
}
