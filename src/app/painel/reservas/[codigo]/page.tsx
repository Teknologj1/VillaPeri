import type { Metadata } from "next";
import { Suspense } from "react";

import { Ficha } from "./Ficha";

export const metadata: Metadata = {
  title: "Reserva",
  robots: { index: false, follow: false },
};

async function Conteudo({
  params,
}: {
  params: PageProps<"/painel/reservas/[codigo]">["params"];
}) {
  const { codigo } = await params;
  return <Ficha codigo={codigo} />;
}

function Carregando() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-6 w-40 animate-pulse rounded-full bg-creme-fundo" />
      <div className="h-10 w-64 animate-pulse rounded-lg bg-creme-fundo" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-xl bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function PaginaDaReserva(
  props: PageProps<"/painel/reservas/[codigo]">,
) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Suspense fallback={<Carregando />}>
        <Conteudo params={props.params} />
      </Suspense>
    </main>
  );
}
