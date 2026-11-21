import Image from "next/image";
import Link from "next/link";

import { CASA } from "@/modules/conteudo";

const LINKS = [
  { href: "/painel", texto: "Início" },
  { href: "/painel/simulador", texto: "Simulador de tarifa" },
];

export default function LayoutDoPainel({ children }: LayoutProps<"/painel">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-borda bg-creme-fundo">
        <div className="mx-auto flex max-w-5xl items-center gap-5 px-4 py-3 sm:px-6">
          <Link href="/painel" className="flex shrink-0 items-center gap-2">
            <Image
              src="/marca/villa-peri-selo.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <span className="font-display text-lg text-vinho">{CASA.nome}</span>
          </Link>
          <nav
            aria-label="Painel"
            className="flex gap-4 text-sm text-tinta-suave"
          >
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-vinho">
                {l.texto}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
