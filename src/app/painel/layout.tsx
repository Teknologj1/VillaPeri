import Image from "next/image";
import Link from "next/link";

import { CASA } from "@/modules/conteudo";

const LINKS = [
  { href: "/painel", texto: "Início" },
  { href: "/painel/hoje", texto: "Hoje na casa" },
  { href: "/painel/reservas", texto: "Reservas" },
  { href: "/painel/pedidos", texto: "Pedidos" },
  { href: "/painel/hospedes", texto: "Hóspedes" },
  { href: "/painel/simulador", texto: "Tarifas" },
  { href: "/painel/riia", texto: "RIIA" },
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
          {/* Rola na horizontal no celular em vez de quebrar em duas linhas:
              a recepção usa isto em pé, com uma mão. */}
          <nav
            aria-label="Painel"
            className="-mx-1 flex gap-4 overflow-x-auto px-1 text-sm whitespace-nowrap text-tinta-suave"
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
