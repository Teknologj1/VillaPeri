import Link from "next/link";

/**
 * O que a pessoa vê quando está autenticada mas o perfil não alcança o módulo.
 *
 * Não é 404 nem erro: a pessoa entrou direito, o perfil é que não dá acesso.
 * Dizer isso com clareza — e nomear o módulo — poupa a conversa de "o sistema
 * está quebrado" e vira um pedido concreto ao proprietário.
 */
export function SemAcesso({ modulo }: { modulo: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <h1 className="font-display text-3xl">Sem acesso a {modulo}</h1>
      <p className="mt-4 leading-relaxed text-tinta-suave">
        Seu perfil não tem permissão neste módulo. Se precisar dele para
        trabalhar, peça ao proprietário — a permissão é cadastro, muda em um
        clique e não depende de alterar o sistema.
      </p>
      <Link
        href="/painel"
        className="mt-8 inline-block rounded-full bg-vinho px-7 py-3 font-medium text-creme transition-colors hover:bg-vinho-escuro"
      >
        Voltar ao painel
      </Link>
    </main>
  );
}
