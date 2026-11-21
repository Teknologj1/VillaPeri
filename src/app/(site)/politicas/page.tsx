import type { Metadata } from "next";

import { formatarReais } from "@/lib/dinheiro";
import { CASA, PRECOS, REGRAS_DA_CASA } from "@/modules/conteudo";

import { BotaoWhatsApp } from "../_componentes/BotaoWhatsApp";

export const metadata: Metadata = {
  title: "Políticas e regras da casa",
  description:
    "Horários, mínimo de noites, valores, sinal, cancelamento e regras da casa da Villa Peri, em Pirenópolis.",
  alternates: { canonical: "/politicas" },
};

const INCLUSO = [
  "Roupas de cama e banho",
  "Toalhas, lençóis, sabonete e papel higiênico",
  "Itens básicos de cozinha: vasilhas, panelas, óleo, sal e pimenta",
  "Wi-Fi",
  "Estacionamento na garagem, para até 4 carros",
  "Uso da piscina, da churrasqueira e do fogão caipira",
];

/** Só a diária, sem o adicional por pessoa — veja a nota na seção. */
const DIARIAS = [
  { quando: "Meio de semana", valor: PRECOS.diariaSemanaCentavos },
  { quando: "Fim de semana", valor: PRECOS.diariaFimDeSemanaCentavos },
  { quando: "Feriados", valor: PRECOS.diariaFeriadoCentavos },
];

export default function Politicas() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl">
          Políticas e regras da casa
        </h1>
      </header>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Horários</h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-borda bg-creme-fundo p-5">
            <dt className="text-sm uppercase tracking-wide text-tinta-suave">
              Check-in
            </dt>
            <dd className="mt-1 font-display text-2xl">
              a partir das {CASA.checkin}
            </dd>
          </div>
          <div className="rounded-xl border border-borda bg-creme-fundo p-5">
            <dt className="text-sm uppercase tracking-wide text-tinta-suave">
              Check-out
            </dt>
            <dd className="mt-1 font-display text-2xl">até as {CASA.checkout}</dd>
          </div>
        </dl>
        <p className="mt-4 text-tinta-suave">
          Guardamos a bagagem para quem chega cedo ou sai tarde. O anfitrião
          recebe você na chegada.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Diárias</h2>
        <dl className="mt-5 divide-y divide-borda overflow-hidden rounded-xl border border-borda">
          {DIARIAS.map((d) => (
            <div
              key={d.quando}
              className="flex items-baseline justify-between gap-4 bg-creme-fundo px-5 py-4"
            >
              <dt className="text-tinta-suave">{d.quando}</dt>
              <dd className="font-display text-xl text-vinho">
                {formatarReais(d.valor)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 leading-relaxed text-tinta-suave">
          A diária cobre até {PRECOS.ocupacaoBase} hóspedes. Cada pessoa a mais
          paga {formatarReais(PRECOS.pessoaAdicionalCentavos)} por noite.
          Crianças de até {PRECOS.idadeMinimaCrianca - 1} anos não pagam; de{" "}
          {PRECOS.idadeMinimaCrianca} a {PRECOS.idadeMaximaCrianca} anos pagam
          meia; a partir de {PRECOS.idadeMaximaCrianca + 1} anos, valor
          integral.
        </p>
        <p className="mt-3 text-sm text-tinta-suave">
          Em datas de alta procura, como réveillon e Carnaval, a diária pode ser
          diferente. Confirme sempre o valor da sua data com a gente.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Mínimo de noites</h2>
        <p className="mt-4 leading-relaxed text-tinta-suave">
          A estadia mínima é de {PRECOS.minimoNoites} noites. Em feriados
          prolongados, {PRECOS.minimoNoitesFeriado} noites.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Sinal e pagamento</h2>
        <p className="mt-4 leading-relaxed text-tinta-suave">
          O sinal é de {PRECOS.sinalPercentual}% do total, pago no ato da
          reserva. O restante é pago no check-in.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Cancelamento</h2>
        <p className="mt-4 leading-relaxed text-tinta-suave">
          Cancelamentos feitos com {PRECOS.diasParaCancelar} dias ou mais de
          antecedência têm devolução integral do sinal. Abaixo desse prazo o
          sinal não é devolvido, salvo em caso de força maior.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Crianças e animais</h2>
        <ul className="mt-5 space-y-3 text-tinta-suave">
          <li className="border-l-2 border-vinho/40 pl-4 leading-relaxed">
            Crianças de até {PRECOS.idadeMinimaCrianca - 1} anos não pagam e não
            contam como pessoa adicional.
          </li>
          <li className="border-l-2 border-vinho/40 pl-4 leading-relaxed">
            De {PRECOS.idadeMinimaCrianca} a {PRECOS.idadeMaximaCrianca} anos,
            meia diária por pessoa adicional. A partir de{" "}
            {PRECOS.idadeMaximaCrianca + 1} anos, valor integral.
          </li>
          <li className="border-l-2 border-vinho/40 pl-4 leading-relaxed">
            Não temos disponibilidade para animais de estimação.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Regras da casa</h2>
        <ul className="mt-5 space-y-3">
          {REGRAS_DA_CASA.map((regra) => (
            <li
              key={regra}
              className="border-l-2 border-vinho/40 pl-4 leading-relaxed text-tinta-suave"
            >
              {regra}
            </li>
          ))}
        </ul>
        <p className="mt-5 leading-relaxed text-tinta-suave">
          Pedimos bom senso com o barulho durante o dia: a vizinhança é
          residencial e prezamos pelo bom convívio.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">O que está incluído</h2>
        <ul className="mt-5 space-y-2 text-tinta-suave">
          {INCLUSO.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="mt-14 rounded-2xl bg-creme-fundo p-8 text-center">
        <h2 className="font-display text-2xl">Consulte a sua data</h2>
        <p className="mx-auto mt-3 max-w-xl text-tinta-suave">
          Mandamos o valor exato da sua estadia, com o número de hóspedes.
        </p>
        <div className="mt-6">
          <BotaoWhatsApp
            mensagem={`Olá! Gostaria de saber o valor da estadia na ${CASA.nome}.`}
          >
            Falar no WhatsApp
          </BotaoWhatsApp>
        </div>
      </section>
    </div>
  );
}
