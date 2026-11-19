import Link from "next/link";

import { linkWhatsApp } from "@/modules/conteudo";

type Props = {
  mensagem: string;
  children: React.ReactNode;
  variante?: "primario" | "secundario";
  className?: string;
};

/**
 * Leva a conversa ao WhatsApp com a mensagem pronta.
 *
 * Sem número configurado (`NEXT_PUBLIC_WHATSAPP`), cai na página de contato em
 * vez de virar um link quebrado: o site precisa publicar antes de o número
 * existir, e um botão que não leva a lugar nenhum é pior que um desvio.
 */
export function BotaoWhatsApp({
  mensagem,
  children,
  variante = "primario",
  className = "",
}: Props) {
  const href = linkWhatsApp(mensagem) ?? "/contato";
  const externo = href.startsWith("http");

  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-medium transition-colors";
  const estilo =
    variante === "primario"
      ? "bg-vinho text-creme hover:bg-vinho-escuro"
      : "border border-borda bg-creme text-tinta hover:bg-creme-fundo";

  return (
    <Link
      href={href}
      className={`${base} ${estilo} ${className}`}
      {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </Link>
  );
}
