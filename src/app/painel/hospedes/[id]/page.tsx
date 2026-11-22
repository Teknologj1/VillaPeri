import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { withTenant } from "@/db/tenant";
import { env } from "@/env";
import { formatarInstante, formatarNoite } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { exigirSessao } from "@/lib/sessao";
import { apenasDigitos, formatarTelefone } from "@/lib/telefone";
import { podeNoModulo } from "@/modules/autenticacao";
import {
  type StatusReserva,
  buscarHospede,
  listarAcessosAoHospede,
  registrarAcessoDadoPessoal,
} from "@/modules/reservas";

import { Etiqueta } from "../../_componentes/Etiqueta";
import { SemAcesso } from "../../_componentes/SemAcesso";

export const metadata: Metadata = {
  title: "Ficha do hóspede",
  robots: { index: false, follow: false },
};

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-borda px-5 py-3 last:border-0">
      <span className="text-tinta-suave">{rotulo}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

async function Conteudo({
  params,
}: {
  params: PageProps<"/painel/hospedes/[id]">["params"];
}) {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "hospedes", "ver")) {
    return <SemAcesso modulo="hóspedes" />;
  }

  const { id } = await params;

  // Só o Proprietário vê quem andou abrindo as fichas. Para os outros isso é
  // ruído; para ele é a prova de que o controle de acesso está funcionando.
  const veAuditoria = podeNoModulo(sessao, "auditoria", "ver");

  const dados = await withTenant(sessao.anfitriaoId, async (tx) => {
    const ficha = await buscarHospede(tx, id);
    if (!ficha) return null;

    await registrarAcessoDadoPessoal(tx, {
      anfitriaoId: sessao.anfitriaoId,
      hospedeId: id,
      usuarioId: sessao.usuarioId,
      motivo: "abriu a ficha do hóspede",
    });

    return {
      ficha,
      // Lido DEPOIS de registrar, de propósito: a própria abertura aparece na
      // lista, e quem olha vê o registro do que acabou de fazer.
      acessos: veAuditoria ? await listarAcessosAoHospede(tx, id) : [],
    };
  });

  if (!dados) notFound();
  const { ficha, acessos } = dados;
  const h = ficha.hospede;

  return (
    <>
      <h1 className="font-display text-4xl">
        {h.nome}
        {h.recorrente && (
          <span className="ml-3 align-middle rounded-full bg-dourado/25 px-3 py-1 text-sm font-normal text-tinta">
            já voltou
          </span>
        )}
      </h1>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Contato e documento</h2>
        <div className="mt-4 rounded-xl border border-borda bg-creme-fundo">
          <Linha rotulo="WhatsApp">
            {h.telefone ? (
              <a
                href={`https://wa.me/${apenasDigitos(h.telefone)}`}
                className="text-vinho hover:underline"
              >
                {formatarTelefone(h.telefone)}
              </a>
            ) : (
              <span className="text-tinta-suave">não informado</span>
            )}
          </Linha>
          <Linha rotulo="E-mail">
            {h.email ?? <span className="text-tinta-suave">não informado</span>}
          </Linha>
          <Linha rotulo="Documento">
            {h.documento ?? (
              <span className="text-tinta-suave">ainda não informado</span>
            )}
          </Linha>
          <Linha rotulo="Nascimento">
            {h.nascimento ? (
              formatarNoite(h.nascimento)
            ) : (
              <span className="text-tinta-suave">não informado</span>
            )}
          </Linha>
          <Linha rotulo="De onde é">
            {h.cidade ? (
              `${h.cidade}${h.uf ? ` — ${h.uf}` : ""}`
            ) : (
              <span className="text-tinta-suave">não informado</span>
            )}
          </Linha>
        </div>
      </section>

      {(h.preferencias || h.notasInternas) && (
        <section className="mt-10">
          <h2 className="font-display text-2xl">Para lembrar</h2>
          <div className="mt-4 rounded-xl border border-borda bg-creme-fundo">
            {h.preferencias && (
              <Linha rotulo="Preferências">{h.preferencias}</Linha>
            )}
            {h.notasInternas && (
              <Linha rotulo="Nota interna">{h.notasInternas}</Linha>
            )}
          </div>
          {h.notasInternas && (
            <p className="mt-3 text-xs text-tinta-suave">
              A nota interna é só da equipe: nunca sai em resposta de API nem
              aparece para o hóspede.
            </p>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl">Estadias</h2>
        {ficha.reservas.length === 0 ? (
          <p className="mt-3 text-tinta-suave">Nenhuma reserva ainda.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {ficha.reservas.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/painel/reservas/${r.codigo}`}
                  className="block rounded-xl border border-borda bg-creme-fundo px-5 py-4 transition-colors hover:border-vinho/40"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span>
                      {formatarNoite(r.entrada, false)} a{" "}
                      {formatarNoite(r.saida)}
                    </span>
                    <Etiqueta status={r.status as StatusReserva} />
                    <span className="ml-auto font-medium">
                      {formatarReais(r.totalCentavos)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {veAuditoria && (
        <section className="mt-10">
          <h2 className="font-display text-2xl">Quem abriu esta ficha</h2>
          <p className="mt-2 text-sm leading-relaxed text-tinta-suave">
            Exigência da LGPD: cada consulta a dado pessoal fica registrada,
            inclusive a sua, agora.
          </p>
          <ul className="mt-4 divide-y divide-borda overflow-hidden rounded-xl border border-borda text-sm">
            {acessos.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap justify-between gap-x-5 gap-y-1 bg-creme-fundo px-5 py-3"
              >
                <span className="font-mono text-xs text-tinta-suave">
                  {a.usuarioId ?? "sistema"}
                </span>
                <span className="text-tinta-suave">{a.motivo}</span>
                <span className="ml-auto text-tinta-suave">
                  {formatarInstante(a.quando, env.TZ_PROPRIEDADE)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-12">
        <Link href="/painel/hospedes" className="text-vinho hover:underline">
          ← todos os hóspedes
        </Link>
      </p>
    </>
  );
}

function Carregando() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-10 w-64 animate-pulse rounded-lg bg-creme-fundo" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-xl bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function FichaDoHospede(
  props: PageProps<"/painel/hospedes/[id]">,
) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Suspense fallback={<Carregando />}>
        <Conteudo params={props.params} />
      </Suspense>
    </main>
  );
}
