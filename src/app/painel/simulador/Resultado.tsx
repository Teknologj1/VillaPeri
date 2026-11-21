import { formatarReais } from "@/lib/dinheiro";
import { withTenant } from "@/db/tenant";
import { exigirSessao } from "@/lib/sessao";
import { type Noite, diaDaSemana, noitesDaEstadia } from "@/lib/data";
import { buscarPropriedade, buscarTipoPorSlug, listarTipos } from "@/modules/anfitriao";
import { exigirPermissao } from "@/modules/autenticacao";
import { consultarDisponibilidade } from "@/modules/calendario";
import { SemTarifaError, orcarEstadia } from "@/modules/tarifas";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function porExtenso(noite: Noite): string {
  const [ano, mes, dia] = noite.split("-");
  return `${dia}/${mes}/${ano} · ${DIAS[diaDaSemana(noite)]}`;
}

export type Parametros = {
  entrada: string;
  saida: string;
  adultos: number;
  criancas: number;
  tipoSlug?: string;
};

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-8 rounded-xl border border-vinho/30 bg-vinho/5 px-5 py-4 leading-relaxed text-vinho">
      {children}
    </p>
  );
}

export async function Resultado({ p }: { p: Parametros }) {
  const sessao = await exigirSessao();
  // Ver a tabela de tarifas é o mínimo para simular. Governança, que não vê
  // valores, não passa daqui.
  exigirPermissao(sessao, "tarifas", "ver");

  let noites: Noite[];
  try {
    noites = noitesDaEstadia(p.entrada, p.saida);
  } catch {
    return <Aviso>A saída precisa ser depois da entrada.</Aviso>;
  }

  return withTenant(sessao.anfitriaoId, async (tx) => {
    const propriedade = await buscarPropriedade(tx);
    const tipo = p.tipoSlug
      ? await buscarTipoPorSlug(tx, p.tipoSlug)
      : (await listarTipos(tx))[0];

    if (!tipo) return <Aviso>Nenhum tipo de acomodação cadastrado.</Aviso>;

    const disponibilidade = await consultarDisponibilidade(tx, {
      entrada: p.entrada,
      saida: p.saida,
      adultos: p.adultos,
      criancas: p.criancas,
      tipoId: tipo.id,
    });
    const oferta = disponibilidade.ofertas[0];

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
          <Aviso>
            Não há diária cadastrada para {erro.noites.length}{" "}
            {erro.noites.length === 1 ? "noite" : "noites"}:{" "}
            {erro.noites.join(", ")}. Cadastre a diária padrão antes de cotar.
          </Aviso>
        );
      }
      throw erro;
    }

    const linhas: { rotulo: string; valor: number; negativo?: boolean }[] = [
      { rotulo: `Diárias (${noites.length})`, valor: orcamento.subtotalNoitesCentavos },
    ];
    if (orcamento.adicionalOcupacaoCentavos > 0) {
      linhas.push({
        rotulo: `Pessoas além de ${tipo.ocupacaoBase}`,
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
    for (const e of orcamento.extras) {
      linhas.push({ rotulo: e.nome, valor: e.valorCentavos });
    }

    return (
      <div className="mt-10">
        {/* O que o calendário diz, separado do que a tabela de preços diz. */}
        <div
          className={`rounded-xl border px-5 py-4 ${
            oferta?.disponivel
              ? "border-mata/30 bg-mata/5 text-mata"
              : "border-vinho/30 bg-vinho/5 text-vinho"
          }`}
        >
          {oferta?.disponivel ? (
            <p>
              Disponível · {oferta.unidadesLivres.length}{" "}
              {oferta.unidadesLivres.length === 1 ? "unidade livre" : "unidades livres"}
            </p>
          ) : (
            <div>
              <p className="font-medium">Sem oferta para estas datas</p>
              <ul className="mt-2 space-y-1 text-sm">
                {oferta?.motivos.map((m) => (
                  <li key={m.codigo}>
                    {m.codigo === "MINIMO_DIARIAS"
                      ? `Mínimo de ${m.minimo} noites${m.regra ? ` (${m.regra})` : ""}; pedido: ${m.solicitado}.`
                      : m.codigo === "CAPACIDADE_EXCEDIDA"
                        ? `A casa acomoda ${m.capacidade} pessoas; pedido: ${m.solicitado}.`
                        : m.codigo === "NOITE_OCUPADA"
                          ? `Noites ocupadas: ${m.noites.join(", ")}.`
                          : m.codigo === "DIA_ENTRADA_NAO_PERMITIDO"
                            ? `A entrada não é aceita neste dia da semana.`
                            : m.codigo === "DATA_PASSADA"
                              ? `A data de entrada já passou.`
                              : m.codigo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <h2 className="mt-10 font-display text-2xl">Noite a noite</h2>
        <p className="mt-2 text-sm text-tinta-suave">
          Cada linha mostra a regra que gerou o valor. É assim que se confere se
          a tabela está certa — e é a mesma explicação que a recepção dá ao
          hóspede.
        </p>
        <table className="mt-5 w-full overflow-hidden rounded-xl border border-borda text-left">
          <thead className="bg-creme-fundo text-sm text-tinta-suave">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">Noite</th>
              <th scope="col" className="px-5 py-3 font-medium">Regra</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Valor</th>
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
                <td className="px-5 py-3 text-tinta-suave">{n.regraNome}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {formatarReais(n.precoCentavos)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-10 font-display text-2xl">Total</h2>
        <dl className="mt-5 divide-y divide-borda overflow-hidden rounded-xl border border-borda">
          {linhas.map((l) => (
            <div
              key={l.rotulo}
              className="flex justify-between gap-4 px-5 py-3"
            >
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
            <dt className="text-tinta-suave">
              Sinal ({propriedade.sinalPontosBase / 100}%)
            </dt>
            <dd className="tabular-nums">{formatarReais(orcamento.sinalCentavos)}</dd>
          </div>
          <div className="flex justify-between gap-4 px-5 py-3">
            <dt className="text-tinta-suave">Saldo no check-in</dt>
            <dd className="tabular-nums">{formatarReais(orcamento.saldoCentavos)}</dd>
          </div>
        </dl>

        {oferta && (
          <p className="mt-6 text-sm text-tinta-suave">
            Regras que valeram: mínimo de {oferta.regras.minimoDiarias}{" "}
            {oferta.regras.minimoDiarias === 1 ? "noite" : "noites"}
            {oferta.regras.procedencia.minimoDiarias !== "padrão" &&
              ` (${oferta.regras.procedencia.minimoDiarias.regraNome})`}
            {oferta.regras.intervaloLimpezaNoites > 0 &&
              ` · intervalo de limpeza de ${oferta.regras.intervaloLimpezaNoites} noite(s)`}
            .
          </p>
        )}
      </div>
    );
  });
}
