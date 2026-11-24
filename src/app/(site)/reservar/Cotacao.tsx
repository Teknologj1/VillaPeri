import { connection } from "next/server";

import { withTenant } from "@/db/tenant";
import { anfitriaoDaCasa } from "@/lib/anfitriao-publico";
import { type Noite, diaDaSemana, noitesDaEstadia } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { buscarPropriedade, listarTipos } from "@/modules/anfitriao";
import { consultarDisponibilidade } from "@/modules/calendario";
import { SemTarifaError, orcarEstadia } from "@/modules/tarifas";

import { FormularioDePedido } from "./FormularioDePedido";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function porExtenso(noite: Noite): string {
  const [, mes, dia] = noite.split("-");
  return `${dia}/${mes} · ${DIAS[diaDaSemana(noite)]}`;
}

function Caixa({
  tom,
  children,
}: {
  tom: "bom" | "aviso";
  children: React.ReactNode;
}) {
  const estilo =
    tom === "bom"
      ? "border-mata/30 bg-mata/5 text-mata"
      : "border-vinho/30 bg-vinho/5 text-vinho";
  return (
    <div className={`mt-8 rounded-xl border px-5 py-4 leading-relaxed ${estilo}`}>
      {children}
    </div>
  );
}

export type Pedido = {
  entrada: Noite;
  saida: Noite;
  adultos: number;
  criancas: number;
};

export async function Cotacao({ p }: { p: Pedido }) {
  /*
    O motor de disponibilidade lê o RELÓGIO — é assim que ele recusa data que
    já passou. Com Cache Components, ler o relógio dentro de uma rota
    pré-renderizada exige `<Suspense>` **e** `connection()` antes da leitura
    (guia de migração do Next, "Fix synchronous IO. It can't be deferred").
    Esta página tinha o Suspense e não tinha isto.

    O sintoma em produção não foi erro: foi a página responder 200, mandar o
    shell e NUNCA FECHAR a conexão. O banco recebia as consultas e commitava —
    31 transações numa requisição travada —, e a renderização não terminava.
    Num build local passa, porque o shell não é retomado do mesmo jeito.

    Eu já havia posto `connection()` no calendário do painel por esta mesma
    razão e não trouxe para cá. As telas do painel escapam por acidente:
    `exigirSessao()` lê cabeçalhos, que também é API de tempo de requisição e
    interrompe o pré-render.
  */
  await connection();
  const agora = new Date();

  let noites: Noite[];
  try {
    noites = noitesDaEstadia(p.entrada, p.saida);
  } catch {
    return <Caixa tom="aviso">A saída precisa ser depois da entrada.</Caixa>;
  }

  const anfitriaoId = await anfitriaoDaCasa();
  if (!anfitriaoId) {
    return (
      <Caixa tom="aviso">
        Não foi possível consultar agora. Tente de novo em instantes.
      </Caixa>
    );
  }

  return withTenant(anfitriaoId, async (tx) => {
    const propriedade = await buscarPropriedade(tx);
    const [tipo] = await listarTipos(tx);
    if (!tipo) return <Caixa tom="aviso">Nenhuma acomodação cadastrada.</Caixa>;

    const { ofertas } = await consultarDisponibilidade(tx, {
      entrada: p.entrada,
      saida: p.saida,
      adultos: p.adultos,
      criancas: p.criancas,
      tipoId: tipo.id,
      // Depois do `connection()` no topo deste componente.
    }, agora);
    const oferta = ofertas[0];

    /*
      Quando não há oferta, o site diz POR QUÊ. "Indisponível" obriga o
      visitante a adivinhar e a tentar datas no escuro; "o mínimo nesta data é
      de 3 noites" ele resolve sozinho.
    */
    if (!oferta?.disponivel) {
      return (
        <Caixa tom="aviso">
          <p className="font-medium">Não temos estas datas disponíveis.</p>
          <ul className="mt-2 space-y-1">
            {oferta?.motivos.map((m) => (
              <li key={m.codigo}>
                {m.codigo === "MINIMO_DIARIAS"
                  ? `Nesta data a estadia mínima é de ${m.minimo} noites — você pediu ${m.solicitado}.`
                  : m.codigo === "CAPACIDADE_EXCEDIDA"
                    ? `A casa acomoda até ${m.capacidade} pessoas, e o pedido é para ${m.solicitado}.`
                    : m.codigo === "NOITE_OCUPADA"
                      ? `Já temos reserva em ${m.noites.length === 1 ? "uma das noites" : "algumas das noites"} escolhidas.`
                      : m.codigo === "DATA_PASSADA"
                        ? "A data de entrada já passou."
                        : m.codigo === "JANELA_MAXIMA"
                          ? `Ainda não abrimos a agenda para tão longe (até ${m.diasMaximos} dias).`
                          : "Estas datas não estão abertas para reserva."}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            Experimente outras datas, ou fale com a gente pelo WhatsApp.
          </p>
        </Caixa>
      );
    }

    let orcamento;
    try {
      orcamento = await orcarEstadia(tx, {
        noites,
        adultos: p.adultos,
        criancas: p.criancas,
        tipo: {
          id: tipo.id,
          modoPreco: tipo.modoPreco,
          ocupacaoBase: tipo.ocupacaoBase,
        },
        propriedadeId: propriedade.id,
        sinalPontosBase: propriedade.sinalPontosBase,
      });
    } catch (erro) {
      if (erro instanceof SemTarifaError) {
        return (
          <Caixa tom="aviso">
            Ainda não temos tarifa publicada para estas datas. Fale com a gente
            pelo WhatsApp que informamos o valor.
          </Caixa>
        );
      }
      throw erro;
    }

    return (
      <div className="mt-8">
        <div className="overflow-hidden rounded-2xl border border-borda">
          <div className="bg-creme-fundo px-6 py-5">
            <p className="text-sm text-tinta-suave">
              {noites.length} {noites.length === 1 ? "noite" : "noites"} ·{" "}
              {p.adultos} {p.adultos === 1 ? "adulto" : "adultos"}
              {p.criancas > 0 &&
                ` · ${p.criancas} ${p.criancas === 1 ? "criança" : "crianças"}`}
            </p>
            <p className="mt-1 font-display text-3xl text-vinho">
              {formatarReais(orcamento.totalCentavos)}
            </p>
            <p className="mt-1 text-sm text-tinta-suave">
              Sinal de {formatarReais(orcamento.sinalCentavos)} na reserva; o
              restante no check-in.
            </p>
          </div>

          <ul className="divide-y divide-borda">
            {orcamento.noites.map((n) => (
              <li
                key={n.noite}
                className="flex items-center justify-between gap-4 px-6 py-2.5 text-sm"
              >
                <span className="text-tinta-suave">
                  {porExtenso(n.noite)}
                  {n.feriado && (
                    <span className="ml-2 rounded-full bg-dourado/25 px-2 py-0.5 text-xs text-tinta">
                      {n.feriado}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">
                  {formatarReais(n.precoCentavos)}
                </span>
              </li>
            ))}
            {orcamento.adicionalOcupacaoCentavos > 0 && (
              <li className="flex items-center justify-between gap-4 px-6 py-2.5 text-sm">
                <span className="text-tinta-suave">
                  Pessoas além de {tipo.ocupacaoBase}
                </span>
                <span className="tabular-nums">
                  {formatarReais(orcamento.adicionalOcupacaoCentavos)}
                </span>
              </li>
            )}
          </ul>
        </div>

        <h2 className="mt-10 font-display text-2xl">Solicitar estas datas</h2>
        <FormularioDePedido
          entrada={p.entrada}
          saida={p.saida}
          adultos={p.adultos}
          criancas={p.criancas}
          totalCentavos={orcamento.totalCentavos}
        />
      </div>
    );
  });
}
