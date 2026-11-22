import type { Metadata } from "next";
import { Suspense } from "react";

import { withTenant } from "@/db/tenant";
import { env } from "@/env";
import { formatarInstante } from "@/lib/data";
import { exigirSessao } from "@/lib/sessao";
import { formatarTelefone } from "@/lib/telefone";
import { podeNoModulo } from "@/modules/autenticacao";
import { NIVEIS, listarChaves, transferenciasAbertas } from "@/modules/riia";

import { SemAcesso } from "../_componentes/SemAcesso";
import { BotaoAssumir, BotaoRevogar, NovaChave } from "./Formularios";

export const metadata: Metadata = {
  title: "RIIA",
  robots: { index: false, follow: false },
};

async function Conteudo() {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "reservas", "ver")) {
    return <SemAcesso modulo="RIIA" />;
  }

  // Chaves de API são configuração da conta; atendimentos são operação do
  // dia. Quem atende vê a fila sem ver as credenciais.
  const veChaves = podeNoModulo(sessao, "usuarios", "editar");

  const { chaves, fila } = await withTenant(sessao.anfitriaoId, async (tx) => ({
    chaves: veChaves ? await listarChaves(tx) : [],
    fila: await transferenciasAbertas(tx),
  }));

  return (
    <>
      <section className="mt-12">
        <h2 className="font-display text-2xl">
          Atendimentos passados à recepção
          {fila.length > 0 && (
            <span className="ml-2 rounded-full bg-vinho px-3 py-1 align-middle text-sm font-normal text-creme">
              {fila.length}
            </span>
          )}
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-tinta-suave">
          A RIIA transfere quando o pedido sai do que ela pode fazer: desconto
          acima do limite, exceção ao mínimo, reclamação ou qualquer coisa que
          nenhuma ferramenta cobre.
        </p>

        {fila.length === 0 ? (
          <p className="mt-4 rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-tinta-suave">
            Nada esperando. A RIIA está dando conta.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {fila.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-vinho/30 bg-vinho/5 px-5 py-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-medium">
                    {c.nome ?? formatarTelefone(c.telefone)}
                  </span>
                  <a
                    href={`https://wa.me/${c.telefone}`}
                    className="text-sm text-vinho hover:underline"
                  >
                    {formatarTelefone(c.telefone)}
                  </a>
                  <span className="ml-auto text-sm text-tinta-suave">
                    {c.transferidaEm &&
                      formatarInstante(c.transferidaEm, env.TZ_PROPRIEDADE)}
                  </span>
                </div>

                <p className="mt-2 font-medium">{c.motivoTransferencia}</p>
                {c.resumo && (
                  <p className="mt-2 leading-relaxed text-tinta-suave">
                    {c.resumo}
                  </p>
                )}

                <div className="mt-4">
                  <BotaoAssumir id={c.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {veChaves && (
        <section className="mt-16">
          <h2 className="font-display text-2xl">Chaves de API</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-tinta-suave">
            Uma chave por integração. O nível é o teto da conta inteira:
            baixá-lo corta as ferramentas de todas as chaves de uma vez, sem
            precisar mexer em cada uma.
          </p>

          {chaves.length > 0 && (
            <ul className="mt-6 space-y-4">
              {chaves.map((c) => {
                const revogada = Boolean(c.revogadaEm);
                const vencida = c.validaAte && c.validaAte < new Date();
                return (
                  <li
                    key={c.id}
                    className={`rounded-xl border px-5 py-4 ${
                      revogada || vencida
                        ? "border-borda bg-creme-fundo text-tinta-suave"
                        : "border-borda bg-creme-fundo"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="font-medium">{c.nome}</span>
                      <code className="font-mono text-xs text-tinta-suave">
                        vp_{c.prefixo}_…
                      </code>
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          revogada || vencida
                            ? "bg-creme text-tinta-suave"
                            : "bg-mata/10 text-mata"
                        }`}
                      >
                        {revogada ? "revogada" : vencida ? "vencida" : "ativa"}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-tinta-suave">
                      Nível {c.nivelAutonomia} (
                      {NIVEIS[c.nivelAutonomia as 1 | 2 | 3]}) ·{" "}
                      {c.limitePorMinuto} chamadas por minuto · último uso:{" "}
                      {c.ultimoUsoEm
                        ? formatarInstante(c.ultimoUsoEm, env.TZ_PROPRIEDADE)
                        : "nunca"}
                    </p>
                    <p className="mt-1 text-xs text-tinta-suave">
                      {c.escopos.length} ferramentas: {c.escopos.join(", ")}
                    </p>

                    {!revogada && <BotaoRevogar id={c.id} nome={c.nome} />}
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="mt-10 font-display text-xl">Criar uma chave</h3>
          <NovaChave />
        </section>
      )}
    </>
  );
}

function Carregando() {
  return (
    <div className="mt-12 space-y-4" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function Riia() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl">RIIA</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-tinta-suave">
        A secretária de IA atende o WhatsApp por uma API deste sistema. Ela
        propõe; quem decide preço, disponibilidade e regras é o sistema —
        pedir desconto a ela não muda o que a API aceita.
      </p>

      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </main>
  );
}
