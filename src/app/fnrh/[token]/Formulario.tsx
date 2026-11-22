"use client";

import { useActionState, useState } from "react";

import { type EstadoDaFnrh, enviarFnrh } from "./acoes";

const CAMPO =
  "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-3 text-base";
const ROTULO = "block text-sm font-medium";

export type ValoresIniciais = {
  documento: string | null;
  nascimento: string | null;
  nacionalidade: string | null;
  cidade: string | null;
  uf: string | null;
  motivoViagem: string | null;
  acompanhantes: {
    nome: string;
    documento: string | null;
    nascimento: string | null;
  }[];
};

export function Formulario({
  token,
  valores,
  vagasDeAcompanhante,
}: {
  token: string;
  valores: ValoresIniciais;
  vagasDeAcompanhante: number;
}) {
  const [estado, agir, pendente] = useActionState<EstadoDaFnrh, FormData>(
    enviarFnrh,
    null,
  );

  // Começa com quem já está na ficha, ou uma linha em branco se houver vaga.
  // Linhas vazias são descartadas no servidor, então sobrar uma não atrapalha
  // — e faltar uma obrigaria o hóspede a procurar o botão antes de digitar.
  const [linhas, setLinhas] = useState(() =>
    Math.max(valores.acompanhantes.length, vagasDeAcompanhante > 0 ? 1 : 0),
  );

  return (
    <form action={agir} className="mt-10">
      <input type="hidden" name="token" value={token} />

      {estado?.erro && (
        <p
          role="alert"
          className="mb-8 rounded-xl border border-vinho/30 bg-vinho/5 px-5 py-4 leading-relaxed text-vinho"
        >
          {estado.erro}
        </p>
      )}

      <fieldset>
        <legend className="font-display text-2xl">Seus dados</legend>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="documento" className={ROTULO}>
              Documento (RG, CPF ou passaporte)
            </label>
            <input
              id="documento"
              name="documento"
              required
              maxLength={30}
              defaultValue={valores.documento ?? ""}
              autoComplete="off"
              className={CAMPO}
            />
          </div>

          <div>
            <label htmlFor="nascimento" className={ROTULO}>
              Data de nascimento
            </label>
            <input
              id="nascimento"
              name="nascimento"
              type="date"
              required
              defaultValue={valores.nascimento ?? ""}
              className={CAMPO}
            />
          </div>

          <div>
            <label htmlFor="nacionalidade" className={ROTULO}>
              Nacionalidade
            </label>
            <input
              id="nacionalidade"
              name="nacionalidade"
              required
              maxLength={60}
              defaultValue={valores.nacionalidade ?? "Brasileira"}
              className={CAMPO}
            />
          </div>

          <div>
            <label htmlFor="cidade" className={ROTULO}>
              Cidade onde mora
            </label>
            <input
              id="cidade"
              name="cidade"
              required
              maxLength={80}
              defaultValue={valores.cidade ?? ""}
              autoComplete="address-level2"
              className={CAMPO}
            />
          </div>

          <div>
            <label htmlFor="uf" className={ROTULO}>
              Estado
            </label>
            <input
              id="uf"
              name="uf"
              required
              maxLength={2}
              placeholder="GO"
              defaultValue={valores.uf ?? ""}
              autoComplete="address-level1"
              className={`${CAMPO} uppercase`}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="motivoViagem" className={ROTULO}>
              Motivo da viagem
              <span className="ml-1 font-normal text-tinta-suave">
                (opcional)
              </span>
            </label>
            <input
              id="motivoViagem"
              name="motivoViagem"
              maxLength={120}
              placeholder="Lazer, trabalho, evento…"
              className={CAMPO}
            />
          </div>
        </div>
      </fieldset>

      {vagasDeAcompanhante > 0 && (
        <fieldset className="mt-12">
          <legend className="font-display text-2xl">Quem vem com você</legend>
          <p className="mt-2 leading-relaxed text-tinta-suave">
            A lei pede o registro de todos os hóspedes, inclusive crianças.
            Deixe em branco o que não souber agora.
          </p>

          <div className="mt-6 space-y-6">
            {Array.from({ length: linhas }).map((_, i) => {
              const a = valores.acompanhantes[i];
              return (
                <div
                  key={i}
                  className="grid gap-4 rounded-xl border border-borda bg-creme-fundo p-5 sm:grid-cols-[2fr_1.4fr_1fr]"
                >
                  <div>
                    <label htmlFor={`a-nome-${i}`} className={ROTULO}>
                      Nome completo
                    </label>
                    <input
                      id={`a-nome-${i}`}
                      name="acompanhante_nome"
                      maxLength={120}
                      defaultValue={a?.nome ?? ""}
                      className={CAMPO}
                    />
                  </div>
                  <div>
                    <label htmlFor={`a-doc-${i}`} className={ROTULO}>
                      Documento
                    </label>
                    <input
                      id={`a-doc-${i}`}
                      name="acompanhante_documento"
                      maxLength={30}
                      defaultValue={a?.documento ?? ""}
                      autoComplete="off"
                      className={CAMPO}
                    />
                  </div>
                  <div>
                    <label htmlFor={`a-nasc-${i}`} className={ROTULO}>
                      Nascimento
                    </label>
                    <input
                      id={`a-nasc-${i}`}
                      name="acompanhante_nascimento"
                      type="date"
                      defaultValue={a?.nascimento ?? ""}
                      className={CAMPO}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {linhas < vagasDeAcompanhante && (
            <button
              type="button"
              onClick={() => setLinhas((n) => n + 1)}
              className="mt-5 rounded-full border border-borda px-6 py-2.5 text-sm font-medium transition-colors hover:border-vinho/40"
            >
              Acrescentar mais uma pessoa
            </button>
          )}
        </fieldset>
      )}

      <div className="mt-12">
        <button
          type="submit"
          disabled={pendente}
          className="w-full rounded-full bg-vinho px-8 py-4 font-medium text-creme transition-colors hover:bg-vinho-escuro disabled:opacity-50 sm:w-auto"
        >
          {pendente ? "Enviando…" : "Enviar a ficha"}
        </button>

        <p className="mt-5 max-w-prose text-sm leading-relaxed text-tinta-suave">
          Ao enviar, você autoriza o uso destes dados para o registro de
          hospedagem exigido por lei. Eles ficam só com a pousada, não são
          usados para propaganda e não são repassados a terceiros, salvo
          exigência legal.
        </p>
      </div>
    </form>
  );
}
