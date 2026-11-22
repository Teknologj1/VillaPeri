import Link from "next/link";
import { notFound } from "next/navigation";

import { withTenant } from "@/db/tenant";
import { env } from "@/env";
import {
  formatarInstante,
  formatarNoite,
  formatarNoiteCurta,
  formatarPeriodo,
  hojeNaPropriedade,
} from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { apenasDigitos, formatarTelefone } from "@/lib/telefone";
import { exigirSessao } from "@/lib/sessao";
import { buscarPropriedade, listarUnidadesAtivas } from "@/modules/anfitriao";
import { podeNoModulo } from "@/modules/autenticacao";
import {
  type ReservaCompleta,
  type StatusReserva,
  destinosDe,
  buscarReservaPorCodigo,
  seguraNoites,
  registrarAcessoDadoPessoal,
  vencida,
} from "@/modules/reservas";
import { type Orcamento, buscarPoliticaPadrao } from "@/modules/tarifas";

import { Etiqueta, EtiquetaFnrh } from "../../_componentes/Etiqueta";
import { SemAcesso } from "../../_componentes/SemAcesso";
import {
  AcoesDaFnrh,
  BotoesDeStatus,
  FormularioDePagamento,
  Variacoes,
} from "./Acoes";

const ROTULO_PAGAMENTO: Record<string, string> = {
  sinal: "Sinal",
  saldo: "Saldo",
  extra: "Extra",
  reembolso: "Reembolso",
};

const ROTULO_METODO: Record<string, string> = {
  pix: "Pix",
  cartao: "cartão",
  dinheiro: "dinheiro",
  transferencia: "transferência",
  outro: "outro",
};

const ROTULO_CANAL: Record<string, string> = {
  site: "site",
  riia: "RIIA",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  indicacao: "indicação",
  balcao: "balcão",
  airbnb: "Airbnb",
  marketplace: "marketplace",
};

function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl">{titulo}</h2>
      {children}
    </section>
  );
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-borda px-5 py-3 last:border-0">
      <span className="text-tinta-suave">{rotulo}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export async function Ficha({ codigo }: { codigo: string }) {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "reservas", "ver")) {
    return <SemAcesso modulo="reservas" />;
  }

  /**
   * Documento e contato só aparecem para quem a matriz de perfis autoriza, e
   * cada abertura é registrada. Quem não tem acesso a `hospedes` ainda vê a
   * reserva — datas, valores, status —, só não vê os dados pessoais.
   */
  const vePessoal = podeNoModulo(sessao, "hospedes", "ver");

  const dados = await withTenant(sessao.anfitriaoId, async (tx) => {
    const ficha = await buscarReservaPorCodigo(tx, codigo);
    if (!ficha) return null;

    if (vePessoal) {
      // Registrado ANTES de os dados saírem daqui: fazer depois significa que
      // uma falha no meio do caminho deixa a leitura sem rastro.
      await registrarAcessoDadoPessoal(tx, {
        anfitriaoId: sessao.anfitriaoId,
        hospedeId: ficha.hospede.id,
        usuarioId: sessao.usuarioId,
        motivo: `abriu a ficha da reserva ${ficha.reserva.codigo}`,
      });
    }

    const propriedade = await buscarPropriedade(tx);
    const unidades = await listarUnidadesAtivas(tx);
    const politica = await buscarPoliticaPadrao(tx);

    // Decidido aqui, na leitura, e não no render: é onde "agora" existe de
    // verdade, e é o que a regra de expiração manda (a tarefa agendada só
    // limpa; nenhuma correção depende de ela ter rodado no minuto certo).
    return {
      ficha,
      propriedade,
      unidades,
      devolveNaSaidaAntecipada:
        (politica?.saidaAntecipadaPontosBase ?? 0) > 0,
      vencida: vencida(ficha.reserva, new Date()),
    };
  });

  if (!dados) notFound();

  const { ficha, propriedade } = dados;
  const r = ficha.reserva;
  const status = r.status as StatusReserva;
  const orcamento = r.orcamento as Orcamento;
  const falta = r.totalCentavos - ficha.pagoCentavos;
  const hoje = hojeNaPropriedade(env.TZ_PROPRIEDADE);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Etiqueta status={status} />
        <EtiquetaFnrh status={r.fnrhStatus} />
        <span className="font-mono text-sm text-tinta-suave">{r.codigo}</span>
        <span className="text-sm text-tinta-suave">
          por {ROTULO_CANAL[r.canal] ?? r.canal}
        </span>
      </div>

      <h1 className="mt-4 font-display text-4xl">{ficha.hospede.nome}</h1>
      <p className="mt-2 text-lg text-tinta-suave">
        {formatarPeriodo(r.entrada, r.saida)}
      </p>

      {dados.vencida && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-dourado bg-dourado/15 px-5 py-4 text-sm leading-relaxed"
        >
          <strong className="font-semibold">Prazo vencido.</strong> Esta
          pré-reserva deveria ter sido confirmada até{" "}
          {formatarInstante(r.expiraEm!, env.TZ_PROPRIEDADE)}. Ela ainda segura
          as noites no calendário — confirme ou cancele para liberar a data.
        </p>
      )}

      {/* --------------------------------------------------------------- */}

      <Secao titulo="A estadia">
        <div className="mt-4 rounded-xl border border-borda bg-creme-fundo">
          <Linha rotulo="Entrada">
            {formatarNoite(r.entrada)} a partir das{" "}
            {propriedade.checkinPadrao.slice(0, 5)}
            {r.horarioChegada ? ` · chega às ${r.horarioChegada}` : ""}
          </Linha>
          <Linha rotulo="Saída">
            {formatarNoite(r.saida)} até as{" "}
            {propriedade.checkoutPadrao.slice(0, 5)}
          </Linha>
          <Linha rotulo="Pessoas">
            {r.adultos} {r.adultos === 1 ? "adulto" : "adultos"}
            {r.criancas > 0 &&
              ` e ${r.criancas} ${r.criancas === 1 ? "criança" : "crianças"}`}
          </Linha>
          {r.observacoes && <Linha rotulo="Observações">{r.observacoes}</Linha>}
          {r.motivoCancelamento && (
            <Linha rotulo="Motivo do cancelamento">
              {r.motivoCancelamento}
            </Linha>
          )}
        </div>
      </Secao>

      {/* --------------------------------------------------------------- */}

      <Secao titulo="Contato">
        {vePessoal ? (
          <div className="mt-4 rounded-xl border border-borda bg-creme-fundo">
            <Linha rotulo="WhatsApp">
              {ficha.hospede.telefone ? (
                <a
                  href={`https://wa.me/${apenasDigitos(ficha.hospede.telefone)}`}
                  className="text-vinho hover:underline"
                >
                  {formatarTelefone(ficha.hospede.telefone)}
                </a>
              ) : (
                <span className="text-tinta-suave">não informado</span>
              )}
            </Linha>
            <Linha rotulo="E-mail">
              {ficha.hospede.email ?? (
                <span className="text-tinta-suave">não informado</span>
              )}
            </Linha>
            <Linha rotulo="Documento">
              {ficha.hospede.documento ?? (
                <span className="text-tinta-suave">na FNRH</span>
              )}
            </Linha>
            <Linha rotulo="Ficha do hóspede">
              <Link
                href={`/painel/hospedes/${ficha.hospede.id}`}
                className="text-vinho hover:underline"
              >
                ver histórico
              </Link>
            </Linha>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-borda bg-creme-fundo px-5 py-4 text-sm leading-relaxed text-tinta-suave">
            Contato e documento são dados pessoais, e seu perfil não tem acesso
            ao módulo de hóspedes. A reserva em si você vê inteira.
          </p>
        )}
      </Secao>

      {/* --------------------------------------------------------------- */}

      <Secao titulo="O preço, noite a noite">
        <p className="mt-2 text-sm leading-relaxed text-tinta-suave">
          Esta é a cópia congelada no momento em que a reserva foi fechada —
          mudar a tabela de tarifas depois não altera o que está aqui.
        </p>

        <ul className="mt-4 divide-y divide-borda overflow-hidden rounded-xl border border-borda">
          {orcamento.noites.map((n) => (
            <li
              key={n.noite}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-creme-fundo px-5 py-3"
            >
              <span>{formatarNoiteCurta(n.noite)}</span>
              {/*
                A REGRA primeiro, e o feriado só como contexto ao lado.
                Trocar a ordem faria a noite de 1º de janeiro — cobrada pela
                regra do Réveillon — aparecer como "Confraternização
                Universal", nomeando como origem do valor uma regra que não o
                gerou. Esta lista existe para dizer de onde saiu cada real.
              */}
              <span className="text-sm text-tinta-suave">
                {n.regraNome}
                {n.feriado && n.feriado !== n.regraNome && ` · ${n.feriado}`}
              </span>
              <span className="ml-auto font-medium">
                {formatarReais(n.precoCentavos)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl border border-borda bg-creme-fundo">
          <Linha rotulo="Soma das noites">
            {formatarReais(orcamento.subtotalNoitesCentavos)}
          </Linha>
          {orcamento.adicionalOcupacaoCentavos > 0 && (
            <Linha rotulo="Pessoas adicionais">
              {formatarReais(orcamento.adicionalOcupacaoCentavos)}
            </Linha>
          )}
          {orcamento.descontoEstadiaLongaCentavos > 0 && (
            <Linha rotulo="Desconto de estadia longa">
              − {formatarReais(orcamento.descontoEstadiaLongaCentavos)}
            </Linha>
          )}
          {orcamento.descontoManualCentavos > 0 && (
            <Linha rotulo="Desconto concedido">
              − {formatarReais(orcamento.descontoManualCentavos)}
            </Linha>
          )}
          {orcamento.extras.map((e) => (
            <Linha key={e.nome} rotulo={e.nome}>
              {formatarReais(e.valorCentavos)}
            </Linha>
          ))}
          <Linha rotulo="Total">
            <strong className="text-lg">
              {formatarReais(r.totalCentavos)}
            </strong>
          </Linha>
          <Linha rotulo="Sinal">{formatarReais(r.sinalCentavos)}</Linha>
        </div>
      </Secao>

      {/* --------------------------------------------------------------- */}

      <Secao titulo="Pagamentos">
        <div className="mt-4 rounded-xl border border-borda bg-creme-fundo">
          <Linha rotulo="Já entrou">
            {formatarReais(ficha.pagoCentavos)}
          </Linha>
          <Linha rotulo="Falta">
            {falta > 0 ? (
              <strong className="text-vinho">{formatarReais(falta)}</strong>
            ) : falta < 0 ? (
              <span className="text-mata">
                {formatarReais(-falta)} a devolver
              </span>
            ) : (
              <span className="text-mata">nada — está quitada</span>
            )}
          </Linha>
        </div>

        {ficha.pagamentos.length > 0 && (
          <ul className="mt-4 divide-y divide-borda overflow-hidden rounded-xl border border-borda">
            {ficha.pagamentos.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-creme-fundo px-5 py-3"
              >
                <span>
                  {ROTULO_PAGAMENTO[p.tipo] ?? p.tipo}
                  <span className="text-tinta-suave">
                    {" "}
                    em {ROTULO_METODO[p.metodo] ?? p.metodo}
                  </span>
                </span>
                <span className="text-sm text-tinta-suave">
                  {formatarNoite(p.data)}
                  {p.observacao ? ` · ${p.observacao}` : ""}
                </span>
                <span
                  className={`ml-auto font-medium ${
                    p.valorCentavos < 0 ? "text-vinho" : ""
                  }`}
                >
                  {formatarReais(p.valorCentavos)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {ficha.pagamentos.length > 0 && (
          <p className="mt-4">
            <a
              href={`/painel/reservas/${r.codigo}/recibo`}
              className="inline-block rounded-full border border-borda px-5 py-2.5 text-sm font-medium transition-colors hover:border-vinho/40"
            >
              Baixar recibo em PDF
            </a>
          </p>
        )}

        {podeNoModulo(sessao, "reservas", "lancar") ? (
          <FormularioDePagamento
            codigo={r.codigo}
            hoje={hoje}
            // Nada pago ainda: o lançamento esperado é o sinal. Já com
            // entrada, o que vem depois é o saldo — e sugerir "sinal" de
            // novo faria a recepção classificar errado sem perceber.
            tipoSugerido={ficha.pagoCentavos === 0 ? "sinal" : "saldo"}
            sugestaoCentavos={
              ficha.pagoCentavos === 0 ? r.sinalCentavos : Math.max(falta, 0)
            }
          />
        ) : (
          <p className="mt-4 text-sm text-tinta-suave">
            Seu perfil não lança pagamentos.
          </p>
        )}
      </Secao>

      {/* --------------------------------------------------------------- */}

      <Secao titulo="Ficha de registro (FNRH)">
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-tinta-suave">
          Obrigatória por lei para todo meio de hospedagem, e em formato
          digital desde abril de 2026. O hóspede preenche pelo celular, por um
          link com prazo; a recepção confere antes da chegada.
        </p>

        <div className="mt-4 rounded-xl border border-borda bg-creme-fundo">
          <Linha rotulo="Situação">
            <EtiquetaFnrh status={r.fnrhStatus} />
          </Linha>
          {r.fnrhExpiraEm && r.fnrhStatus !== "nao_enviada" && (
            <Linha rotulo="Link vale até">
              {formatarInstante(r.fnrhExpiraEm, env.TZ_PROPRIEDADE)}
            </Linha>
          )}
          {vePessoal && (
            <>
              <Linha rotulo="Documento do titular">
                {ficha.hospede.documento ?? (
                  <span className="text-tinta-suave">ainda não informado</span>
                )}
              </Linha>
              <Linha rotulo="Acompanhantes">
                {ficha.acompanhantes.length === 0 ? (
                  <span className="text-tinta-suave">nenhum registrado</span>
                ) : (
                  ficha.acompanhantes.map((a) => a.nome).join(", ")
                )}
              </Linha>
              <Linha rotulo="Consentimento (LGPD)">
                {ficha.hospede.aceiteLgpdEm ? (
                  formatarInstante(ficha.hospede.aceiteLgpdEm, env.TZ_PROPRIEDADE)
                ) : (
                  <span className="text-tinta-suave">ainda não dado</span>
                )}
              </Linha>
            </>
          )}
        </div>

        {podeNoModulo(sessao, "reservas", "lancar") ? (
          <AcoesDaFnrh codigo={r.codigo} status={r.fnrhStatus} />
        ) : (
          <p className="mt-4 text-sm text-tinta-suave">
            Seu perfil não envia nem confere fichas.
          </p>
        )}
      </Secao>

      {/* --------------------------------------------------------------- */}

      <Secao titulo="O que fazer agora">
        <BotoesDeStatus codigo={r.codigo} destinos={destinosDe(status)} />

        {podeNoModulo(sessao, "reservas", "editar") &&
          seguraNoites(status) &&
          status !== "concluida" && (
            <Variacoes
              codigo={r.codigo}
              entrada={r.entrada}
              saida={r.saida}
              unidadeId={r.unidadeId}
              unidades={dados.unidades.map((u) => ({ id: u.id, nome: u.nome }))}
              hospedado={status === "hospedado"}
              podeDevolver={dados.devolveNaSaidaAntecipada}
            />
          )}
      </Secao>

      <p className="mt-12">
        <Link href="/painel/reservas" className="text-vinho hover:underline">
          ← todas as reservas
        </Link>
      </p>
    </>
  );
}

export type { ReservaCompleta };
