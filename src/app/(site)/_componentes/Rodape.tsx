import Link from "next/link";

import { CASA } from "@/modules/conteudo";

/**
 * Calculado uma vez, quando o módulo carrega — ou seja, durante o build.
 *
 * Não pode ser `new Date()` dentro do componente: com Cache Components, o
 * Next 16 recusa valores instáveis no render de páginas pré-renderizadas, e
 * com razão — uma página gerada uma vez carregaria para sempre o ano em que
 * foi gerada, fingindo ser dinâmica. Aqui a intenção é justamente essa: o ano
 * do build, que se atualiza a cada publicação.
 */
const ANO_DO_BUILD = new Date().getFullYear();

export function Rodape() {
  return (
    <footer className="mt-24 border-t border-borda bg-creme-fundo">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
        <div>
          <p className="font-display text-xl text-tinta">{CASA.nome}</p>
          <p className="mt-2 text-sm leading-relaxed text-tinta-suave">
            {CASA.bairro}
            <br />
            {CASA.cidade} — {CASA.uf}
          </p>
        </div>

        <nav aria-label="Rodapé" className="text-sm">
          <p className="font-medium text-tinta">Navegar</p>
          <ul className="mt-3 space-y-2 text-tinta-suave">
            <li><Link href="/a-casa" className="hover:text-terracota">A casa</Link></li>
            <li><Link href="/galeria" className="hover:text-terracota">Galeria</Link></li>
            <li><Link href="/pirenopolis" className="hover:text-terracota">Pirenópolis</Link></li>
            <li><Link href="/politicas" className="hover:text-terracota">Políticas e regras</Link></li>
            <li><Link href="/contato" className="hover:text-terracota">Contato</Link></li>
          </ul>
        </nav>

        <div className="text-sm text-tinta-suave">
          <p className="font-medium text-tinta">Reservas</p>
          <p className="mt-3 leading-relaxed">
            A casa é locada inteira e exclusiva para uma única reserva. Fale com
            a gente para consultar datas e valores.
          </p>
        </div>
      </div>

      <div className="border-t border-borda">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-tinta-suave sm:px-6">
          © {ANO_DO_BUILD} {CASA.nome}. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
