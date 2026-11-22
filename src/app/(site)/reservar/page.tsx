import type { Metadata } from "next";
import { Suspense } from "react";

import { CASA, PRECOS } from "@/modules/conteudo";

import { Cotacao, type Pedido } from "./Cotacao";

export const metadata: Metadata = {
  title: "Reservar",
  description: `Consulte disponibilidade e valor da ${CASA.nome} em ${CASA.cidade}. Diárias a partir de R$ ${PRECOS.diariaSemanaCentavos / 100}.`,
  alternates: { canonical: "/reservar" },
};

const CAMPO = "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-2.5";

function inteiro(v: string | string[] | undefined, padrao: number): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 0 ? n : padrao;
}

function texto(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
}

async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/reservar">["searchParams"];
}) {
  const q = await searchParams;
  const entrada = texto(q.entrada);
  const saida = texto(q.saida);
  const adultos = inteiro(q.adultos, 2);
  const criancas = inteiro(q.criancas, 0);

  const pedido: Pedido | null =
    entrada && saida ? { entrada, saida, adultos, criancas } : null;

  return (
    <>
      <form className="mt-8 grid gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="entrada" className="block text-sm font-medium">
            Entrada
          </label>
          <input
            id="entrada"
            name="entrada"
            type="date"
            required
            defaultValue={entrada}
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="saida" className="block text-sm font-medium">
            Saída
          </label>
          <input
            id="saida"
            name="saida"
            type="date"
            required
            defaultValue={saida}
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="adultos" className="block text-sm font-medium">
            Adultos
          </label>
          <input
            id="adultos"
            name="adultos"
            type="number"
            min={1}
            max={CASA.capacidade}
            defaultValue={adultos}
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="criancas" className="block text-sm font-medium">
            Crianças
            <span className="ml-1 font-normal text-tinta-suave">
              ({PRECOS.idadeMinimaCrianca} a {PRECOS.idadeMaximaCrianca})
            </span>
          </label>
          <input
            id="criancas"
            name="criancas"
            type="number"
            min={0}
            max={CASA.capacidade}
            defaultValue={criancas}
            className={CAMPO}
          />
        </div>
        <div className="sm:col-span-4">
          <button
            type="submit"
            className="rounded-full bg-vinho px-7 py-3 font-medium text-creme transition-colors hover:bg-vinho-escuro"
          >
            Ver disponibilidade e valor
          </button>
        </div>
      </form>

      {pedido ? (
        <Cotacao p={pedido} />
      ) : (
        <p className="mt-8 rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-tinta-suave">
          Escolha as datas para ver se a casa está livre e quanto fica.
          Crianças de até {PRECOS.idadeMinimaCrianca - 1} anos não pagam e não
          precisam entrar na conta.
        </p>
      )}
    </>
  );
}

export default function Reservar(props: PageProps<"/reservar">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl sm:text-5xl">Reservar</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-tinta-suave">
        A casa é locada inteira e exclusiva para uma única reserva. Consulte as
        datas e o valor aqui; a confirmação é feita pelo WhatsApp.
      </p>

      <Suspense
        fallback={
          <div className="mt-8 space-y-3" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-creme-fundo" />
            ))}
          </div>
        }
      >
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
