import Link from "next/link";

import { CASA } from "@/modules/conteudo";

import { BotaoWhatsApp } from "./BotaoWhatsApp";

const LINKS = [
  { href: "/a-casa", texto: "A casa" },
  { href: "/galeria", texto: "Galeria" },
  { href: "/pirenopolis", texto: "Pirenópolis" },
  { href: "/politicas", texto: "Políticas" },
  { href: "/contato", texto: "Contato" },
];

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-50 border-b border-borda/70 bg-creme/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="shrink-0">
          <span className="font-display text-xl text-tinta sm:text-2xl">
            {CASA.nome}
          </span>
          <span className="sr-only">— página inicial</span>
        </Link>

        {/*
          Sem menu sanfona no celular: são cinco links curtos, que cabem numa
          faixa rolável. Um botão de abrir e fechar aqui só acrescentaria um
          toque antes de cada navegação.
        */}
        {/*
          A máscara esmaece a borda direita no celular, para a faixa de links
          parecer o que é: algo que rola. Sem ela o último item fica cortado no
          meio da palavra e lê como defeito, não como continuação.
        */}
        <nav
          aria-label="Principal"
          className="-mx-4 flex flex-1 gap-5 overflow-x-auto px-4 text-sm text-tinta-suave [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:mx-0 sm:justify-end sm:px-0 sm:text-base sm:[mask-image:none]"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="shrink-0 py-1 transition-colors hover:text-terracota"
            >
              {l.texto}
            </Link>
          ))}
        </nav>

        {/*
          O `hidden` vai no invólucro, e não no botão: o botão já traz
          `inline-flex` nas classes base, e as duas utilidades disputam a mesma
          propriedade `display`. Quem vence é a que aparece por último na folha
          de estilo gerada, não a que aparece por último no atributo — então
          `hidden` no próprio botão não escondia nada, e no celular ele cobria
          os links do menu.
        */}
        <div className="hidden shrink-0 lg:block">
          <BotaoWhatsApp
            mensagem={`Olá! Vi o site da ${CASA.nome} e gostaria de consultar disponibilidade.`}
            className="!px-5 !py-2.5 !text-sm"
          >
            Consultar datas
          </BotaoWhatsApp>
        </div>
      </div>
    </header>
  );
}
