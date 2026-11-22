import Image from "next/image";
import Link from "next/link";

import { CASA } from "@/modules/conteudo";


const LINKS = [
  { href: "/a-casa", texto: "A casa" },
  { href: "/galeria", texto: "Galeria" },
  { href: "/pirenopolis", texto: "Pirenópolis" },
  { href: "/politicas", texto: "Políticas" },
  { href: "/reservar", texto: "Reservar" },
  { href: "/contato", texto: "Contato" },
];

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-50 border-b border-borda/70 bg-creme/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          {/*
            O selo inteiro num cabeçalho de 56px deixaria o "VILLA PERI"
            ilegível. Então entra o motivo da logo — as buganvílias sobre o
            telhado — ao lado do nome em tipo de display, que é o que de fato
            se lê nesse tamanho. O selo completo aparece no rodapé, onde há
            espaço para ele ser lido.
          */}
          <Image
            src="/marca/villa-peri-selo.png"
            alt=""
            width={44}
            height={44}
            priority
            className="h-10 w-10 rounded-full sm:h-11 sm:w-11"
          />
          <span className="font-display text-xl text-vinho sm:text-2xl">
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
              className="shrink-0 py-1 transition-colors hover:text-vinho"
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
        {/*
          Leva à cotação do próprio site, e não direto ao WhatsApp: o
          visitante vê disponibilidade e preço antes de falar com alguém, e o
          pedido que sai dali chega ao sistema com data, valor e código.
        */}
        <div className="hidden shrink-0 lg:block">
          <Link
            href="/reservar"
            className="inline-flex items-center justify-center rounded-full bg-vinho px-5 py-2.5 text-sm font-medium text-creme transition-colors hover:bg-vinho-escuro"
          >
            Consultar datas
          </Link>
        </div>
      </div>
    </header>
  );
}
