import type { Metadata } from "next";
import { Suspense } from "react";

import { exigirSessao } from "@/lib/sessao";
import { type Modulo, type Nivel } from "@/modules/anfitriao";
import { nivelEm } from "@/modules/autenticacao";

export const metadata: Metadata = {
  title: "Painel",
  robots: { index: false, follow: false },
};

const ROTULO: Record<Modulo, string> = {
  calendario: "Calendário e datas fechadas",
  tarifas: "Tarifas, feriados e mínimo de diárias",
  reservas: "Reservas",
  hospedes: "Hóspedes e documentos",
  checkin: "Check-in e check-out",
  limpeza: "Limpeza e tarefas de quarto",
  enxoval: "Enxoval",
  despesas: "Despesas",
  relatorios: "Relatórios financeiros",
  usuarios: "Usuários, perfis e configurações",
  auditoria: "Auditoria",
};

const COR: Record<Nivel, string> = {
  editar: "bg-mata/10 text-mata",
  lancar: "bg-vinho/10 text-vinho",
  ver: "bg-dourado/25 text-tinta",
  nenhum: "bg-creme-fundo text-tinta-suave",
};

const TEXTO: Record<Nivel, string> = {
  editar: "editar",
  lancar: "lançar",
  ver: "ver",
  nenhum: "sem acesso",
};

/**
 * A parte autenticada.
 *
 * Fica atrás de um `<Suspense>` porque, com Cache Components, ler a sessão é
 * dado de requisição e não cabe no shell estático. O título acima é
 * pré-renderizado e isto chega em seguida, por streaming.
 */
async function ConteudoDoPainel() {
  const sessao = await exigirSessao();
  const modulos = Object.keys(ROTULO) as Modulo[];

  return (
    <>
      <p className="mt-3 text-tinta-suave">
        {sessao.nome} · perfil{" "}
        <strong className="font-medium text-tinta">{sessao.perfil.nome}</strong>
      </p>

      {sessao.precisaAtivarDoisFatores && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-vinho/30 bg-vinho/5 px-5 py-4 text-sm leading-relaxed text-vinho"
        >
          <strong className="font-semibold">
            Verificação em dois passos pendente.
          </strong>{" "}
          Este perfil exige dois fatores, e a sua conta ainda não os tem
          ativados. A tela de ativação entra na próxima etapa; até lá, o acesso
          segue liberado.
        </p>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl">O que este perfil pode</h2>
        <p className="mt-2 text-sm text-tinta-suave">
          Vem da matriz de permissões, que é dado e não código: criar um perfil
          novo é cadastrar permissões por módulo.
        </p>

        <ul className="mt-6 divide-y divide-borda overflow-hidden rounded-xl border border-borda">
          {modulos.map((m) => {
            const nivel = nivelEm(sessao, m);
            return (
              <li
                key={m}
                className="flex items-center justify-between gap-4 bg-creme-fundo px-5 py-3"
              >
                <span className="text-tinta-suave">{ROTULO[m]}</span>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-sm ${COR[nivel]}`}
                >
                  {TEXTO[nivel]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-10 text-sm text-tinta-suave">
        As telas de calendário, tarifas e reservas entram nas próximas etapas.
        Esta página existe para provar que o login, o isolamento por anfitrião e
        a matriz de permissões funcionam de ponta a ponta.
      </p>
    </>
  );
}

function Carregando() {
  return (
    <div className="mt-10 space-y-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-lg bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function Painel() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl">Painel</h1>
      <Suspense fallback={<Carregando />}>
        <ConteudoDoPainel />
      </Suspense>
    </main>
  );
}
