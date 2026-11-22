import type { Metadata } from "next";
import { Suspense } from "react";

import { Dia } from "./Dia";

export const metadata: Metadata = {
  title: "Hoje na casa",
  robots: { index: false, follow: false },
};

function Carregando() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-10 w-56 animate-pulse rounded-lg bg-creme-fundo" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function Hoje() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Suspense fallback={<Carregando />}>
        <Dia />
      </Suspense>
    </main>
  );
}
