import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { withTenant } from "@/db/tenant";
import { formatarNoite } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { exigirSessao } from "@/lib/sessao";
import { formatarTelefone } from "@/lib/telefone";
import { podeNoModulo } from "@/modules/autenticacao";
import { listarSolicitacoes } from "@/modules/reservas";

import { SemAcesso } from "../_componentes/SemAcesso";

export const metadata: Metadata = {
  title: "Pedidos do site",
  robots: { index: false, follow: false },
};

const ROTULO_ORIGEM: Record<string, string> = {
  site: "site",
  riia: "RIIA",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  indicacao: "indicação",
  balcao: "balcão",
};

async function Conteudo() {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "reservas", "ver")) {
    return <SemAcesso modulo="reservas" />;
  }

  const pedidos = await withTenant(sessao.anfitriaoId, (tx) =>
    listarSolicitacoes(tx),
  );

  if (pedidos.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-tinta-suave">
        Nenhum pedido esperando resposta.
      </p>
    );
  }

  const podeCriar = podeNoModulo(sessao, "reservas", "lancar");

  return (
    <ul className="mt-8 space-y-4">
      {pedidos.map((p) => {
        const parametros = new URLSearchParams({
          entrada: p.entrada,
          saida: p.saida,
          adultos: String(p.adultos),
          criancas: String(p.criancas),
          solicitacao: p.id,
        });

        return (
          <li
            key={p.id}
            className="rounded-xl border border-borda bg-creme-fundo px-5 py-4"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="font-medium">{p.nome}</span>
              <span className="rounded-full bg-dourado/25 px-3 py-1 text-xs">
                por {ROTULO_ORIGEM[p.origem] ?? p.origem}
              </span>
              <span className="ml-auto font-mono text-xs text-tinta-suave">
                {p.codigo}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-tinta-suave">
              <span>
                {formatarNoite(p.entrada, false)} a {formatarNoite(p.saida)}
              </span>
              <span>
                {p.adultos + p.criancas}{" "}
                {p.adultos + p.criancas === 1 ? "pessoa" : "pessoas"}
              </span>
              {p.totalCotadoCentavos !== null && (
                <span>cotado em {formatarReais(p.totalCotadoCentavos)}</span>
              )}
            </div>

            {p.observacao && (
              <p className="mt-3 leading-relaxed">“{p.observacao}”</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {p.telefone && (
                <a
                  href={`https://wa.me/${p.telefone.replace(/\D/g, "")}`}
                  className="rounded-full border border-borda px-5 py-2 text-sm font-medium transition-colors hover:border-vinho/40"
                >
                  WhatsApp {formatarTelefone(p.telefone)}
                </a>
              )}
              {podeCriar && (
                <Link
                  href={`/painel/reservas/nova?${parametros}`}
                  className="rounded-full bg-vinho px-5 py-2 text-sm font-medium text-creme transition-colors hover:bg-vinho-escuro"
                >
                  Criar reserva
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Carregando() {
  return (
    <div className="mt-8 space-y-4" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-xl bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function Pedidos() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl">Pedidos do site</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-tinta-suave">
        Um pedido NÃO segura as noites — foi decisão da especificação, para que
        um formulário aberto não trave o calendário. Confira a data e crie a
        reserva, que aí sim segura.
      </p>

      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </main>
  );
}
