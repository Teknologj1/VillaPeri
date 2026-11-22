import Image from "next/image";
import Link from "next/link";

import { formatarReais } from "@/lib/dinheiro";
import {
  CASA,
  COMODIDADES,
  FOTOS_DESTAQUE,
  FOTO_CAPA,
  PIRENOPOLIS,
  PRECOS,
  caminhoFoto,
} from "@/modules/conteudo";

import { BotaoWhatsApp } from "./_componentes/BotaoWhatsApp";

const NUMEROS = [
  { valor: CASA.capacidade, rotulo: "hóspedes" },
  { valor: CASA.quartos, rotulo: "suítes" },
  { valor: CASA.camas, rotulo: "camas" },
  { valor: CASA.banheiros, rotulo: "banheiros" },
];

export default function Inicio() {
  const [destaque1, destaque2, destaque3, destaque4, destaque5] = FOTOS_DESTAQUE;

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/*
        A imagem fica absoluta ATRÁS do conteúdo, e é o conteúdo que dá altura
        à seção. Com altura fixa (70vh) e conteúdo absoluto por cima, no
        celular o texto transbordava a foto e invadia a faixa de baixo: título
        grande, parágrafo e dois botões não cabem em 70vh de tela estreita.
      */}
      <section className="relative isolate overflow-hidden">
        <Image
          src={caminhoFoto(FOTO_CAPA)}
          alt={FOTO_CAPA.alt}
          fill
          // A imagem de abertura é o Largest Contentful Paint da página: sem
          // `priority` ela entra na fila atrás do resto e o site parece lento
          // justamente no primeiro segundo.
          priority
          sizes="100vw"
          className="-z-20 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-tinta/60 via-tinta/45 to-tinta/80" />

        {/*
          Espaçamento contido de propósito. As fotos vêm de capturas de tela e
          têm só ~1170px de largura: um hero alto obrigava o navegador a
          ampliá-las uns 75%, o que borrava a imagem e aumentava os defeitos do
          original. Com a seção mais baixa, a foto é exibida quase no tamanho
          nativo e fica nítida.
        */}
        <div className="mx-auto w-full max-w-6xl px-4 pt-24 pb-12 sm:px-6 sm:pt-32 sm:pb-14 lg:pt-36">
          <p className="text-xs uppercase tracking-[0.2em] text-creme/80 sm:text-sm">
            {/* O bairro sai no celular: com ele a linha quebra e deixa o "GO"
                sozinho embaixo. */}
            <span className="hidden sm:inline">{CASA.bairro} · </span>
            {CASA.cidade} — {CASA.uf}
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-[2.1rem] leading-[1.12] text-creme sm:text-5xl lg:text-6xl">
            {CASA.chamada}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-creme/90 sm:text-lg">
            {CASA.subtitulo}
          </p>
          {/*
            Só a diária mínima. O total de um grupo grande depende da ocupação
            base, e número de página pública que não bate com o da conversa
            vira discussão no check-in.
          */}
          <p className="mt-4 text-base text-creme/90">
            Diárias a partir de{" "}
            <strong className="font-semibold text-creme">
              {formatarReais(PRECOS.diariaSemanaCentavos)}
            </strong>{" "}
            · mínimo de {PRECOS.minimoNoites} noites
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/reservar"
              className="inline-flex items-center justify-center rounded-full bg-vinho px-7 py-3.5 text-base font-medium text-creme transition-colors hover:bg-vinho-escuro"
            >
              Consultar datas e valores
            </Link>
            <Link
              href="/galeria"
              className="inline-flex items-center justify-center rounded-full border border-creme/40 px-7 py-3.5 text-base font-medium text-creme transition-colors hover:bg-creme/10"
            >
              Ver as fotos
            </Link>
          </div>
        </div>
      </section>

      <div className="border-b border-borda bg-creme-fundo">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-5 px-4 py-7 sm:px-6 lg:grid-cols-4">
          {NUMEROS.map((n) => (
            <div key={n.rotulo}>
              <dt className="sr-only">{n.rotulo}</dt>
              <dd>
                <span className="font-display text-3xl text-vinho">
                  {n.valor}
                </span>
                <span className="ml-2 text-sm text-tinta-suave">{n.rotulo}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl">
              A casa inteira é sua
            </h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-tinta-suave">
              {CASA.descricao.map((p) => (
                <p key={p.slice(0, 30)}>{p}</p>
              ))}
            </div>
            <Link
              href="/a-casa"
              className="mt-7 inline-block font-medium text-vinho underline underline-offset-4 hover:text-vinho-escuro"
            >
              Conhecer as três suítes
            </Link>
          </div>

          {destaque1 && (
            <div className="relative aspect-4/3 overflow-hidden rounded-2xl">
              <Image
                src={caminhoFoto(destaque1)}
                alt={destaque1.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover"
              />
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="bg-creme-fundo py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl">
            Piscina aquecida, fogão caipira e rede na varanda
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-tinta-suave">
            O quintal é cercado e arborizado, com piscina de aquecimento solar,
            área de churrasco com fogão a lenha e varandas com redes para o fim
            da tarde.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[destaque2, destaque3, destaque4, destaque5]
              .filter((f) => f !== undefined)
              .map((foto) => (
                <div
                  key={foto.arquivo}
                  className="relative aspect-square overflow-hidden rounded-xl"
                >
                  <Image
                    src={caminhoFoto(foto)}
                    alt={foto.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-500 hover:scale-105"
                  />
                </div>
              ))}
          </div>

          <Link
            href="/galeria"
            className="mt-8 inline-block font-medium text-vinho underline underline-offset-4 hover:text-vinho-escuro"
          >
            Ver as 42 fotos
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="font-display text-3xl sm:text-4xl">O que tem na casa</h2>
        <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {COMODIDADES.map((grupo) => (
            <div key={grupo.titulo}>
              <h3 className="text-base font-semibold tracking-wide text-vinho uppercase">
                {grupo.titulo}
              </h3>
              <ul className="mt-4 space-y-2 text-tinta-suave">
                {grupo.itens.slice(0, 6).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Link
          href="/a-casa"
          className="mt-8 inline-block font-medium text-vinho underline underline-offset-4 hover:text-vinho-escuro"
        >
          Ver a lista completa
        </Link>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="bg-mata py-20 text-creme">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="font-display text-3xl text-creme sm:text-4xl">
            A seis minutos do Centro Histórico
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {PIRENOPOLIS.slice(0, 3).map((item) => (
              <div key={item.titulo}>
                <h3 className="font-display text-xl text-creme">{item.titulo}</h3>
                <p className="mt-2 leading-relaxed text-creme/80">{item.texto}</p>
              </div>
            ))}
          </div>
          <Link
            href="/pirenopolis"
            className="mt-9 inline-block font-medium text-creme underline underline-offset-4 hover:text-creme/80"
          >
            Cachoeiras, festas e como chegar
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h2 className="font-display text-3xl sm:text-4xl">
          Quer saber se as suas datas estão livres?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-tinta-suave">
          Fale com a gente pelo WhatsApp. A casa é locada inteira e exclusiva
          para uma única reserva.
        </p>
        <div className="mt-8">
          <BotaoWhatsApp
            mensagem={`Olá! Vi o site da ${CASA.nome} e gostaria de consultar disponibilidade e valores.`}
          >
            Falar no WhatsApp
          </BotaoWhatsApp>
        </div>
      </section>
    </>
  );
}
