import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";

import { connection } from "next/server";

import { withTenant } from "@/db/tenant";
import { anfitriaoPorTokenFnrh } from "@/lib/anfitriao-publico";
import { formatarPeriodo } from "@/lib/data";
import { fichaPorToken } from "@/modules/reservas";

import { Formulario } from "./Formulario";

export const metadata: Metadata = {
  title: "Ficha de registro de hóspedes",
  // Nunca indexada: a URL contém o token, e um link de ficha num buscador é
  // o dado pessoal de um hóspede à disposição de qualquer um.
  robots: { index: false, follow: false, nocache: true },
};

function Aviso({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-borda bg-creme-fundo px-7 py-8">
      <h1 className="font-display text-3xl">{titulo}</h1>
      <p className="mt-4 max-w-prose leading-relaxed text-tinta-suave">
        {children}
      </p>
    </div>
  );
}

async function Conteudo({
  params,
}: {
  params: PageProps<"/fnrh/[token]">["params"];
}) {
  const { token } = await params;

  /*
    Mesma razão do /reservar: a validade do link é comparada com o relógio
    (`fnrhExpiraEm > now()`), e ler o relógio numa rota pré-renderizada exige
    `connection()` antes, com o Suspense que já existe. Sem isto a página
    responde 200, manda o shell e não fecha a conexão — foi o que aconteceu no
    /reservar em produção.

    Aqui ainda não tinha aparecido porque não há link de ficha emitido: com
    token inválido a função devolve null e a página nunca chega ao relógio.
  */
  await connection();

  const anfitriaoId = await anfitriaoPorTokenFnrh(token);
  const ficha = anfitriaoId
    ? await withTenant(anfitriaoId, (tx) => fichaPorToken(tx, token))
    : null;

  if (!ficha) {
    // Uma mensagem só para link errado, vencido e reserva cancelada. Dizer
    // qual dos três é confirmaria a quem está tentando adivinhar tokens que
    // algum deles existiu — e para o hóspede de verdade o caminho é o mesmo:
    // falar com a casa.
    return (
      <Aviso titulo="Este link não vale mais">
        Pode ter vencido ou a reserva pode ter mudado. Fale com a gente no
        WhatsApp e mandamos um novo — leva um minuto.
      </Aviso>
    );
  }

  const totalDePessoas = ficha.adultos + ficha.criancas;

  return (
    <>
      <p className="text-sm tracking-wide text-tinta-suave uppercase">
        {ficha.nomeDaCasa}
      </p>
      <h1 className="mt-2 font-display text-4xl">Ficha de registro</h1>
      <p className="mt-4 max-w-prose leading-relaxed text-tinta-suave">
        Olá, {ficha.titular.nome.split(" ")[0]}! Esta ficha é exigida por lei
        de todo meio de hospedagem no Brasil, e desde abril de 2026 é feita em
        formato digital. Leva dois minutos.
      </p>

      <dl className="mt-8 grid gap-x-8 gap-y-3 rounded-xl border border-borda bg-creme-fundo px-6 py-5 sm:grid-cols-2">
        <div className="flex justify-between gap-4 sm:block">
          <dt className="text-sm text-tinta-suave">Sua estadia</dt>
          <dd className="sm:mt-1">
            {formatarPeriodo(ficha.entrada, ficha.saida)}
          </dd>
        </div>
        <div className="flex justify-between gap-4 sm:block">
          <dt className="text-sm text-tinta-suave">Reserva</dt>
          <dd className="font-mono sm:mt-1">{ficha.codigo}</dd>
        </div>
      </dl>

      {ficha.status === "conferida" && (
        <p className="mt-8 rounded-xl border border-mata/30 bg-mata/5 px-5 py-4 leading-relaxed text-mata">
          Sua ficha já foi conferida pela recepção. Se algum dado mudou, pode
          corrigir aqui mesmo e enviar de novo.
        </p>
      )}

      <Formulario
        token={token}
        valores={{
          documento: ficha.titular.documento,
          nascimento: ficha.titular.nascimento,
          nacionalidade: ficha.titular.nacionalidade,
          cidade: ficha.titular.cidade,
          uf: ficha.titular.uf,
          motivoViagem: ficha.titular.motivoViagem,
          acompanhantes: ficha.acompanhantes,
        }}
        // O titular já está na ficha; as vagas são para o resto do grupo.
        vagasDeAcompanhante={Math.max(totalDePessoas - 1, 0)}
      />
    </>
  );
}

function Carregando() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="h-10 w-72 animate-pulse rounded-lg bg-creme-fundo" />
      <div className="h-24 animate-pulse rounded-xl bg-creme-fundo" />
      <div className="h-64 animate-pulse rounded-xl bg-creme-fundo" />
    </div>
  );
}

export default function PaginaDaFnrh(props: PageProps<"/fnrh/[token]">) {
  return (
    <div className="min-h-screen bg-creme">
      <main className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <Image
          src="/marca/villa-peri.png"
          alt=""
          width={380}
          height={305}
          className="mb-10 h-auto w-32"
          priority
        />
        <Suspense fallback={<Carregando />}>
          <Conteudo params={props.params} />
        </Suspense>
      </main>
    </div>
  );
}
