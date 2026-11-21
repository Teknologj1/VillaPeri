import type { Metadata } from "next";
import { Suspense } from "react";

import { Resultado, type Parametros } from "./Resultado";

export const metadata: Metadata = {
  title: "Simulador de tarifa",
  robots: { index: false, follow: false },
};

function inteiro(valor: string | string[] | undefined, padrao: number): number {
  const n = Number(Array.isArray(valor) ? valor[0] : valor);
  return Number.isInteger(n) && n >= 0 ? n : padrao;
}

function texto(valor: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v && v.length > 0 ? v : undefined;
}

const CAMPO = "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-2.5";

/**
 * Formulário e resultado, juntos atrás do Suspense.
 *
 * O formulário também entra aqui porque ele lê `searchParams` para preencher
 * os campos com a última busca — e ler a requisição é o que impede a
 * pré-renderização. Deixar só o título no shell estático é o preço de manter
 * o estado na URL, que vale: o resultado pode ser recarregado, compartilhado
 * com a equipe e encontrado no histórico.
 */
async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/painel/simulador">["searchParams"];
}) {
  const q = await searchParams;

  const entrada = texto(q.entrada);
  const saida = texto(q.saida);
  const adultos = inteiro(q.adultos, 2);
  const criancas = inteiro(q.criancas, 0);

  const parametros: Parametros | null =
    entrada && saida ? { entrada, saida, adultos, criancas } : null;

  return (
    <>
      {/*
        Formulário por GET, de propósito: o resultado fica na URL e funciona
        sem JavaScript.
      */}
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
            max={20}
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
            max={20}
            defaultValue={criancas}
            className={CAMPO}
          />
        </div>
        <div className="sm:col-span-4">
          <button
            type="submit"
            className="rounded-full bg-vinho px-7 py-3 font-medium text-creme transition-colors hover:bg-vinho-escuro"
          >
            Simular
          </button>
        </div>
      </form>

      {parametros ? (
        <Resultado p={parametros} />
      ) : (
        <p className="mt-10 rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-tinta-suave">
          Informe entrada e saída para ver o cálculo.
        </p>
      )}
    </>
  );
}

function Carregando() {
  return (
    <div className="mt-10 space-y-3" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function Simulador(props: PageProps<"/painel/simulador">) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl">Simulador de tarifa</h1>
      <p className="mt-3 max-w-2xl text-tinta-suave">
        Escolha as datas e o número de pessoas para ver o preço noite a noite,
        com a regra que gerou cada valor. Usa o mesmo motor do site e das
        reservas — se os três discordassem, o erro apareceria aqui.
      </p>

      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
