import { type Noite, diaDaSemana } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import type { MotivoIndisponivel } from "@/modules/calendario";
import type { Orcamento as OrcamentoCalculado } from "@/modules/tarifas";

/**
 * Como um orçamento aparece na tela, num lugar só.
 *
 * O simulador e a tela de nova reserva mostram o MESMO cálculo, e o portão da
 * Fase 1A exige que site, simulador e reserva deem o mesmo valor. Desenhar a
 * tabela duas vezes é como as duas telas acabam somando coisas diferentes —
 * ou mostrando a mesma soma com rótulos que sugerem contas distintas.
 */

const DIAS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

function porExtenso(noite: Noite): string {
  const [ano, mes, dia] = noite.split("-");
  return `${dia}/${mes}/${ano} · ${DIAS[diaDaSemana(noite)]}`;
}

export function NoiteANoite({ orcamento }: { orcamento: OrcamentoCalculado }) {
  return (
    <table className="mt-5 w-full overflow-hidden rounded-xl border border-borda text-left">
      <thead className="bg-creme-fundo text-sm text-tinta-suave">
        <tr>
          <th scope="col" className="px-5 py-3 font-medium">
            Noite
          </th>
          <th scope="col" className="px-5 py-3 font-medium">
            Regra
          </th>
          <th scope="col" className="px-5 py-3 text-right font-medium">
            Valor
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-borda">
        {orcamento.noites.map((n) => (
          <tr key={n.noite}>
            <td className="px-5 py-3">
              {porExtenso(n.noite)}
              {n.feriado && (
                <span className="ml-2 rounded-full bg-dourado/25 px-2 py-0.5 text-xs">
                  {n.feriado}
                </span>
              )}
            </td>
            {/* A REGRA, sempre — é ela que gerou o valor. O feriado fica na
                coluna da noite, como contexto: a noite de 1º de janeiro pode
                ser cobrada pela regra do Réveillon, e escrever o nome do
                feriado aqui nomearia como origem uma regra que não a gerou. */}
            <td className="px-5 py-3 text-tinta-suave">{n.regraNome}</td>
            <td className="px-5 py-3 text-right tabular-nums">
              {formatarReais(n.precoCentavos)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TotalDoOrcamento({
  orcamento,
  ocupacaoBase,
  sinalPontosBase,
}: {
  orcamento: OrcamentoCalculado;
  ocupacaoBase: number;
  sinalPontosBase: number;
}) {
  const linhas: { rotulo: string; valor: number; negativo?: boolean }[] = [
    {
      rotulo: `Diárias (${orcamento.noites.length})`,
      valor: orcamento.subtotalNoitesCentavos,
    },
  ];

  if (orcamento.adicionalOcupacaoCentavos > 0) {
    linhas.push({
      rotulo: `Pessoas além de ${ocupacaoBase}`,
      valor: orcamento.adicionalOcupacaoCentavos,
    });
  }
  if (orcamento.descontoEstadiaLongaCentavos > 0) {
    linhas.push({
      rotulo: "Desconto de estadia longa",
      valor: -orcamento.descontoEstadiaLongaCentavos,
      negativo: true,
    });
  }
  if (orcamento.descontoManualCentavos > 0) {
    linhas.push({
      rotulo: "Desconto concedido",
      valor: -orcamento.descontoManualCentavos,
      negativo: true,
    });
  }
  for (const e of orcamento.extras) {
    linhas.push({ rotulo: e.nome, valor: e.valorCentavos });
  }

  return (
    <dl className="mt-5 divide-y divide-borda overflow-hidden rounded-xl border border-borda">
      {linhas.map((l) => (
        <div key={l.rotulo} className="flex justify-between gap-4 px-5 py-3">
          <dt className="text-tinta-suave">{l.rotulo}</dt>
          <dd
            className={`tabular-nums ${l.negativo ? "text-mata" : "text-tinta"}`}
          >
            {formatarReais(l.valor)}
          </dd>
        </div>
      ))}
      <div className="flex justify-between gap-4 bg-creme-fundo px-5 py-4">
        <dt className="font-medium">Total</dt>
        <dd className="font-display text-xl text-vinho tabular-nums">
          {formatarReais(orcamento.totalCentavos)}
        </dd>
      </div>
      <div className="flex justify-between gap-4 px-5 py-3">
        <dt className="text-tinta-suave">Sinal ({sinalPontosBase / 100}%)</dt>
        <dd className="tabular-nums">{formatarReais(orcamento.sinalCentavos)}</dd>
      </div>
      <div className="flex justify-between gap-4 px-5 py-3">
        <dt className="text-tinta-suave">Saldo no check-in</dt>
        <dd className="tabular-nums">{formatarReais(orcamento.saldoCentavos)}</dd>
      </div>
    </dl>
  );
}

/**
 * O que o CALENDÁRIO diz, separado do que a tabela de preços diz.
 *
 * As duas perguntas são distintas — "cabe?" e "quanto custa?" — e juntá-las
 * numa frase só faz a recepção achar que um preço alto é indisponibilidade,
 * ou que uma data cheia é um problema de tarifa.
 */
export function AvisoDeDisponibilidade({
  disponivel,
  unidadesLivres,
  motivos,
}: {
  disponivel: boolean;
  unidadesLivres: number;
  motivos: MotivoIndisponivel[];
}) {
  return (
    <div
      className={`rounded-xl border px-5 py-4 ${
        disponivel
          ? "border-mata/30 bg-mata/5 text-mata"
          : "border-vinho/30 bg-vinho/5 text-vinho"
      }`}
    >
      {disponivel ? (
        <p>
          Disponível · {unidadesLivres}{" "}
          {unidadesLivres === 1 ? "unidade livre" : "unidades livres"}
        </p>
      ) : (
        <div>
          <p className="font-medium">Sem oferta para estas datas</p>
          <ul className="mt-2 space-y-1 text-sm">
            {motivos.map((m) => (
              <li key={m.codigo}>{frase(m)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const DIA_DA_SEMANA = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

/**
 * Cada motivo vira frase com os dados dentro.
 *
 * "Indisponível" não ajuda ninguém: a recepção precisa saber se o problema é
 * a data cheia, o mínimo de noites ou a lotação — porque em alguns desses
 * casos existe uma contraproposta a oferecer ao hóspede.
 *
 * O `switch` é exaustivo sobre a união. Acrescentar um motivo no motor sem
 * escrever a frase dele aqui para de compilar — e um código em caixa alta na
 * tela do hóspede seria pior que a frase faltando.
 */
function frase(m: MotivoIndisponivel): string {
  switch (m.codigo) {
    case "NOITE_OCUPADA":
      return `Noites ocupadas: ${m.noites.join(", ")}.`;
    case "SEM_UNIDADE_ATIVA":
      return "Nenhuma unidade ativa para este tipo.";
    case "MINIMO_DIARIAS":
      return `Mínimo de ${m.minimo} noites${
        m.regra ? ` (${m.regra})` : ""
      }; pedido: ${m.solicitado}.`;
    case "MAXIMO_DIARIAS":
      return `Máximo de ${m.maximo} noites; pedido: ${m.solicitado}.`;
    case "DIA_ENTRADA_NAO_PERMITIDO":
      return `A entrada não é aceita em ${
        DIA_DA_SEMANA[m.diaSolicitado]
      }. Dias aceitos: ${m.diasPermitidos
        .map((d) => DIA_DA_SEMANA[d])
        .join(", ")}.`;
    case "ANTECEDENCIA_MINIMA":
      return `Esta entrada exige ${m.horasExigidas}h de antecedência; faltam ${Math.max(
        Math.round(m.horasRestantes),
        0,
      )}h.`;
    case "JANELA_MAXIMA":
      return `Só se reserva com até ${m.diasMaximos} dias de antecedência; pedido: ${m.diasSolicitados}.`;
    case "DATA_PASSADA":
      return `A data de entrada já passou (hoje é ${m.hoje}).`;
    case "CAPACIDADE_EXCEDIDA":
      return `A casa acomoda ${m.capacidade} pessoas; pedido: ${m.solicitado}.`;
    case "INTERVALO_LIMPEZA":
      return `Há intervalo de limpeza de ${m.noites} ${
        m.noites === 1 ? "noite" : "noites"
      } entre estas datas.`;
  }
}
