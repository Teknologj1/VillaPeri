"use client";

import { useActionState } from "react";

import { ACAO_PARA, type StatusReserva } from "@/modules/reservas/cliente";

import {
  type EstadoDaAcao,
  lancarPagamento,
  mudarStatusDaReserva,
} from "./acoes";

const BOTAO =
  "rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50";
const CAMPO = "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-2.5";

/** O cancelamento é o único destino que destrói trabalho e pede confirmação. */
const DESTRUTIVOS: StatusReserva[] = ["cancelada", "no_show"];

export function BotoesDeStatus({
  codigo,
  destinos,
}: {
  codigo: string;
  destinos: StatusReserva[];
}) {
  const [estado, agir, pendente] = useActionState<EstadoDaAcao, FormData>(
    mudarStatusDaReserva,
    null,
  );

  if (destinos.length === 0) {
    return (
      <p className="mt-4 text-sm text-tinta-suave">
        Esta reserva está num estado final: não há mais para onde ir.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {estado?.erro && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-vinho/30 bg-vinho/5 px-4 py-3 text-sm text-vinho"
        >
          {estado.erro}
        </p>
      )}
      {estado?.aviso && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-dourado bg-dourado/15 px-4 py-3 text-sm text-tinta"
        >
          {estado.aviso}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {destinos
          .filter((d) => !DESTRUTIVOS.includes(d))
          .map((d) => (
            <form key={d} action={agir}>
              <input type="hidden" name="codigo" value={codigo} />
              <input type="hidden" name="para" value={d} />
              <button
                type="submit"
                disabled={pendente}
                className={`${BOTAO} bg-vinho text-creme hover:bg-vinho-escuro`}
              >
                {ACAO_PARA[d]}
              </button>
            </form>
          ))}
      </div>

      {destinos.some((d) => DESTRUTIVOS.includes(d)) && (
        <details className="mt-6 rounded-xl border border-borda bg-creme-fundo px-5 py-4">
          <summary className="cursor-pointer text-sm font-medium">
            Cancelar ou marcar não comparecimento
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-tinta-suave">
            Libera as noites no calendário e, no cancelamento, calcula a
            devolução pela política. Fica atrás deste clique de propósito: é a
            ação que desfaz trabalho, e não deve dividir espaço com o botão de
            check-in.
          </p>

          {destinos
            .filter((d) => DESTRUTIVOS.includes(d))
            .map((d) => (
              <form key={d} action={agir} className="mt-4">
                <input type="hidden" name="codigo" value={codigo} />
                <input type="hidden" name="para" value={d} />
                {d === "cancelada" && (
                  <div className="mb-3">
                    <label
                      htmlFor="motivo"
                      className="block text-sm font-medium"
                    >
                      Motivo
                    </label>
                    <input
                      id="motivo"
                      name="motivo"
                      required
                      maxLength={500}
                      placeholder="Desistência, força maior, data remarcada…"
                      className={CAMPO}
                    />
                  </div>
                )}
                <button
                  type="submit"
                  disabled={pendente}
                  className={`${BOTAO} border border-vinho text-vinho hover:bg-vinho/5`}
                >
                  {ACAO_PARA[d]}
                </button>
              </form>
            ))}
        </details>
      )}
    </div>
  );
}

export function FormularioDePagamento({
  codigo,
  hoje,
  sugestaoCentavos,
  tipoSugerido,
}: {
  codigo: string;
  hoje: string;
  sugestaoCentavos: number;
  tipoSugerido: "sinal" | "saldo";
}) {
  const [estado, agir, pendente] = useActionState<EstadoDaAcao, FormData>(
    lancarPagamento,
    null,
  );

  // O que falta receber, já escrito do jeito que o campo aceita: o lançamento
  // mais comum é exatamente este, e deixar a recepção redigitar o número é
  // convidar o erro de digitação.
  const sugestao =
    sugestaoCentavos > 0
      ? (sugestaoCentavos / 100).toFixed(2).replace(".", ",")
      : "";

  return (
    <form action={agir} className="mt-4 grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="codigo" value={codigo} />

      {estado?.erro && (
        <p
          role="alert"
          className="sm:col-span-2 rounded-lg border border-vinho/30 bg-vinho/5 px-4 py-3 text-sm text-vinho"
        >
          {estado.erro}
        </p>
      )}

      <div>
        <label htmlFor="valor" className="block text-sm font-medium">
          Valor
        </label>
        <input
          id="valor"
          name="valor"
          required
          inputMode="decimal"
          defaultValue={sugestao}
          placeholder="1.234,56"
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor="data" className="block text-sm font-medium">
          Data
        </label>
        <input
          id="data"
          name="data"
          type="date"
          required
          defaultValue={hoje}
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor="tipo" className="block text-sm font-medium">
          Tipo
        </label>
        <select id="tipo" name="tipo" className={CAMPO} defaultValue={tipoSugerido}>
          <option value="sinal">Sinal</option>
          <option value="saldo">Saldo</option>
          <option value="extra">Extra</option>
          <option value="reembolso">Reembolso</option>
        </select>
      </div>

      <div>
        <label htmlFor="metodo" className="block text-sm font-medium">
          Como entrou
        </label>
        <select id="metodo" name="metodo" className={CAMPO} defaultValue="pix">
          <option value="pix">Pix</option>
          <option value="cartao">Cartão</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="transferencia">Transferência</option>
          <option value="outro">Outro</option>
        </select>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="observacao" className="block text-sm font-medium">
          Observação
          <span className="ml-1 font-normal text-tinta-suave">(opcional)</span>
        </label>
        <input
          id="observacao"
          name="observacao"
          maxLength={300}
          className={CAMPO}
        />
      </div>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pendente}
          className={`${BOTAO} bg-vinho text-creme hover:bg-vinho-escuro`}
        >
          {pendente ? "Lançando…" : "Lançar pagamento"}
        </button>
        <p className="mt-2 text-xs text-tinta-suave">
          O reembolso é gravado como valor negativo, para a soma dos
          lançamentos ser a receita real da reserva.
        </p>
      </div>
    </form>
  );
}
