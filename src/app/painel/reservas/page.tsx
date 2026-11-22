import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { comoNoite } from "@/lib/data";
import { TODOS_OS_STATUS, type StatusReserva } from "@/modules/reservas";

import { Filtro, Lista, type Filtros } from "./Lista";

export const metadata: Metadata = {
  title: "Reservas",
  robots: { index: false, follow: false },
};

/** Uma data só é aceita se for uma data de verdade; o resto é descartado. */
function noite(valor: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor;
  if (!v) return undefined;
  try {
    return comoNoite(v);
  } catch {
    return undefined;
  }
}

/**
 * Só status que existem na máquina entram no filtro.
 *
 * Vem da URL, logo de fora: sem esta peneira, `?status=qualquer_coisa`
 * chegaria ao `in (...)` do banco. O Postgres recusaria o valor desconhecido
 * do enum com erro, e a tela quebraria para quem mexeu na URL — mas filtrar
 * aqui é o hábito que mantém verdade a frase "o que vem de fora é validado".
 */
function statusValidos(valor: string | string[] | undefined): StatusReserva[] {
  const lista = Array.isArray(valor) ? valor : valor ? [valor] : [];
  return lista.filter((s): s is StatusReserva =>
    (TODOS_OS_STATUS as string[]).includes(s),
  );
}

async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/painel/reservas">["searchParams"];
}) {
  const q = await searchParams;
  const filtros: Filtros = {
    status: statusValidos(q.status),
    de: noite(q.de),
    ate: noite(q.ate),
    busca: Array.isArray(q.busca) ? q.busca[0] : q.busca,
  };

  return (
    <>
      <Filtro filtros={filtros} />
      <Lista filtros={filtros} />
    </>
  );
}

function Carregando() {
  return (
    <div className="mt-8 space-y-3" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function Reservas(props: PageProps<"/painel/reservas">) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">Reservas</h1>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/painel/hoje"
            className="rounded-full border border-borda px-5 py-2.5 text-sm font-medium transition-colors hover:border-vinho/40"
          >
            Hoje na casa
          </Link>
          <Link
            href="/painel/reservas/nova"
            className="rounded-full bg-vinho px-5 py-2.5 text-sm font-medium text-creme transition-colors hover:bg-vinho-escuro"
          >
            Nova reserva
          </Link>
        </div>
      </div>

      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
