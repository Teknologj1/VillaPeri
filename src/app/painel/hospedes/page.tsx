import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { withTenant } from "@/db/tenant";
import { formatarNoite } from "@/lib/data";
import { exigirSessao } from "@/lib/sessao";
import { formatarTelefone } from "@/lib/telefone";
import { podeNoModulo } from "@/modules/autenticacao";
import { listarHospedes } from "@/modules/reservas";

import { SemAcesso } from "../_componentes/SemAcesso";

export const metadata: Metadata = {
  title: "Hóspedes",
  robots: { index: false, follow: false },
};

const CAMPO = "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-2.5";

async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/painel/hospedes">["searchParams"];
}) {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "hospedes", "ver")) {
    return <SemAcesso modulo="hóspedes" />;
  }

  const q = await searchParams;
  const busca = Array.isArray(q.busca) ? q.busca[0] : q.busca;

  const hospedes = await withTenant(sessao.anfitriaoId, (tx) =>
    listarHospedes(tx, busca),
  );

  return (
    <>
      <form className="mt-8 flex flex-wrap items-end gap-4">
        <div className="min-w-64 flex-1">
          <label htmlFor="busca" className="block text-sm font-medium">
            Nome, telefone ou e-mail
          </label>
          <input
            id="busca"
            name="busca"
            defaultValue={busca}
            placeholder="Maria, 98888, maria@"
            className={CAMPO}
          />
        </div>
        <button
          type="submit"
          className="rounded-full bg-vinho px-7 py-3 font-medium text-creme transition-colors hover:bg-vinho-escuro"
        >
          Buscar
        </button>
      </form>

      {hospedes.length === 0 ? (
        <p className="mt-8 rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-tinta-suave">
          {busca
            ? "Ninguém com esse nome, telefone ou e-mail."
            : "Nenhum hóspede cadastrado ainda. As fichas nascem da primeira reserva."}
        </p>
      ) : (
        <>
          <p className="mt-8 text-sm text-tinta-suave">
            {hospedes.length} {hospedes.length === 1 ? "pessoa" : "pessoas"}
          </p>
          <ul className="mt-4 divide-y divide-borda overflow-hidden rounded-xl border border-borda">
            {hospedes.map((h) => (
              <li key={h.id}>
                <Link
                  href={`/painel/hospedes/${h.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 bg-creme-fundo px-5 py-3 transition-colors hover:bg-creme"
                >
                  <span className="font-medium">
                    {h.nome}
                    {h.recorrente && (
                      <span className="ml-2 rounded-full bg-dourado/25 px-2.5 py-0.5 text-xs font-normal text-tinta">
                        voltou
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-tinta-suave">
                    {formatarTelefone(h.telefone) ?? h.email ?? "sem contato"}
                  </span>
                  <span className="ml-auto text-sm text-tinta-suave">
                    {h.estadias === 0
                      ? "nenhuma estadia"
                      : `${h.estadias} ${h.estadias === 1 ? "estadia" : "estadias"}`}
                    {h.ultimaSaida && ` · até ${formatarNoite(h.ultimaSaida)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Carregando() {
  return (
    <div className="mt-8 space-y-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function Hospedes(props: PageProps<"/painel/hospedes">) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl">Hóspedes</h1>
      <p className="mt-3 max-w-2xl text-tinta-suave">
        O cadastro nasce das reservas: cada pedido com telefone novo cria uma
        ficha, e quem volta com o mesmo telefone reaproveita a que já existe.
      </p>

      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
