import type { Metadata } from "next";
import { Suspense } from "react";

import { withTenant } from "@/db/tenant";
import { env } from "@/env";
import { formatarInstante } from "@/lib/data";
import { exigirSessao } from "@/lib/sessao";
import { listarPerfis } from "@/modules/anfitriao";
import { listarAcessos, podeNoModulo } from "@/modules/autenticacao";

import { SemAcesso } from "../_componentes/SemAcesso";
import {
  LigarDesligar,
  NovaSenha,
  NovoAcesso,
  TrocarPerfil,
} from "./Formularios";

export const metadata: Metadata = {
  title: "Usuários",
  robots: { index: false, follow: false },
};

async function Conteudo() {
  const sessao = await exigirSessao();
  // Ver quem tem acesso já é informação sensível: a lista de e-mails da equipe
  // e quem pode o quê. Pela matriz, `usuarios` só é diferente de "nenhum" no
  // perfil Proprietário.
  if (!podeNoModulo(sessao, "usuarios", "ver")) {
    return <SemAcesso modulo="usuários" />;
  }

  const podeEditar = podeNoModulo(sessao, "usuarios", "editar");

  const { acessos, perfis } = await withTenant(sessao.anfitriaoId, async (tx) => ({
    acessos: await listarAcessos(tx),
    perfis: await listarPerfis(tx),
  }));

  const paraEscolher = perfis.map((p) => ({
    id: p.id,
    nome: p.nome,
    exigeDoisFatores: p.exigeDoisFatores,
  }));

  const ativos = acessos.filter((a) => a.ativo);
  const desativados = acessos.filter((a) => !a.ativo);

  return (
    <>
      {podeEditar && (
        <section className="mt-12">
          <h2 className="font-display text-2xl">Dar acesso a alguém</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-tinta-suave">
            A senha é sorteada aqui e aparece uma vez. Não há cadastro aberto
            nem “esqueci minha senha” por e-mail: quem entra no painel entra
            porque o proprietário criou o acesso.
          </p>
          <NovoAcesso perfis={paraEscolher} />
        </section>
      )}

      <section className="mt-16">
        <h2 className="font-display text-2xl">
          Quem entra no painel
          <span className="ml-2 align-middle text-base font-normal text-tinta-suave">
            {ativos.length}
          </span>
        </h2>

        <ul className="mt-6 space-y-5">
          {ativos.map((a) => {
            const ehVoce = a.usuarioId === sessao.usuarioId;
            return (
              <li
                key={a.membroId}
                className="rounded-xl border border-borda bg-creme-fundo px-5 py-5"
              >
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-medium">{a.nome}</span>
                  {ehVoce && (
                    <span className="rounded-full bg-vinho/10 px-2.5 py-0.5 text-xs text-vinho">
                      você
                    </span>
                  )}
                  <span className="font-mono text-sm text-tinta-suave">
                    {a.email}
                  </span>
                  <span className="ml-auto text-sm text-tinta-suave">
                    {a.perfilNome}
                  </span>
                </div>

                {a.exigeDoisFatores && !a.doisFatoresAtivos && (
                  // O perfil exige dois passos e a pessoa ainda não ativou. O
                  // painel avisa em vez de bloquear: bloquear sem oferecer a
                  // tela de ativação trancaria o proprietário para fora.
                  <p className="mt-3 rounded-lg border border-dourado/40 bg-dourado/10 px-4 py-2.5 text-sm">
                    O perfil {a.perfilNome} exige verificação em dois passos, e
                    ela ainda não está ativada nesta conta.
                  </p>
                )}

                <p className="mt-3 text-xs text-tinta-suave">
                  Acesso criado em{" "}
                  {formatarInstante(a.criadoEm, env.TZ_PROPRIEDADE)}
                </p>

                {podeEditar && (
                  <div className="mt-4 space-y-3 border-t border-borda pt-4">
                    <TrocarPerfil
                      membroId={a.membroId}
                      perfilId={a.perfilId}
                      perfis={paraEscolher}
                      ehVoce={ehVoce}
                    />
                    <NovaSenha membroId={a.membroId} nome={a.nome} />
                    <LigarDesligar
                      membroId={a.membroId}
                      nome={a.nome}
                      ativo
                      ehVoce={ehVoce}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {desativados.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-2xl">Acessos desativados</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-tinta-suave">
            Ficam aqui, e não apagados: a auditoria e as reservas lançadas por
            essas pessoas continuam apontando para elas. Apagar a linha deixaria
            o histórico falando de alguém que não existe mais.
          </p>
          <ul className="mt-6 space-y-4">
            {desativados.map((a) => (
              <li
                key={a.membroId}
                className="rounded-xl border border-borda px-5 py-4 opacity-75"
              >
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-medium">{a.nome}</span>
                  <span className="font-mono text-sm text-tinta-suave">
                    {a.email}
                  </span>
                  <span className="ml-auto text-sm text-tinta-suave">
                    era {a.perfilNome}
                  </span>
                </div>
                {podeEditar && (
                  <LigarDesligar
                    membroId={a.membroId}
                    nome={a.nome}
                    ativo={false}
                    ehVoce={a.usuarioId === sessao.usuarioId}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-16">
        <h2 className="font-display text-2xl">Os perfis</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-tinta-suave">
          O que cada perfil pode é cadastro, não código — criar um perfil novo
          (Manutenção, por exemplo) é cadastrar permissões por módulo. A tela de
          edição da matriz ainda não existe; os cinco perfis vêm da
          especificação.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {perfis.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-borda px-5 py-4 text-sm"
            >
              <p className="font-medium">{p.nome}</p>
              <p className="mt-1 text-tinta-suave">
                Desconto até {p.descontoMaximoPontosBase / 100}% sem aprovação
                {p.exigeDoisFatores && " · exige verificação em dois passos"}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Carregando() {
  return (
    <div className="mt-12 space-y-5" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function Usuarios() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl">Usuários</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-tinta-suave">
        Quem entra no painel, com qual perfil. É daqui que sai o acesso de cada
        pessoa da casa — e cada mudança fica na auditoria, com autor e data.
      </p>

      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </main>
  );
}
