"use client";

import { useActionState } from "react";

import {
  type EstadoDosUsuarios,
  criarAcesso,
  mudarAtivo,
  novaSenha,
  trocarPerfil,
} from "./acoes";

const CAMPO = "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-2.5";
const BOTAO =
  "rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50";

export type PerfilParaEscolher = {
  id: string;
  nome: string;
  exigeDoisFatores: boolean;
};

function Recado({ estado }: { estado: EstadoDosUsuarios }) {
  if (!estado || "senhaNova" in estado) return null;

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
  return (
    <p
      role="status"
      className="mb-4 rounded-lg border border-mata/30 bg-mata/5 px-4 py-3 text-sm text-mata"
    >
      {estado.aviso}
    </p>
  );
}

/**
 * A senha, mostrada uma vez.
 *
 * Fica no estado do formulário e não numa página nova de propósito: o sistema
 * guarda só o hash, então recarregar perde a senha — e recarregar é o que
 * acontece ao navegar. Quem criou dita a senha e a pessoa troca depois.
 */
function SenhaUmaVez({ estado }: { estado: EstadoDosUsuarios }) {
  if (!estado || !("senhaNova" in estado)) return null;

  return (
    <div className="mt-6 rounded-xl border-2 border-dourado bg-dourado/10 px-5 py-5">
      <p className="font-medium">
        {estado.novo
          ? `Acesso de ${estado.nome} criado.`
          : `Senha nova para ${estado.nome}.`}{" "}
        Ela aparece uma vez só.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-tinta-suave">
        Passe estes dois dados à pessoa por um canal direto — e não por aqui.
        O sistema guarda apenas o hash da senha: não há como mostrá-la de novo.
        Se perder, sorteie outra.
      </p>
      <dl className="mt-4 space-y-2">
        <div>
          <dt className="text-xs tracking-wide text-tinta-suave uppercase">
            E-mail
          </dt>
          <dd className="font-mono text-sm break-all">{estado.email}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-tinta-suave uppercase">
            Senha
          </dt>
          <dd>
            <code className="mt-1 block overflow-x-auto rounded-lg bg-creme px-4 py-3 font-mono text-sm break-all">
              {estado.senhaNova}
            </code>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function NovoAcesso({ perfis }: { perfis: PerfilParaEscolher[] }) {
  const [estado, agir, pendente] = useActionState<EstadoDosUsuarios, FormData>(
    criarAcesso,
    null,
  );

  const recepcao = perfis.find((p) => p.nome === "Recepção") ?? perfis[0];

  return (
    <>
      <SenhaUmaVez estado={estado} />

      <form action={agir} className="mt-6 grid gap-4 sm:grid-cols-6">
        <div className="sm:col-span-6">
          <Recado estado={estado} />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="nome" className="block text-sm font-medium">
            Nome
          </label>
          <input
            id="nome"
            name="nome"
            required
            maxLength={80}
            autoComplete="off"
            placeholder="Ana Pereira"
            className={CAMPO}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="email" className="block text-sm font-medium">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="ana@exemplo.com"
            className={CAMPO}
          />
          <p className="mt-1 text-xs text-tinta-suave">É com ele que se entra.</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="perfilId" className="block text-sm font-medium">
            Perfil
          </label>
          <select
            id="perfilId"
            name="perfilId"
            defaultValue={recepcao?.id}
            className={CAMPO}
          >
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.exigeDoisFatores ? " (exige dois passos)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-6">
          <button
            type="submit"
            disabled={pendente}
            className={`${BOTAO} bg-vinho text-creme hover:bg-vinho-escuro`}
          >
            {pendente ? "Criando…" : "Criar acesso"}
          </button>
        </div>
      </form>
    </>
  );
}

export function TrocarPerfil({
  membroId,
  perfilId,
  perfis,
  ehVoce,
}: {
  membroId: string;
  perfilId: string;
  perfis: PerfilParaEscolher[];
  ehVoce: boolean;
}) {
  const [estado, agir, pendente] = useActionState<EstadoDosUsuarios, FormData>(
    trocarPerfil,
    null,
  );

  if (ehVoce) {
    return (
      <p className="text-sm text-tinta-suave">
        Seu próprio perfil não muda daqui — perder esta tela trancaria a casa
        por fora.
      </p>
    );
  }

  return (
    <>
      <Recado estado={estado} />
      <form action={agir} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="membroId" value={membroId} />
        <div>
          <label
            htmlFor={`perfil-${membroId}`}
            className="block text-xs tracking-wide text-tinta-suave uppercase"
          >
            Perfil
          </label>
          <select
            id={`perfil-${membroId}`}
            name="perfilId"
            defaultValue={perfilId}
            className="mt-1 rounded-lg border border-borda bg-creme px-3 py-2 text-sm"
          >
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pendente}
          className={`${BOTAO} border border-vinho text-vinho hover:bg-vinho/5`}
        >
          {pendente ? "Trocando…" : "Trocar"}
        </button>
      </form>
    </>
  );
}

export function NovaSenha({
  membroId,
  nome,
}: {
  membroId: string;
  nome: string;
}) {
  const [estado, agir, pendente] = useActionState<EstadoDosUsuarios, FormData>(
    novaSenha,
    null,
  );

  return (
    <>
      <SenhaUmaVez estado={estado} />
      <Recado estado={estado} />
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-tinta-suave hover:text-vinho">
          Sortear senha nova
        </summary>
        <form action={agir} className="mt-3">
          <input type="hidden" name="membroId" value={membroId} />
          <input type="hidden" name="nome" value={nome} />
          <p className="mb-3 max-w-prose text-sm leading-relaxed text-tinta-suave">
            A senha atual de {nome} para de servir na hora, e as sessões abertas
            caem. Use quando a pessoa esquecer a senha ou quando houver suspeita
            de que ela vazou.
          </p>
          <button
            type="submit"
            disabled={pendente}
            className={`${BOTAO} border border-vinho text-vinho hover:bg-vinho/5`}
          >
            {pendente ? "Sorteando…" : "Sortear"}
          </button>
        </form>
      </details>
    </>
  );
}

export function LigarDesligar({
  membroId,
  nome,
  ativo,
  ehVoce,
}: {
  membroId: string;
  nome: string;
  ativo: boolean;
  ehVoce: boolean;
}) {
  const [estado, agir, pendente] = useActionState<EstadoDosUsuarios, FormData>(
    mudarAtivo,
    null,
  );

  if (ehVoce && ativo) {
    return (
      <p className="text-sm text-tinta-suave">
        Você não desativa o seu próprio acesso.
      </p>
    );
  }

  if (ativo) {
    return (
      <>
        <Recado estado={estado} />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-tinta-suave hover:text-vinho">
            Desativar acesso
          </summary>
          <form action={agir} className="mt-3">
            <input type="hidden" name="membroId" value={membroId} />
            <input type="hidden" name="ativo" value="nao" />
            <p className="mb-3 max-w-prose text-sm leading-relaxed text-tinta-suave">
              {nome} deixa de entrar imediatamente, e as sessões abertas caem. O
              histórico fica: as reservas e os lançamentos dela continuam
              apontando para ela. Dá para reativar depois.
            </p>
            <button
              type="submit"
              disabled={pendente}
              className={`${BOTAO} border border-vinho text-vinho hover:bg-vinho/5`}
            >
              {pendente ? "Desativando…" : "Desativar mesmo assim"}
            </button>
          </form>
        </details>
      </>
    );
  }

  return (
    <>
      <Recado estado={estado} />
      <form action={agir} className="mt-3">
        <input type="hidden" name="membroId" value={membroId} />
        <input type="hidden" name="ativo" value="sim" />
        <button
          type="submit"
          disabled={pendente}
          className={`${BOTAO} bg-vinho text-creme hover:bg-vinho-escuro`}
        >
          {pendente ? "Reativando…" : "Reativar acesso"}
        </button>
      </form>
    </>
  );
}
