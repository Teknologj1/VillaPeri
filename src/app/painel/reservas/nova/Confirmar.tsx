"use client";

import { useActionState } from "react";

import { type EstadoDaNova, criarNovaReserva } from "./acoes";

const CAMPO = "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-2.5";
const ROTULO = "block text-sm font-medium";

export type Unidade = { id: string; nome: string; livre: boolean };

export type Contexto = {
  tipoId: string;
  entrada: string;
  saida: string;
  adultos: number;
  criancas: number;
  unidades: Unidade[];
  /** O desconto que este perfil concede sozinho, em percentual. */
  limiteDeDesconto: number;
  solicitacaoId?: string;
  prefill?: {
    nome?: string;
    telefone?: string;
    email?: string;
    observacoes?: string;
  };
};

export function Confirmar({ ctx }: { ctx: Contexto }) {
  const [estado, agir, pendente] = useActionState<EstadoDaNova, FormData>(
    criarNovaReserva,
    null,
  );

  const livres = ctx.unidades.filter((u) => u.livre);

  return (
    <form action={agir} className="mt-6">
      <input type="hidden" name="tipoId" value={ctx.tipoId} />
      <input type="hidden" name="entrada" value={ctx.entrada} />
      <input type="hidden" name="saida" value={ctx.saida} />
      <input type="hidden" name="adultos" value={ctx.adultos} />
      <input type="hidden" name="criancas" value={ctx.criancas} />
      {ctx.solicitacaoId && (
        <input type="hidden" name="solicitacaoId" value={ctx.solicitacaoId} />
      )}

      {estado?.erro && (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-vinho/30 bg-vinho/5 px-5 py-4 leading-relaxed text-vinho"
        >
          {estado.erro}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="nome" className={ROTULO}>
            Nome do hóspede
          </label>
          <input
            id="nome"
            name="nome"
            required
            maxLength={120}
            defaultValue={ctx.prefill?.nome}
            className={CAMPO}
          />
        </div>

        <div>
          <label htmlFor="telefone" className={ROTULO}>
            WhatsApp
          </label>
          <input
            id="telefone"
            name="telefone"
            inputMode="tel"
            placeholder="(62) 98888-7777"
            defaultValue={ctx.prefill?.telefone}
            className={CAMPO}
          />
          <p className="mt-1.5 text-xs text-tinta-suave">
            É por ele que o sistema reconhece quem já se hospedou antes.
          </p>
        </div>

        <div>
          <label htmlFor="email" className={ROTULO}>
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={ctx.prefill?.email}
            className={CAMPO}
          />
        </div>

        <div>
          <label htmlFor="documento" className={ROTULO}>
            Documento
            <span className="ml-1 font-normal text-tinta-suave">
              (opcional)
            </span>
          </label>
          <input
            id="documento"
            name="documento"
            maxLength={30}
            className={CAMPO}
          />
          <p className="mt-1.5 text-xs text-tinta-suave">
            Pode ficar para a ficha de registro.
          </p>
        </div>

        <div>
          <label htmlFor="canal" className={ROTULO}>
            Por onde veio
          </label>
          <select
            id="canal"
            name="canal"
            defaultValue={ctx.solicitacaoId ? "site" : "balcao"}
            className={CAMPO}
          >
            <option value="balcao">Balcão ou telefone</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="site">Site</option>
            <option value="riia">RIIA</option>
            <option value="instagram">Instagram</option>
            <option value="indicacao">Indicação</option>
            <option value="airbnb">Airbnb</option>
          </select>
        </div>

        <div>
          <label htmlFor="unidadeId" className={ROTULO}>
            Unidade
          </label>
          <select id="unidadeId" name="unidadeId" required className={CAMPO}>
            {ctx.unidades.map((u) => (
              <option key={u.id} value={u.id} disabled={!u.livre}>
                {u.nome}
                {u.livre ? "" : " — ocupada nestas datas"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="descontoPercentual" className={ROTULO}>
            Desconto (%)
          </label>
          <input
            id="descontoPercentual"
            name="descontoPercentual"
            type="number"
            min={0}
            max={100}
            step="0.5"
            defaultValue={0}
            className={CAMPO}
          />
          <p className="mt-1.5 text-xs text-tinta-suave">
            {ctx.limiteDeDesconto > 0
              ? `Até ${ctx.limiteDeDesconto}% o seu perfil concede sozinho. Acima disso a reserva nasce aguardando aprovação — ela segura a data do mesmo jeito.`
              : "Seu perfil não concede desconto sozinho: qualquer valor aqui faz a reserva nascer aguardando aprovação."}
          </p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="observacoes" className={ROTULO}>
            Observações
            <span className="ml-1 font-normal text-tinta-suave">
              (opcional)
            </span>
          </label>
          <textarea
            id="observacoes"
            name="observacoes"
            rows={3}
            maxLength={500}
            defaultValue={ctx.prefill?.observacoes}
            className={CAMPO}
          />
        </div>
      </div>

      <div className="mt-8">
        <button
          type="submit"
          disabled={pendente || livres.length === 0}
          className="rounded-full bg-vinho px-8 py-3.5 font-medium text-creme transition-colors hover:bg-vinho-escuro disabled:opacity-50"
        >
          {pendente ? "Criando…" : "Criar pré-reserva"}
        </button>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-tinta-suave">
          Nasce como pré-reserva: segura as noites por 24 horas e espera o
          sinal. Confirmar é a próxima decisão, na ficha da reserva.
        </p>
      </div>
    </form>
  );
}
