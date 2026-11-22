"use client";

import { useActionState } from "react";

import { type EstadoDoPedido, solicitarReserva } from "./acoes";

const CAMPO = "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-3";

export function FormularioDePedido({
  entrada,
  saida,
  adultos,
  criancas,
  totalCentavos,
}: {
  entrada: string;
  saida: string;
  adultos: number;
  criancas: number;
  totalCentavos: number;
}) {
  const [estado, acao, enviando] = useActionState<EstadoDoPedido, FormData>(
    solicitarReserva,
    null,
  );

  return (
    <form action={acao} className="mt-6 space-y-4">
      {/* As datas e o valor vão junto, para a recepção ver exatamente o que
          o site mostrou ao visitante. */}
      <input type="hidden" name="entrada" value={entrada} />
      <input type="hidden" name="saida" value={saida} />
      <input type="hidden" name="adultos" value={adultos} />
      <input type="hidden" name="criancas" value={criancas} />
      <input type="hidden" name="totalCentavos" value={totalCentavos} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nome" className="block text-sm font-medium">
            Seu nome
          </label>
          <input id="nome" name="nome" required autoComplete="name" className={CAMPO} />
        </div>
        <div>
          <label htmlFor="telefone" className="block text-sm font-medium">
            WhatsApp
          </label>
          <input
            id="telefone"
            name="telefone"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="(62) 98888-7777"
            className={CAMPO}
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          E-mail <span className="font-normal text-tinta-suave">(opcional)</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor="observacao" className="block text-sm font-medium">
          Alguma observação?{" "}
          <span className="font-normal text-tinta-suave">(opcional)</span>
        </label>
        <textarea id="observacao" name="observacao" rows={3} className={CAMPO} />
      </div>

      {estado?.erro && (
        <p
          role="alert"
          className="rounded-lg border border-vinho/30 bg-vinho/5 px-4 py-3 text-sm text-vinho"
        >
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-full bg-vinho px-7 py-3.5 font-medium text-creme transition-colors hover:bg-vinho-escuro disabled:opacity-60 sm:w-auto"
      >
        {enviando ? "Enviando…" : "Solicitar reserva"}
      </button>

      <p className="text-sm text-tinta-suave">
        O pedido não garante as datas. Vamos conferir a disponibilidade e
        responder pelo WhatsApp com a confirmação e as instruções de pagamento.
      </p>
    </form>
  );
}
