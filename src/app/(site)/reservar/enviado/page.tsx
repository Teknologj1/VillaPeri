import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CASA, linkWhatsApp } from "@/modules/conteudo";

export const metadata: Metadata = {
  title: "Pedido enviado",
  robots: { index: false, follow: false },
};

async function Confirmacao({
  searchParams,
}: {
  searchParams: PageProps<"/reservar/enviado">["searchParams"];
}) {
  const q = await searchParams;
  const codigo = Array.isArray(q.codigo) ? q.codigo[0] : q.codigo;

  const href = linkWhatsApp(
    `Olá! Acabei de enviar um pedido de reserva na ${CASA.nome}${
      codigo ? `, código ${codigo}` : ""
    }.`,
  );

  return (
    <>
      {codigo && (
        <p className="mt-6 inline-block rounded-xl border border-borda bg-creme-fundo px-5 py-3">
          Código do pedido:{" "}
          <strong className="font-display text-xl text-vinho">{codigo}</strong>
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full bg-vinho px-7 py-3.5 font-medium text-creme transition-colors hover:bg-vinho-escuro"
          >
            Falar agora no WhatsApp
          </a>
        )}
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full border border-borda px-7 py-3.5 font-medium text-tinta transition-colors hover:bg-creme-fundo"
        >
          Voltar ao início
        </Link>
      </div>
    </>
  );
}

export default function Enviado(props: PageProps<"/reservar/enviado">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <h1 className="font-display text-4xl">Pedido enviado</h1>
      <p className="mt-4 text-lg leading-relaxed text-tinta-suave">
        Recebemos seu pedido e já mandamos uma confirmação para você. Vamos
        conferir a disponibilidade e responder com o valor e as instruções de
        pagamento.
      </p>
      <p className="mt-3 leading-relaxed text-tinta-suave">
        O pedido ainda não garante as datas — elas ficam reservadas depois da
        nossa confirmação e do sinal.
      </p>

      <Suspense fallback={<div className="mt-8 h-32" aria-hidden />}>
        <Confirmacao searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
