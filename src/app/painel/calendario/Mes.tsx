import Link from "next/link";

import { withTenant } from "@/db/tenant";
import { env } from "@/env";
import {
  type Noite,
  diaDaSemana,
  formatarNoite,
  hojeNaPropriedade,
  somarDias,
} from "@/lib/data";
import { exigirSessao } from "@/lib/sessao";
import { buscarPropriedade, listarUnidadesAtivas } from "@/modules/anfitriao";
import { podeNoModulo } from "@/modules/autenticacao";
import {
  type DiaDoCalendario,
  calendarioDoPeriodo,
  listarBloqueios,
} from "@/modules/calendario";
import { reservasNoPeriodo } from "@/modules/reservas";

import { SemAcesso } from "../_componentes/SemAcesso";
import { BotaoReabrir, FecharDatas } from "./Formularios";

const NOME_DO_MES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const ROTULO_MOTIVO: Record<string, string> = {
  reforma: "Reforma ou manutenção",
  uso_proprietario: "Uso do proprietário",
  fechamento: "Fechamento da casa",
  evento_privado: "Evento privado",
  outro: "Outro",
};

/**
 * A cor de cada estado da noite.
 *
 * A cor nunca é o único sinal: cada célula tem uma letra e o `title` diz por
 * extenso. Quem não distingue vinho de verde ainda lê o calendário.
 */
const ESTADO: Record<string, { fundo: string; letra: string; nome: string }> = {
  reserva: { fundo: "bg-vinho text-creme", letra: "R", nome: "reservada" },
  bloqueio: { fundo: "bg-tinta text-creme", letra: "F", nome: "fechada" },
  limpeza: { fundo: "bg-dourado/50 text-tinta", letra: "L", nome: "limpeza" },
  canal: { fundo: "bg-mata text-creme", letra: "C", nome: "canal externo" },
};

function primeiroDoMes(ano: number, mes: number): Noite {
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

function ultimoDoMes(ano: number, mes: number): Noite {
  // Dia 0 do mês seguinte é o último do atual, e o Date resolve virada de ano.
  const d = new Date(Date.UTC(ano, mes, 0));
  return d.toISOString().slice(0, 10);
}

export async function Mes({ ano, mes }: { ano: number; mes: number }) {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "calendario", "ver")) {
    return <SemAcesso modulo="calendário" />;
  }

  const de = primeiroDoMes(ano, mes);
  const ate = ultimoDoMes(ano, mes);
  const hoje = hojeNaPropriedade(env.TZ_PROPRIEDADE);

  const dados = await withTenant(sessao.anfitriaoId, async (tx) => ({
    propriedade: await buscarPropriedade(tx),
    unidades: await listarUnidadesAtivas(tx),
    calendario: await calendarioDoPeriodo(tx, de, ate),
    bloqueios: await listarBloqueios(tx, de, ate),
    // Para o clique na noite levar à ficha certa: `noite_ocupada` guarda o id
    // da reserva, mas não o código, que é o que a pessoa lê.
    reservas: await reservasNoPeriodo(tx, de, somarDias(ate, 1)),
  }));

  const codigoPorId = new Map(dados.reservas.map((r) => [r.id, r.codigo]));
  const podeEditar = podeNoModulo(sessao, "calendario", "editar");

  const anterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const proximo = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };

  return (
    <>
      <nav className="mt-8 flex flex-wrap items-center gap-4">
        <Link
          href={`/painel/calendario?ano=${anterior.ano}&mes=${anterior.mes}`}
          className="rounded-full border border-borda px-5 py-2 text-sm font-medium transition-colors hover:border-vinho/40"
        >
          ← {NOME_DO_MES[anterior.mes - 1]}
        </Link>
        <h2 className="font-display text-2xl">
          {NOME_DO_MES[mes - 1]} de {ano}
        </h2>
        <Link
          href={`/painel/calendario?ano=${proximo.ano}&mes=${proximo.mes}`}
          className="rounded-full border border-borda px-5 py-2 text-sm font-medium transition-colors hover:border-vinho/40"
        >
          {NOME_DO_MES[proximo.mes - 1]} →
        </Link>
      </nav>

      {dados.calendario.length === 0 ? (
        <p className="mt-8 rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-tinta-suave">
          Nenhuma unidade ativa cadastrada.
        </p>
      ) : (
        dados.calendario.map((u) => (
          <section key={u.unidadeId} className="mt-8">
            {dados.calendario.length > 1 && (
              <h3 className="mb-3 font-medium">{u.unidadeNome}</h3>
            )}
            <Grade
              dias={u.dias}
              hoje={hoje}
              codigoPorId={codigoPorId}
              ano={ano}
              mes={mes}
            />
          </section>
        ))
      )}

      <Legenda />

      {/* ------------------------------------------------------------------ */}

      <section className="mt-14">
        <h2 className="font-display text-2xl">Datas fechadas neste mês</h2>
        {dados.bloqueios.length === 0 ? (
          <p className="mt-4 rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-tinta-suave">
            Nenhuma. A casa está aberta o mês inteiro, tirando o que já está
            reservado.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {dados.bloqueios.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-borda bg-creme-fundo px-5 py-4"
              >
                <div>
                  <p className="font-medium">
                    {formatarNoite(b.primeiraNoite)} a{" "}
                    {formatarNoite(b.ultimaNoite)}
                  </p>
                  <p className="mt-1 text-sm text-tinta-suave">
                    {ROTULO_MOTIVO[b.motivo] ?? b.motivo}
                    {b.observacao ? ` · ${b.observacao}` : ""}
                  </p>
                </div>
                {podeEditar && (
                  <div className="ml-auto">
                    <BotaoReabrir id={b.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {podeEditar && (
        <section className="mt-14">
          <h2 className="font-display text-2xl">Fechar datas</h2>
          <FecharDatas
            propriedadeId={dados.propriedade.id}
            unidades={dados.unidades.map((u) => ({ id: u.id, nome: u.nome }))}
            primeiroDia={de > hoje ? de : hoje}
          />
        </section>
      )}
    </>
  );
}

const DIA_DA_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function Grade({
  dias,
  hoje,
  codigoPorId,
  ano,
  mes,
}: {
  dias: DiaDoCalendario[];
  hoje: Noite;
  codigoPorId: Map<string, string>;
  ano: number;
  mes: number;
}) {
  // Casas vazias até o dia da semana em que o mês começa, para o dia 1 cair
  // na coluna certa — e as do fim, para a última linha fechar em vez de
  // deixar um vão aberto onde o fundo da grade aparece.
  const vaziasNoInicio = diaDaSemana(primeiroDoMes(ano, mes));
  const vaziasNoFim = (7 - ((vaziasNoInicio + dias.length) % 7)) % 7;

  return (
    <div className="overflow-hidden rounded-xl border border-borda">
      <div className="grid grid-cols-7 border-b border-borda bg-creme-fundo text-center text-xs text-tinta-suave">
        {DIA_DA_SEMANA.map((d, i) => (
          <div key={i} className="py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-borda">
        {Array.from({ length: vaziasNoInicio }).map((_, i) => (
          <div key={`vazio-${i}`} className="bg-creme-fundo" aria-hidden />
        ))}

        {dias.map((d) => {
          const estado = d.origem ? ESTADO[d.origem] : null;
          const codigo = d.origemId ? codigoPorId.get(d.origemId) : undefined;
          const numero = Number(d.noite.slice(8));
          const ehHoje = d.noite === hoje;

          const conteudo = (
            <>
              <span className={ehHoje ? "font-bold underline" : ""}>
                {numero}
              </span>
              {estado && (
                <span className="mt-0.5 block text-[0.65rem] leading-none opacity-90">
                  {estado.letra}
                </span>
              )}
            </>
          );

          const classe = `flex min-h-14 flex-col items-center justify-center bg-creme text-sm ${
            estado ? estado.fundo : "text-tinta"
          }`;
          const titulo = estado
            ? `${formatarNoite(d.noite)} — ${estado.nome}${codigo ? ` (${codigo})` : ""}`
            : `${formatarNoite(d.noite)} — livre`;

          // A noite de reserva leva à ficha; as outras não têm para onde ir.
          return codigo ? (
            <Link
              key={d.noite}
              href={`/painel/reservas/${codigo}`}
              title={titulo}
              className={`${classe} transition-opacity hover:opacity-80`}
            >
              {conteudo}
            </Link>
          ) : (
            <div key={d.noite} title={titulo} className={classe}>
              {conteudo}
            </div>
          );
        })}

        {Array.from({ length: vaziasNoFim }).map((_, i) => (
          <div key={`fim-${i}`} className="bg-creme-fundo" aria-hidden />
        ))}
      </div>
    </div>
  );
}

function Legenda() {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-tinta-suave">
      <li className="flex items-center gap-2">
        <span className="inline-block size-4 rounded border border-borda bg-creme" />
        livre
      </li>
      {Object.entries(ESTADO).map(([chave, e]) => (
        <li key={chave} className="flex items-center gap-2">
          <span
            className={`inline-flex size-4 items-center justify-center rounded text-[0.6rem] ${e.fundo}`}
          >
            {e.letra}
          </span>
          {e.nome}
        </li>
      ))}
    </ul>
  );
}
