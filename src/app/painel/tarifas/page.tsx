import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { withTenant } from "@/db/tenant";
import { exigirSessao } from "@/lib/sessao";
import { buscarPropriedade } from "@/modules/anfitriao";
import { podeNoModulo } from "@/modules/autenticacao";
import { listarRegrasDeEstadia } from "@/modules/calendario";
import { buscarPoliticaPadrao, listarRegrasTarifa } from "@/modules/tarifas";

import { SemAcesso } from "../_componentes/SemAcesso";
import {
  CondicoesDaCasa,
  FormularioDeEstadia,
  FormularioDeRegra,
  PoliticaDeCancelamento,
} from "./Formularios";

export const metadata: Metadata = {
  title: "Tarifas",
  robots: { index: false, follow: false },
};

/**
 * A ordem em que as regras aparecem é a da PILHA DE PRIORIDADE do motor: a
 * mais específica primeiro. Listá-las em outra ordem — alfabética, por data —
 * faria a tela sugerir que a diária padrão compete com o feriado, quando na
 * verdade ela só vale onde nenhuma das de cima vale.
 */
const ORDEM_DO_NIVEL: Record<string, number> = {
  especial: 0,
  feriado: 1,
  temporada: 2,
  padrao: 3,
};

async function Conteudo() {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "tarifas", "ver")) {
    return <SemAcesso modulo="tarifas" />;
  }

  const dados = await withTenant(sessao.anfitriaoId, async (tx) => ({
    propriedade: await buscarPropriedade(tx),
    regras: await listarRegrasTarifa(tx),
    estadia: await listarRegrasDeEstadia(tx),
    politica: await buscarPoliticaPadrao(tx),
  }));

  const podeEditar = podeNoModulo(sessao, "tarifas", "editar");
  const hoje = new Date().toISOString().slice(0, 10);

  // Períodos especiais são gerados por ano (Réveillon 2026/2027, 2027/2028…)
  // até cinco anos à frente. Listar todos faria uma dezena de formulários
  // quase iguais, e o proprietário mexe no preço do próximo réveillon, não no
  // de 2030. A tela mostra os que ainda valem dentro de DOIS anos; os demais
  // continuam no banco e no motor, só não ocupam a tela.
  const limite = `${new Date().getUTCFullYear() + 2}-12-31`;
  const regras = dados.regras
    .filter(
      (r) =>
        // Sem vigência: a diária padrão e a de feriado, que valem sempre.
        (!r.vigenciaInicio && !r.vigenciaFim) ||
        // Com vigência: só o que ainda não terminou e começa dentro da
        // janela. Carnaval do ano passado não é mais editável na prática, e
        // ocupa a tela do proprietário à toa.
        ((!r.vigenciaFim || r.vigenciaFim >= hoje) &&
          (!r.vigenciaInicio || r.vigenciaInicio <= limite)),
    )
    .sort(
      (a, b) =>
        (ORDEM_DO_NIVEL[a.nivel] ?? 9) - (ORDEM_DO_NIVEL[b.nivel] ?? 9) ||
        (a.vigenciaInicio ?? "").localeCompare(b.vigenciaInicio ?? ""),
    );

  const faixa = dados.politica?.faixas?.[0];

  if (!podeEditar) {
    return (
      <p className="mt-8 rounded-xl border border-borda bg-creme-fundo px-5 py-4 leading-relaxed text-tinta-suave">
        Seu perfil vê as tarifas mas não as altera. Para conferir um preço,
        use o{" "}
        <Link href="/painel/simulador" className="text-vinho hover:underline">
          simulador
        </Link>
        , que mostra o cálculo noite a noite com a regra de cada uma.
      </p>
    );
  }

  return (
    <>
      <section className="mt-12">
        <h2 className="font-display text-2xl">Condições da casa</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-tinta-suave">
          Valem para toda cotação nova, no site, no simulador e na resposta da
          RIIA ao mesmo tempo.
        </p>
        <CondicoesDaCasa
          sinalPercentual={dados.propriedade.sinalPontosBase / 100}
          checkin={dados.propriedade.checkinPadrao.slice(0, 5)}
          checkout={dados.propriedade.checkoutPadrao.slice(0, 5)}
          emailContato={dados.propriedade.emailContato}
          whatsappContato={dados.propriedade.whatsappContato}
        />
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl">Diárias</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-tinta-suave">
          Na ordem em que o motor decide: período especial vence feriado, que
          vence temporada, que vence a diária padrão. Cada noite recebe o preço
          da primeira regra que a cobre.
        </p>
        <div className="mt-6 space-y-5">
          {regras.map((r) => (
            <FormularioDeRegra
              key={r.id}
              regra={{
                id: r.id,
                nome: r.nome,
                nivel: r.nivel,
                precoSemanaCentavos: r.precoSemanaCentavos,
                precoFimDeSemanaCentavos: r.precoFimDeSemanaCentavos,
                precoFixoCentavos: r.precoFixoCentavos,
                ajustePontosBase: r.ajustePontosBase,
                valorPessoaExtraCentavos: r.valorPessoaExtraCentavos,
                valorCriancaCentavos: r.valorCriancaCentavos,
                vigenciaInicio: r.vigenciaInicio,
                vigenciaFim: r.vigenciaFim,
                ativa: r.ativa,
              }}
            />
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl">Mínimo de noites</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-tinta-suave">
          Vale a regra que cobre a NOITE DE ENTRADA — é ela que determina o
          mínimo da estadia inteira.
        </p>
        <div className="mt-6 space-y-5">
          {dados.estadia.map((r) => (
            <FormularioDeEstadia
              key={r.id}
              regra={{
                id: r.id,
                nome: r.nome,
                minimoDiarias: r.minimoDiarias,
                maximoDiarias: r.maximoDiarias,
                intervaloLimpezaNoites: r.intervaloLimpezaNoites,
                somenteEmFeriado: r.somenteEmFeriado,
              }}
            />
          ))}
        </div>
      </section>

      {dados.politica && faixa && (
        <section className="mt-16">
          <h2 className="font-display text-2xl">Cancelamento</h2>
          <PoliticaDeCancelamento
            diasAntes={faixa.diasAntes}
            percentualDevolvido={faixa.percentualPontosBase / 100}
            saidaAntecipadaPercentual={
              dados.politica.saidaAntecipadaPontosBase / 100
            }
          />
        </section>
      )}

      <p className="mt-16 max-w-prose rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-sm leading-relaxed text-tinta-suave">
        Depois de mudar um preço, confira no{" "}
        <Link href="/painel/simulador" className="text-vinho hover:underline">
          simulador
        </Link>
        : ele mostra o cálculo noite a noite com a regra que gerou cada valor, e
        usa o mesmo motor do site e das reservas. Reserva já fechada não muda —
        o orçamento dela é cópia congelada do dia em que foi fechada.
      </p>
    </>
  );
}

function Carregando() {
  return (
    <div className="mt-12 space-y-5" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-xl bg-creme-fundo" />
      ))}
    </div>
  );
}

export default function Tarifas() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl">Tarifas</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-tinta-suave">
        Os preços e as condições da casa. O que está aqui é o que o site cota, o
        que o simulador calcula e o que a RIIA responde — não há uma segunda
        tabela em lugar nenhum.
      </p>

      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </main>
  );
}
