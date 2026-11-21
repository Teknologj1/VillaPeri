import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { CASA } from "@/modules/conteudo";

import { FormularioDeLogin } from "./FormularioDeLogin";

export const metadata: Metadata = {
  title: "Entrar",
  // Painel interno não entra em buscador.
  robots: { index: false, follow: false },
};

export default function Entrar() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/marca/villa-peri-selo.png"
            alt=""
            width={44}
            height={44}
            className="h-11 w-11"
          />
          <span className="font-display text-2xl text-vinho">{CASA.nome}</span>
        </Link>

        <h1 className="mt-8 font-display text-3xl">Entrar no painel</h1>
        <p className="mt-2 text-tinta-suave">
          Acesso da equipe da {CASA.nome}.
        </p>

        {/*
          `useSearchParams` força o componente a esperar a requisição. Sem a
          fronteira de Suspense, essa espera sobe e impede a página inteira de
          ser pré-renderizada.
        */}
        <Suspense fallback={<div className="mt-8 h-64" />}>
          <FormularioDeLogin />
        </Suspense>

        <p className="mt-8 text-sm text-tinta-suave">
          Não tem acesso? O proprietário cria as contas da equipe pelo painel.
        </p>
      </div>
    </main>
  );
}
