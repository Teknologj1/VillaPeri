import type { Metadata } from "next";
import { Suspense } from "react";

import { comoNoite } from "@/lib/data";

import { Cotacao, type Pedido } from "./Cotacao";

export const metadata: Metadata = {
  title: "Nova reserva",
  robots: { index: false, follow: false },
};

const CAMPO = "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-2.5";

function um(valor: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v && v.length > 0 ? v : undefined;
}

function noite(valor: string | string[] | undefined): string | undefined {
  const v = um(valor);
  if (!v) return undefined;
  try {
    return comoNoite(v);
  } catch {
    return undefined;
  }
}

function inteiro(valor: string | string[] | undefined, padrao: number): number {
  const n = Number(um(valor));
  return Number.isInteger(n) && n >= 0 ? n : padrao;
}

/**
 * Formulário e cotação juntos, como no simulador.
 *
 * O formulário lê `searchParams` para manter as datas depois de cotar, e ler
 * a requisição é o que impede a pré-renderização — então ele entra aqui
 * dentro do Suspense junto com o resultado, em vez de ficar no shell.
 */
async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/painel/reservas/nova">["searchParams"];
}) {
  const q = await searchParams;

  const entrada = noite(q.entrada);
  const saida = noite(q.saida);
  const adultos = inteiro(q.adultos, 2);
  const criancas = inteiro(q.criancas, 0);
  const solicitacaoId = um(q.solicitacao);

  const pedido: Pedido | null =
    entrada && saida
      ? { entrada, saida, adultos, criancas, solicitacaoId }
      : null;

  return (
    <>
      {/* Por GET: a cotação fica na URL, dá para recarregar e mandar o link
          para um colega conferir antes de fechar. */}
      <form className="mt-8 grid gap-4 sm:grid-cols-4">
        {solicitacaoId && (
          <input type="hidden" name="solicitacao" value={solicitacaoId} />
        )}
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
            max={30}
            defaultValue={adultos}
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="criancas" className="block text-sm font-medium">
            Crianças
            <span className="ml-1 font-normal text-tinta-suave">(5 a 9)</span>
          </label>
          <input
            id="criancas"
            name="criancas"
            type="number"
            min={0}
            max={30}
            defaultValue={criancas}
            className={CAMPO}
          />
        </div>
        <div className="sm:col-span-4">
          <button
            type="submit"
            className="rounded-full border border-borda px-7 py-3 font-medium transition-colors hover:border-vinho/40"
          >
            Cotar
          </button>
        </div>
      </form>

      {pedido ? (
        <Cotacao pedido={pedido} />
      ) : (
        <p className="mt-10 rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-tinta-suave">
          Informe as datas e o número de pessoas para ver o preço e criar a
          reserva.
        </p>
      )}
    </>
  );
}

function Carregando() {
  return (
    <div className="mt-8 space-y-4" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function NovaReserva(props: PageProps<"/painel/reservas/nova">) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl">Nova reserva</h1>
      <p className="mt-3 max-w-2xl text-tinta-suave">
        Cota com o mesmo motor do site e do simulador — se os três
        discordassem, o erro apareceria aqui.
      </p>

      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
