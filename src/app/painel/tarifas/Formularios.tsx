"use client";

import { useActionState } from "react";

import {
  type EstadoDasTarifas,
  salvarCondicoesDaCasa,
  salvarPolitica,
  salvarRegraEstadia,
  salvarRegraTarifa,
} from "./acoes";

const CAMPO = "mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-2.5";
const BOTAO =
  "rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50";

function Recado({ estado }: { estado: EstadoDasTarifas }) {
  if (!estado) return null;
  if (estado.erro) {
    return (
      <p
        role="alert"
        className="mb-4 rounded-lg border border-vinho/30 bg-vinho/5 px-4 py-3 text-sm leading-relaxed text-vinho"
      >
        {estado.erro}
      </p>
    );
  }
  if (estado.aviso) {
    return (
      <p
        role="status"
        className="mb-4 rounded-lg border border-mata/30 bg-mata/5 px-4 py-3 text-sm leading-relaxed text-mata"
      >
        {estado.aviso}
      </p>
    );
  }
  return null;
}

/** Em reais, com vírgula, como a pessoa digita. Vazio = sem este preço. */
function emReais(centavos: number | null): string {
  if (centavos === null) return "";
  return (centavos / 100).toFixed(2).replace(".", ",");
}

export type RegraNaTela = {
  id: string;
  nome: string;
  nivel: string;
  precoSemanaCentavos: number | null;
  precoFimDeSemanaCentavos: number | null;
  precoFixoCentavos: number | null;
  ajustePontosBase: number | null;
  valorPessoaExtraCentavos: number | null;
  valorCriancaCentavos: number | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  ativa: boolean;
};

export function FormularioDeRegra({ regra }: { regra: RegraNaTela }) {
  const [estado, agir, pendente] = useActionState<EstadoDasTarifas, FormData>(
    salvarRegraTarifa,
    null,
  );

  // Padrão e temporada cobram por dia da semana; feriado e período especial
  // têm preço fixo da noite. Mostrar os campos que a regra não usa convidaria
  // a preencher um que o motor ignora.
  const porDiaDaSemana = regra.nivel === "padrao" || regra.nivel === "temporada";

  return (
    <form action={agir} className="rounded-xl border border-borda bg-creme-fundo px-5 py-5">
      <input type="hidden" name="id" value={regra.id} />

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-medium">{regra.nome}</h3>
        <span className="rounded-full bg-dourado/25 px-2.5 py-0.5 text-xs">
          {regra.nivel}
        </span>
        {regra.vigenciaInicio && (
          <span className="text-xs text-tinta-suave">
            {regra.vigenciaInicio} a {regra.vigenciaFim}
          </span>
        )}
        {!regra.ativa && (
          <span className="rounded-full bg-creme px-2.5 py-0.5 text-xs text-tinta-suave">
            inativa
          </span>
        )}
      </div>

      <Recado estado={estado} />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {porDiaDaSemana ? (
          <>
            <div>
              <label
                htmlFor={`semana-${regra.id}`}
                className="block text-sm font-medium"
              >
                Diária de semana
              </label>
              <input
                id={`semana-${regra.id}`}
                name="precoSemana"
                inputMode="decimal"
                defaultValue={emReais(regra.precoSemanaCentavos)}
                placeholder="543,00"
                className={CAMPO}
              />
            </div>
            <div>
              <label
                htmlFor={`fds-${regra.id}`}
                className="block text-sm font-medium"
              >
                Diária de fim de semana
              </label>
              <input
                id={`fds-${regra.id}`}
                name="precoFimDeSemana"
                inputMode="decimal"
                defaultValue={emReais(regra.precoFimDeSemanaCentavos)}
                placeholder="750,00"
                className={CAMPO}
              />
              <p className="mt-1.5 text-xs text-tinta-suave">
                Vale nas noites de sexta e de sábado.
              </p>
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <label
              htmlFor={`fixo-${regra.id}`}
              className="block text-sm font-medium"
            >
              Preço da noite
            </label>
            <input
              id={`fixo-${regra.id}`}
              name="precoFixo"
              inputMode="decimal"
              defaultValue={emReais(regra.precoFixoCentavos)}
              placeholder="1.375,00"
              className={CAMPO}
            />
            {regra.ajustePontosBase !== null && (
              <p className="mt-1.5 text-xs text-vinho">
                Esta regra está com ajuste de {regra.ajustePontosBase / 100}%
                sobre a tarifa de baixo. Pôr um preço aqui exige zerar o ajuste
                — são alternativas, não somam.
              </p>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor={`extra-${regra.id}`}
            className="block text-sm font-medium"
          >
            Por pessoa adicional
          </label>
          <input
            id={`extra-${regra.id}`}
            name="pessoaExtra"
            inputMode="decimal"
            defaultValue={emReais(regra.valorPessoaExtraCentavos)}
            placeholder="110,00"
            className={CAMPO}
          />
          <p className="mt-1.5 text-xs text-tinta-suave">
            Por noite, além da ocupação base.
          </p>
        </div>
        <div>
          <label
            htmlFor={`crianca-${regra.id}`}
            className="block text-sm font-medium"
          >
            Por criança
          </label>
          <input
            id={`crianca-${regra.id}`}
            name="crianca"
            inputMode="decimal"
            defaultValue={emReais(regra.valorCriancaCentavos)}
            placeholder="55,00"
            className={CAMPO}
          />
          <p className="mt-1.5 text-xs text-tinta-suave">
            De 5 a 9 anos, que pagam meia.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="ativa"
              defaultChecked={regra.ativa}
              className="size-4 accent-vinho"
            />
            Regra ativa
          </label>
          <p className="mt-1.5 text-xs text-tinta-suave">
            Desligada, o motor passa para a tarifa de baixo nessas datas.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pendente}
        className={`${BOTAO} mt-5 bg-vinho text-creme hover:bg-vinho-escuro`}
      >
        {pendente ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}

export function CondicoesDaCasa({
  sinalPercentual,
  checkin,
  checkout,
  emailContato,
  whatsappContato,
}: {
  sinalPercentual: number;
  checkin: string;
  checkout: string;
  emailContato: string | null;
  whatsappContato: string | null;
}) {
  const [estado, agir, pendente] = useActionState<EstadoDasTarifas, FormData>(
    salvarCondicoesDaCasa,
    null,
  );

  return (
    <form action={agir} className="mt-6">
      <Recado estado={estado} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sinalPercentual" className="block text-sm font-medium">
            Sinal (%)
          </label>
          <input
            id="sinalPercentual"
            name="sinalPercentual"
            type="number"
            min={0}
            max={100}
            step="0.5"
            required
            defaultValue={sinalPercentual}
            className={CAMPO}
          />
          <p className="mt-1.5 text-xs text-tinta-suave">
            Cobrado no ato da reserva; o restante no check-in.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="checkin" className="block text-sm font-medium">
              Check-in
            </label>
            <input
              id="checkin"
              name="checkin"
              type="time"
              required
              defaultValue={checkin}
              className={CAMPO}
            />
          </div>
          <div>
            <label htmlFor="checkout" className="block text-sm font-medium">
              Check-out
            </label>
            <input
              id="checkout"
              name="checkout"
              type="time"
              required
              defaultValue={checkout}
              className={CAMPO}
            />
          </div>
        </div>

        <div>
          <label htmlFor="emailContato" className="block text-sm font-medium">
            E-mail que recebe os avisos
          </label>
          <input
            id="emailContato"
            name="emailContato"
            type="email"
            defaultValue={emailContato ?? ""}
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="whatsappContato" className="block text-sm font-medium">
            WhatsApp da recepção
          </label>
          <input
            id="whatsappContato"
            name="whatsappContato"
            inputMode="tel"
            defaultValue={whatsappContato ?? ""}
            placeholder="5562999999999"
            className={CAMPO}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pendente}
        className={`${BOTAO} mt-5 bg-vinho text-creme hover:bg-vinho-escuro`}
      >
        {pendente ? "Salvando…" : "Salvar condições"}
      </button>
    </form>
  );
}

export type EstadiaNaTela = {
  id: string;
  nome: string;
  minimoDiarias: number | null;
  maximoDiarias: number | null;
  intervaloLimpezaNoites: number | null;
  somenteEmFeriado: boolean;
};

export function FormularioDeEstadia({ regra }: { regra: EstadiaNaTela }) {
  const [estado, agir, pendente] = useActionState<EstadoDasTarifas, FormData>(
    salvarRegraEstadia,
    null,
  );

  return (
    <form
      action={agir}
      className="rounded-xl border border-borda bg-creme-fundo px-5 py-5"
    >
      <input type="hidden" name="id" value={regra.id} />

      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-medium">{regra.nome}</h3>
        {regra.somenteEmFeriado && (
          <span className="rounded-full bg-dourado/25 px-2.5 py-0.5 text-xs">
            só em feriado
          </span>
        )}
      </div>

      <Recado estado={estado} />

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label
            htmlFor={`min-${regra.id}`}
            className="block text-sm font-medium"
          >
            Mínimo de noites
          </label>
          <input
            id={`min-${regra.id}`}
            name="minimoDiarias"
            type="number"
            min={0}
            max={365}
            defaultValue={regra.minimoDiarias ?? ""}
            className={CAMPO}
          />
        </div>
        <div>
          <label
            htmlFor={`max-${regra.id}`}
            className="block text-sm font-medium"
          >
            Máximo
          </label>
          <input
            id={`max-${regra.id}`}
            name="maximoDiarias"
            type="number"
            min={0}
            max={365}
            defaultValue={regra.maximoDiarias ?? ""}
            className={CAMPO}
          />
        </div>
        <div>
          <label
            htmlFor={`limpeza-${regra.id}`}
            className="block text-sm font-medium"
          >
            Folga de limpeza
          </label>
          <input
            id={`limpeza-${regra.id}`}
            name="intervaloLimpezaNoites"
            type="number"
            min={0}
            max={365}
            defaultValue={regra.intervaloLimpezaNoites ?? ""}
            className={CAMPO}
          />
          <p className="mt-1.5 text-xs text-tinta-suave">
            Noites entre uma saída e a entrada seguinte.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pendente}
        className={`${BOTAO} mt-5 bg-vinho text-creme hover:bg-vinho-escuro`}
      >
        {pendente ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}

export function PoliticaDeCancelamento({
  diasAntes,
  percentualDevolvido,
  saidaAntecipadaPercentual,
}: {
  diasAntes: number;
  percentualDevolvido: number;
  saidaAntecipadaPercentual: number;
}) {
  const [estado, agir, pendente] = useActionState<EstadoDasTarifas, FormData>(
    salvarPolitica,
    null,
  );

  return (
    <form action={agir} className="mt-6">
      <Recado estado={estado} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="diasAntes" className="block text-sm font-medium">
            Antecedência (dias)
          </label>
          <input
            id="diasAntes"
            name="diasAntes"
            type="number"
            min={0}
            max={365}
            required
            defaultValue={diasAntes}
            className={CAMPO}
          />
        </div>
        <div>
          <label
            htmlFor="percentualDevolvido"
            className="block text-sm font-medium"
          >
            Devolve (%)
          </label>
          <input
            id="percentualDevolvido"
            name="percentualDevolvido"
            type="number"
            min={0}
            max={100}
            step="1"
            required
            defaultValue={percentualDevolvido}
            className={CAMPO}
          />
        </div>
        <div>
          <label
            htmlFor="saidaAntecipadaPercentual"
            className="block text-sm font-medium"
          >
            Saída antecipada (%)
          </label>
          <input
            id="saidaAntecipadaPercentual"
            name="saidaAntecipadaPercentual"
            type="number"
            min={0}
            max={100}
            step="1"
            required
            defaultValue={saidaAntecipadaPercentual}
            className={CAMPO}
          />
        </div>
      </div>

      <p className="mt-3 max-w-prose text-sm leading-relaxed text-tinta-suave">
        Cancelando com essa antecedência ou mais, devolve-se o percentual do que
        foi pago. Abaixo dela, nada, salvo força maior. A saída antecipada é
        separada e hoje devolve {saidaAntecipadaPercentual}%: quem já está
        hospedado e decide ir embora avisou com zero dias.
      </p>

      <button
        type="submit"
        disabled={pendente}
        className={`${BOTAO} mt-5 bg-vinho text-creme hover:bg-vinho-escuro`}
      >
        {pendente ? "Salvando…" : "Salvar política"}
      </button>
    </form>
  );
}
