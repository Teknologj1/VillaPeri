import Link from "next/link";

import { withTenant } from "@/db/tenant";
import { formatarNoite } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { exigirSessao } from "@/lib/sessao";
import { podeNoModulo } from "@/modules/autenticacao";
import {
  TODOS_OS_STATUS,
  type StatusReserva,
  listarReservas,
} from "@/modules/reservas";

import { Etiqueta, EtiquetaFnrh } from "../_componentes/Etiqueta";
import { SemAcesso } from "../_componentes/SemAcesso";

export type Filtros = {
  status?: StatusReserva[];
  de?: string;
  ate?: string;
  busca?: string;
};

/** Quanto falta receber, pela diferença entre o total e o que já entrou. */
function saldo(totalCentavos: number, pagoCentavos: number): number {
  return totalCentavos - pagoCentavos;
}

export async function Lista({ filtros }: { filtros: Filtros }) {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "reservas", "ver")) {
    return <SemAcesso modulo="reservas" />;
  }

  const reservas = await withTenant(sessao.anfitriaoId, (tx) =>
    listarReservas(tx, filtros),
  );

  if (reservas.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-tinta-suave">
        Nenhuma reserva com esses filtros.
      </p>
    );
  }

  return (
    <>
      <p className="mt-8 text-sm text-tinta-suave">
        {reservas.length}{" "}
        {reservas.length === 1 ? "reserva" : "reservas"}
      </p>

      {/* Uma lista de cartões, não uma tabela: a recepção abre isso no
          celular, e tabela de oito colunas em tela de 360px vira rolagem
          horizontal que esconde justamente o nome do hóspede. */}
      <ul className="mt-4 space-y-3">
        {reservas.map((r) => {
          const falta = saldo(r.totalCentavos, r.pagoCentavos);
          return (
            <li key={r.id}>
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
                    {formatarNoite(r.entrada, false)} a{" "}
                    {formatarNoite(r.saida)}
                  </span>
                  <span>
                    {r.adultos + r.criancas}{" "}
                    {r.adultos + r.criancas === 1 ? "pessoa" : "pessoas"}
                  </span>
                  <span>{formatarReais(r.totalCentavos)}</span>
                  {falta > 0 ? (
                    <span className="text-vinho">
                      falta {formatarReais(falta)}
                    </span>
                  ) : (
                    <span className="text-mata">pago</span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * O formulário de filtro. Por GET: o resultado fica na URL, funciona sem
 * JavaScript e a equipe consegue mandar um link de "as confirmadas de
 * dezembro" no grupo.
 */
export function Filtro({ filtros }: { filtros: Filtros }) {
  const CAMPO =
    "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-2.5";

  return (
    <form className="mt-8 grid gap-4 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <label htmlFor="busca" className="block text-sm font-medium">
          Nome ou código
        </label>
        <input
          id="busca"
          name="busca"
          defaultValue={filtros.busca}
          placeholder="Maria, ou R-4K7P"
          className={CAMPO}
        />
      </div>
      <div>
        <label htmlFor="de" className="block text-sm font-medium">
          A partir de
        </label>
        <input
          id="de"
          name="de"
          type="date"
          defaultValue={filtros.de}
          className={CAMPO}
        />
      </div>
      <div>
        <label htmlFor="ate" className="block text-sm font-medium">
          Até
        </label>
        <input
          id="ate"
          name="ate"
          type="date"
          defaultValue={filtros.ate}
          className={CAMPO}
        />
      </div>

      <fieldset className="sm:col-span-4">
        <legend className="text-sm font-medium">Status</legend>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {TODOS_OS_STATUS.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="status"
                value={s}
                defaultChecked={filtros.status?.includes(s)}
                className="size-4 accent-vinho"
              />
              <Etiqueta status={s} />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-tinta-suave">
          Nenhum marcado mostra todos.
        </p>
      </fieldset>

      <div className="sm:col-span-4 flex flex-wrap gap-3">
        <button
          type="submit"
          className="rounded-full bg-vinho px-7 py-3 font-medium text-creme transition-colors hover:bg-vinho-escuro"
        >
          Filtrar
        </button>
        <Link
          href="/painel/reservas"
          className="rounded-full border border-borda px-7 py-3 font-medium transition-colors hover:border-vinho/40"
        >
          Limpar
        </Link>
      </div>
    </form>
  );
}
