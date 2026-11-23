import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { env } from "@/env";
import { hojeNaPropriedade } from "@/lib/data";

import { Mes } from "./Mes";

export const metadata: Metadata = {
  title: "Calendário",
  robots: { index: false, follow: false },
};

/**
 * O mês que a URL pede, ou o mês corrente.
 *
 * "Corrente" é no fuso da propriedade, não no do servidor: em UTC, depois das
 * 21h em Brasília o dia já virou, e no último dia do mês o calendário abriria
 * no mês seguinte.
 */
function mesPedido(q: Record<string, string | string[] | undefined>) {
  const um = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const hoje = hojeNaPropriedade(env.TZ_PROPRIEDADE);

  const ano = Number(um(q.ano));
  const mes = Number(um(q.mes));

  const anoValido = Number.isInteger(ano) && ano >= 2000 && ano <= 2100;
  const mesValido = Number.isInteger(mes) && mes >= 1 && mes <= 12;

  return {
    ano: anoValido ? ano : Number(hoje.slice(0, 4)),
    mes: mesValido ? mes : Number(hoje.slice(5, 7)),
  };
}

async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/painel/calendario">["searchParams"];
}) {
  // Sem mês na URL, o padrão é o mês CORRENTE — e "corrente" é uma leitura do
  // relógio, que o prerender não pode fazer: a página ficaria presa no mês em
  // que foi gerada. `connection()` marca onde o tempo de requisição começa.
  await connection();

  const { ano, mes } = mesPedido(await searchParams);
  return <Mes ano={ano} mes={mes} />;
}

function Carregando() {
  return (
    <div className="mt-8 space-y-4" aria-hidden>
      <div className="h-10 w-72 animate-pulse rounded-lg bg-creme-fundo" />
      <div className="h-96 animate-pulse rounded-xl bg-creme-fundo" />
    </div>
  );
}

export default function Calendario(props: PageProps<"/painel/calendario">) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl">Calendário</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-tinta-suave">
        Cada noite tem um estado só, e é dele que saem o site, o simulador e a
        resposta da RIIA. Fechar uma data aqui a tira de venda em todos os três
        ao mesmo tempo.
      </p>

      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
