import Link from "next/link";

import { withTenant } from "@/db/tenant";
import { env } from "@/env";
import { formatarNoite, hojeNaPropriedade } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { formatarTelefone } from "@/lib/telefone";
import { exigirSessao } from "@/lib/sessao";
import { buscarPropriedade } from "@/modules/anfitriao";
import { podeNoModulo } from "@/modules/autenticacao";
import {
  type HojeNaCasa,
  type ReservaDaLista,
  hojeNaCasa,
} from "@/modules/reservas";

import { Etiqueta, EtiquetaFnrh } from "../_componentes/Etiqueta";
import { SemAcesso } from "../_componentes/SemAcesso";

function Pessoa({
  r,
  mostrarSaldo,
  verContato,
}: {
  r: ReservaDaLista;
  mostrarSaldo: boolean;
  verContato: boolean;
}) {
  const falta = r.totalCentavos - r.pagoCentavos;

  return (
    <li>
      <Link
        href={`/painel/reservas/${r.codigo}`}
        className="block rounded-xl border border-borda bg-creme-fundo px-5 py-4 transition-colors hover:border-vinho/40"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-medium">{r.hospedeNome}</span>
          <Etiqueta status={r.status} />
          <EtiquetaFnrh status={r.fnrhStatus} />
          <span className="ml-auto font-mono text-xs text-tinta-suave">
            {r.codigo}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-tinta-suave">
          <span>
            {r.adultos + r.criancas}{" "}
            {r.adultos + r.criancas === 1 ? "pessoa" : "pessoas"}
          </span>
          <span>
            {formatarNoite(r.entrada, false)} a {formatarNoite(r.saida, false)}
          </span>
          {r.horarioChegada && <span>chega às {r.horarioChegada}</span>}
          {verContato && r.hospedeTelefone && (
            <span>{formatarTelefone(r.hospedeTelefone)}</span>
          )}
          {mostrarSaldo &&
            (falta > 0 ? (
              <span className="font-medium text-vinho">
                receber {formatarReais(falta)}
              </span>
            ) : (
              <span className="text-mata">quitada</span>
            ))}
        </div>
      </Link>
    </li>
  );
}

function Grupo({
  titulo,
  vazio,
  reservas,
  mostrarSaldo = false,
  verContato,
}: {
  titulo: string;
  vazio: string;
  reservas: ReservaDaLista[];
  mostrarSaldo?: boolean;
  verContato: boolean;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl">
        {titulo}
        {reservas.length > 0 && (
          <span className="ml-2 text-base font-normal text-tinta-suave">
            {reservas.length}
          </span>
        )}
      </h2>
      {reservas.length === 0 ? (
        <p className="mt-3 text-tinta-suave">{vazio}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reservas.map((r) => (
            <Pessoa
              key={r.id}
              r={r}
              mostrarSaldo={mostrarSaldo}
              verContato={verContato}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export async function Dia() {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "reservas", "ver")) {
    return <SemAcesso modulo="reservas" />;
  }

  const verContato = podeNoModulo(sessao, "hospedes", "ver");
  const hoje = hojeNaPropriedade(env.TZ_PROPRIEDADE);

  const { dia, propriedade } = await withTenant(
    sessao.anfitriaoId,
    async (tx) => ({
      dia: (await hojeNaCasa(tx, hoje)) satisfies HojeNaCasa,
      propriedade: await buscarPropriedade(tx),
    }),
  );

  const total =
    dia.chegadas.length + dia.saidas.length + dia.naCasa.length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Hoje na casa</h1>
          <p className="mt-2 text-tinta-suave">
            {formatarNoite(hoje)} · check-in a partir das{" "}
            {propriedade.checkinPadrao.slice(0, 5)}, check-out até as{" "}
            {propriedade.checkoutPadrao.slice(0, 5)}
          </p>
        </div>

        {total > 0 && (
          <a
            href="/painel/hoje/folha"
            className="rounded-full border border-borda px-5 py-2.5 text-sm font-medium transition-colors hover:border-vinho/40"
          >
            Baixar folha da portaria
          </a>
        )}
      </div>

      {total === 0 && (
        <p className="mt-10 rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-tinta-suave">
          Nenhuma chegada, saída ou hóspede na casa hoje.
        </p>
      )}

      <Grupo
        titulo="Chegam hoje"
        vazio="Ninguém chega hoje."
        reservas={dia.chegadas}
        mostrarSaldo
        verContato={verContato}
      />
      <Grupo
        titulo="Saem hoje"
        vazio="Ninguém sai hoje."
        reservas={dia.saidas}
        verContato={verContato}
      />
      <Grupo
        titulo="Continuam na casa"
        vazio="Nenhum hóspede em estadia no meio hoje."
        reservas={dia.naCasa}
        verContato={verContato}
      />
    </>
  );
}
