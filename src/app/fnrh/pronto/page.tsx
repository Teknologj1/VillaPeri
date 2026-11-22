import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { CASA, WHATSAPP } from "@/modules/conteudo";

export const metadata: Metadata = {
  title: "Ficha enviada",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * O fim do caminho do hóspede.
 *
 * Estática de propósito, e FORA do segmento do token: a confirmação já
 * aconteceu quando a action gravou, e repetir a consulta aqui só daria a
 * chance de mostrar um erro depois de ter dado certo.
 *
 * Ficar fora do `[token]` não é detalhe de rota. O token é a credencial do
 * link; deixá-lo na URL da página de sucesso o grava no histórico do
 * navegador e o põe em qualquer captura de tela que o hóspede mande para
 * alguém. Aqui não há nada para vazar.
 *
 * O número do WhatsApp vem da constante do módulo de conteúdo, lida quando o
 * módulo carrega. Ler `process.env` dentro do componente seria dado de
 * requisição, e com Cache Components o Next recusa pré-renderizar a página —
 * com razão: uma página "estática" que muda conforme o ambiente não é
 * estática.
 */
export default function Pronto() {
  return (
    <div className="min-h-screen bg-creme">
      <main className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <Image
          src="/marca/villa-peri.png"
          alt=""
          width={380}
          height={305}
          className="mb-10 h-auto w-32"
        />

        <h1 className="font-display text-4xl">Ficha recebida. Obrigado!</h1>
        <p className="mt-5 max-w-prose leading-relaxed text-tinta-suave">
          Está tudo certo do lado do registro. A recepção confere antes da sua
          chegada e, se faltar alguma coisa, entra em contato.
        </p>
        <p className="mt-4 max-w-prose leading-relaxed text-tinta-suave">
          Precisou corrigir algum dado? É só abrir o mesmo link de novo e
          enviar outra vez.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          {WHATSAPP && (
            <a
              href={`https://wa.me/${WHATSAPP}`}
              className="rounded-full bg-vinho px-7 py-3 font-medium text-creme transition-colors hover:bg-vinho-escuro"
            >
              Falar com a gente
            </a>
          )}
          <Link
            href="/"
            className="rounded-full border border-borda px-7 py-3 font-medium transition-colors hover:border-vinho/40"
          >
            Conhecer a {CASA.nome}
          </Link>
        </div>
      </main>
    </div>
  );
}
