"use client";

import { useActionState } from "react";

import {
  type EstadoDaRiia,
  assumirAtendimento,
  criarChaveDaRiia,
  revogarChaveDaRiia,
} from "./acoes";

const CAMPO = "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-2.5";
const BOTAO =
  "rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50";

function Recado({ estado }: { estado: EstadoDaRiia }) {
  if (!estado) return null;

  if ("erro" in estado) {
    return (
      <p
        role="alert"
        className="mb-4 rounded-lg border border-vinho/30 bg-vinho/5 px-4 py-3 text-sm text-vinho"
      >
        {estado.erro}
      </p>
    );
  }
  if ("aviso" in estado) {
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

export function NovaChave() {
  const [estado, agir, pendente] = useActionState<EstadoDaRiia, FormData>(
    criarChaveDaRiia,
    null,
  );

  return (
    <>
      {estado && "chaveNova" in estado && (
        <div className="mt-6 rounded-xl border-2 border-dourado bg-dourado/10 px-5 py-5">
          <p className="font-medium">
            Chave de “{estado.nome}” criada. Ela aparece uma vez só.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-tinta-suave">
            O sistema guarda apenas o hash — não há como mostrá-la de novo.
            Copie agora e guarde onde a integração vai lê-la. Perdeu? Crie
            outra e revogue esta.
          </p>
          <code className="mt-4 block overflow-x-auto rounded-lg bg-creme px-4 py-3 font-mono text-sm break-all">
            {estado.chaveNova}
          </code>
        </div>
      )}

      <form action={agir} className="mt-6 grid gap-4 sm:grid-cols-4">
        <Recado estado={estado && "chaveNova" in estado ? null : estado} />

        <div className="sm:col-span-2">
          <label htmlFor="nome" className="block text-sm font-medium">
            Nome da chave
          </label>
          <input
            id="nome"
            name="nome"
            required
            maxLength={60}
            placeholder="DisparaAI"
            className={CAMPO}
          />
        </div>

        <div>
          <label htmlFor="nivel" className="block text-sm font-medium">
            Nível
          </label>
          <select id="nivel" name="nivel" defaultValue="2" className={CAMPO}>
            <option value="1">1 — só consulta</option>
            <option value="2">2 — pode criar pré-reserva</option>
          </select>
        </div>

        <div>
          <label htmlFor="limite" className="block text-sm font-medium">
            Chamadas por minuto
          </label>
          <input
            id="limite"
            name="limite"
            type="number"
            min={1}
            max={10000}
            defaultValue={60}
            className={CAMPO}
          />
        </div>

        <div className="sm:col-span-4">
          <button
            type="submit"
            disabled={pendente}
            className={`${BOTAO} bg-vinho text-creme hover:bg-vinho-escuro`}
          >
            {pendente ? "Criando…" : "Criar chave"}
          </button>
        </div>
      </form>
    </>
  );
}

export function BotaoRevogar({ id, nome }: { id: string; nome: string }) {
  const [estado, agir, pendente] = useActionState<EstadoDaRiia, FormData>(
    revogarChaveDaRiia,
    null,
  );

  return (
    <>
      <Recado estado={estado} />
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-tinta-suave hover:text-vinho">
          Revogar
        </summary>
        <form action={agir} className="mt-3">
          <input type="hidden" name="id" value={id} />
          <p className="mb-3 text-sm leading-relaxed text-tinta-suave">
            A chave “{nome}” para de funcionar na chamada seguinte, e não há
            como voltar atrás. Quem a estiver usando perde o acesso na hora.
          </p>
          <button
            type="submit"
            disabled={pendente}
            className={`${BOTAO} border border-vinho text-vinho hover:bg-vinho/5`}
          >
            {pendente ? "Revogando…" : "Revogar mesmo assim"}
          </button>
        </form>
      </details>
    </>
  );
}

export function BotaoAssumir({ id }: { id: string }) {
  const [estado, agir, pendente] = useActionState<EstadoDaRiia, FormData>(
    assumirAtendimento,
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
          className={`${BOTAO} bg-vinho text-creme hover:bg-vinho-escuro`}
        >
          {pendente ? "Assumindo…" : "Assumir este atendimento"}
        </button>
      </form>
    </>
  );
}
