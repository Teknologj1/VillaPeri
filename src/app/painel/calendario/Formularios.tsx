"use client";

import { useActionState } from "react";

import {
  type EstadoDoCalendario,
  fecharDatasNoCalendario,
  reabrirDatas,
} from "./acoes";

const CAMPO = "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-2.5";
const BOTAO =
  "rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50";

function Recado({ estado }: { estado: EstadoDoCalendario }) {
  if (!estado) return null;
  if (estado.erro) {
    return (
      <p
        role="alert"
        className="mb-4 rounded-lg border border-vinho/30 bg-vinho/5 px-4 py-3 text-sm leading-relaxed text-vinho"
      >
        {estado.erro}
      </p>
    );
  }
  if (estado.aviso) {
    return (
      <p
        role="status"
        className="mb-4 rounded-lg border border-mata/30 bg-mata/5 px-4 py-3 text-sm text-mata"
      >
        {estado.aviso}
      </p>
    );
  }
  return null;
}

export function FecharDatas({
  propriedadeId,
  unidades,
  primeiroDia,
}: {
  propriedadeId: string;
  unidades: { id: string; nome: string }[];
  primeiroDia: string;
}) {
  const [estado, agir, pendente] = useActionState<EstadoDoCalendario, FormData>(
    fecharDatasNoCalendario,
    null,
  );

  return (
    <form action={agir} className="mt-6">
      <input type="hidden" name="propriedadeId" value={propriedadeId} />
      <Recado estado={estado} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="primeiraNoite" className="block text-sm font-medium">
            Primeira noite
          </label>
          <input
            id="primeiraNoite"
            name="primeiraNoite"
            type="date"
            required
            defaultValue={primeiroDia}
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="ultimaNoite" className="block text-sm font-medium">
            Última noite
          </label>
          <input
            id="ultimaNoite"
            name="ultimaNoite"
            type="date"
            required
            defaultValue={primeiroDia}
            className={CAMPO}
          />
          {/*
            As DUAS são inclusivas, ao contrário da reserva, onde a saída é o
            dia em que o hóspede vai embora. Fechar "de 10 a 12" tira três
            noites: 10, 11 e 12.
          */}
          <p className="mt-1.5 text-xs text-tinta-suave">
            As duas entram no fechamento. De 10 a 12 são três noites.
          </p>
        </div>

        <div>
          <label htmlFor="motivo" className="block text-sm font-medium">
            Motivo
          </label>
          <select
            id="motivo"
            name="motivo"
            defaultValue="uso_proprietario"
            className={CAMPO}
          >
            <option value="uso_proprietario">Uso do proprietário</option>
            <option value="reforma">Reforma ou manutenção</option>
            <option value="evento_privado">Evento privado</option>
            <option value="fechamento">Fechamento da casa</option>
            <option value="outro">Outro</option>
          </select>
        </div>

        {unidades.length > 1 && (
          <div>
            <label htmlFor="unidadeId" className="block text-sm font-medium">
              Unidade
            </label>
            <select id="unidadeId" name="unidadeId" className={CAMPO}>
              <option value="">A casa inteira</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="observacao" className="block text-sm font-medium">
            Observação
            <span className="ml-1 font-normal text-tinta-suave">(opcional)</span>
          </label>
          <input
            id="observacao"
            name="observacao"
            maxLength={300}
            placeholder="Pintura da varanda, família na casa…"
            className={CAMPO}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pendente}
        className={`${BOTAO} mt-5 bg-vinho text-creme hover:bg-vinho-escuro`}
      >
        {pendente ? "Fechando…" : "Fechar estas datas"}
      </button>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-tinta-suave">
        As noites saem de venda na hora — no site, no simulador e para a RIIA.
        Se já houver reserva no período, o sistema recusa e diz quantas são:
        fechar por cima deixaria o hóspede com data confirmada e sem lugar.
      </p>
    </form>
  );
}

export function BotaoReabrir({ id }: { id: string }) {
  const [estado, agir, pendente] = useActionState<EstadoDoCalendario, FormData>(
    reabrirDatas,
    null,
  );

  return (
    <>
      <Recado estado={estado} />
      <form action={agir}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pendente}
          className={`${BOTAO} border border-borda hover:border-vinho/40`}
        >
          {pendente ? "Reabrindo…" : "Reabrir"}
        </button>
      </form>
    </>
  );
}
