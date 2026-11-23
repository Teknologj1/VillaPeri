import Link from "next/link";

/**
 * O que a pessoa vê quando está autenticada mas o perfil não alcança o módulo.
 *
 * Não é 404 nem erro: a pessoa entrou direito, o perfil é que não dá acesso.
 * Dizer isso com clareza — e nomear o módulo — poupa a conversa de "o sistema
 * está quebrado" e vira um pedido concreto ao proprietário.
 *
 * É uma `section` com `h2`, e não uma `main` com `h1`: todos os onze lugares
 * que usam isto já estão DENTRO da `main` da própria página. Com `main` aqui o
 * HTML ficava com duas marcas de conteúdo principal, uma dentro da outra, e
 * com dois `h1` — leitor de tela anuncia duas vezes e a ordem de títulos
 * quebra. Descobri pelo navegador, num seletor que casou com duas `main`; nem
 * o build nem o lint apontam isso.
 */
export function SemAcesso({ modulo }: { modulo: string }) {
  return (
    <section className="mt-12 max-w-2xl">
      <h2 className="font-display text-2xl">Sem acesso a {modulo}</h2>
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
    </section>
  );
}
