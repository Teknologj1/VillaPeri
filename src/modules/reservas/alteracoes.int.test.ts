import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { fecharConexao } from "@/db/client";
import * as schema from "@/db/schema";
import { withTenant } from "@/db/tenant";
import {
  anfitriao,
  propriedade,
  tipoAcomodacao,
  unidade,
} from "@/modules/anfitriao/schema";
import { auditoria } from "@/modules/auditoria/schema";
import { NoiteIndisponivelError } from "@/modules/calendario";
import { noiteOcupada } from "@/modules/calendario/schema";
import { notificacao } from "@/modules/notificacoes/schema";
import { politicaCancelamento, regraTarifa } from "@/modules/tarifas/schema";

import { AlteracaoInvalidaError, remarcar, saidaAntecipada } from "./alteracoes";
import { hospede, pagamento, reserva, solicitacao } from "./schema";
import { criarReserva, mudarStatus } from "./service";

config({ path: [".env.local", ".env"], quiet: true });

const clienteOwner = postgres(process.env.DATABASE_URL_MIGRATOR!, { max: 5 });
const dbOwner = drizzle(clienteOwner, { schema });

const NOME = "__teste_alteracoes";
const AUTOR = { tipo: "sistema" } as const;

const SEMANA = 54_300;
const FDS = 75_000;

let anfitriaoId: string;
let tipoId: string;
let tipoAlternativoId: string;
let unidadeA = "";
let unidadeB = "";
let unidadeDeOutroTipo = "";

async function limpar() {
  const [a] = await dbOwner
    .select()
    .from(anfitriao)
    .where(eq(anfitriao.nome, NOME))
    .limit(1);
  if (!a) return;
  for (const t of [
    notificacao,
    auditoria,
    noiteOcupada,
    pagamento,
    reserva,
    solicitacao,
    hospede,
    regraTarifa,
    politicaCancelamento,
    unidade,
    tipoAcomodacao,
    propriedade,
  ]) {
    await dbOwner.delete(t).where(eq(t.anfitriaoId, a.id));
  }
  await dbOwner.delete(anfitriao).where(eq(anfitriao.id, a.id));
}

beforeAll(async () => {
  await limpar();

  const [a] = await dbOwner
    .insert(anfitriao)
    .values({ nome: NOME, status: "ativa" })
    .returning();
  anfitriaoId = a!.id;

  const [p] = await dbOwner
    .insert(propriedade)
    .values({ anfitriaoId, nome: "Casa de teste", sinalPontosBase: 3_000 })
    .returning();

  const [t] = await dbOwner
    .insert(tipoAcomodacao)
    .values({
      anfitriaoId,
      propriedadeId: p!.id,
      nome: "Casa inteira",
      slug: "casa-teste-alteracoes",
      capacidade: 11,
      modoPreco: "ocupacao",
      ocupacaoBase: 4,
    })
    .returning();
  tipoId = t!.id;

  const [t2] = await dbOwner
    .insert(tipoAcomodacao)
    .values({
      anfitriaoId,
      propriedadeId: p!.id,
      nome: "Chalé",
      slug: "chale-teste-alteracoes",
      capacidade: 4,
      modoPreco: "ocupacao",
      ocupacaoBase: 2,
    })
    .returning();
  tipoAlternativoId = t2!.id;

  const us = await dbOwner
    .insert(unidade)
    .values([
      { anfitriaoId, tipoId, nome: "Casa 1" },
      { anfitriaoId, tipoId, nome: "Casa 2" },
      { anfitriaoId, tipoId: tipoAlternativoId, nome: "Chalé 1" },
    ])
    .returning();
  unidadeA = us[0]!.id;
  unidadeB = us[1]!.id;
  unidadeDeOutroTipo = us[2]!.id;

  await dbOwner.insert(regraTarifa).values({
    anfitriaoId,
    propriedadeId: p!.id,
    nome: "Diária padrão",
    nivel: "padrao",
    precoSemanaCentavos: SEMANA,
    precoFimDeSemanaCentavos: FDS,
    valorPessoaExtraCentavos: 11_000,
  });

  await dbOwner.insert(politicaCancelamento).values({
    anfitriaoId,
    nome: "Padrão",
    faixas: [{ diasAntes: 7, percentualPontosBase: 10_000 }],
    // O padrão da casa: estadia inteira, sem devolução por saída antecipada.
    saidaAntecipadaPontosBase: 0,
    padrao: true,
  });
});

beforeEach(async () => {
  for (const t of [notificacao, noiteOcupada, pagamento, reserva]) {
    await dbOwner.delete(t).where(eq(t.anfitriaoId, anfitriaoId));
  }
  await dbOwner.delete(hospede).where(eq(hospede.anfitriaoId, anfitriaoId));
  await dbOwner
    .update(politicaCancelamento)
    .set({ saidaAntecipadaPontosBase: 0 })
    .where(eq(politicaCancelamento.anfitriaoId, anfitriaoId));
});

afterAll(async () => {
  await limpar();
  await clienteOwner.end();
  await fecharConexao();
});

/** Segunda a quarta: duas noites de semana. */
const ENTRADA = "2027-03-08";
const SAIDA = "2027-03-10";

async function reservar(
  ajustes: { entrada?: string; saida?: string; unidadeId?: string; nome?: string } = {},
) {
  return withTenant(anfitriaoId, (tx) =>
    criarReserva(tx, anfitriaoId, {
      unidadeId: ajustes.unidadeId ?? unidadeA,
      tipoId,
      entrada: ajustes.entrada ?? ENTRADA,
      saida: ajustes.saida ?? SAIDA,
      adultos: 4,
      criancas: 0,
      hospede: { nome: ajustes.nome ?? "Maria", telefone: `6298800${Math.floor(Math.random() * 9000) + 1000}` },
      autor: AUTOR,
    }),
  );
}

async function noitesDe(reservaId: string) {
  const linhas = await dbOwner
    .select()
    .from(noiteOcupada)
    .where(eq(noiteOcupada.origemId, reservaId));
  return linhas.map((n) => n.noite).sort();
}

// ---------------------------------------------------------------------------

describe("remarcar datas", () => {
  it("troca as noites e recalcula pelo preço do dia da alteração", async () => {
    const r = await reservar();
    expect(r.totalCentavos).toBe(SEMANA * 2);

    // Sexta e sábado: duas noites de fim de semana.
    const resultado = await withTenant(anfitriaoId, (tx) =>
      remarcar(tx, anfitriaoId, r.id, {
        entrada: "2027-03-12",
        saida: "2027-03-14",
        autor: AUTOR,
      }),
    );

    expect(resultado.recalculou).toBe(true);
    expect(resultado.totalCentavos).toBe(FDS * 2);
    expect(resultado.diferencaCentavos).toBe(FDS * 2 - SEMANA * 2);

    expect(await noitesDe(r.id)).toEqual(["2027-03-12", "2027-03-13"]);
  });

  it("estende a estadia: as noites próprias não conflitam consigo mesmas", async () => {
    // Soltar antes de tomar, na mesma transação, é o que faz isto funcionar.
    const r = await reservar();

    const resultado = await withTenant(anfitriaoId, (tx) =>
      remarcar(tx, anfitriaoId, r.id, { saida: "2027-03-12", autor: AUTOR }),
    );

    expect(await noitesDe(r.id)).toEqual([
      "2027-03-08",
      "2027-03-09",
      "2027-03-10",
      "2027-03-11",
    ]);
    expect(resultado.totalCentavos).toBeGreaterThan(SEMANA * 2);
  });

  it("não estende por cima de reserva alheia — e nada muda", async () => {
    const minha = await reservar();
    await reservar({
      entrada: "2027-03-11",
      saida: "2027-03-13",
      nome: "Outro",
    });

    await expect(
      withTenant(anfitriaoId, (tx) =>
        remarcar(tx, anfitriaoId, minha.id, { saida: "2027-03-13", autor: AUTOR }),
      ),
    ).rejects.toBeInstanceOf(NoiteIndisponivelError);

    // A transação inteira foi desfeita: a reserva continua com as noites que
    // tinha, em vez de ficar sem nenhuma.
    expect(await noitesDe(minha.id)).toEqual(["2027-03-08", "2027-03-09"]);
    const [depois] = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.id, minha.id));
    expect(depois!.saida).toBe(SAIDA);
  });
});

// ---------------------------------------------------------------------------

describe("trocar de unidade", () => {
  it("no mesmo tipo, MANTÉM o preço", async () => {
    // Unidades do mesmo tipo são equivalentes. Recalcular daria um número
    // diferente só porque a tabela mudou desde a reserva, e o hóspede
    // pagaria pela mudança de quarto.
    const r = await reservar();

    // A tarifa sobe depois da reserva.
    await dbOwner
      .update(regraTarifa)
      .set({ precoSemanaCentavos: SEMANA * 2 })
      .where(eq(regraTarifa.anfitriaoId, anfitriaoId));

    const resultado = await withTenant(anfitriaoId, (tx) =>
      remarcar(tx, anfitriaoId, r.id, { unidadeId: unidadeB, autor: AUTOR }),
    );

    expect(resultado.recalculou).toBe(false);
    expect(resultado.totalCentavos).toBe(SEMANA * 2);
    expect(resultado.diferencaCentavos).toBe(0);

    // As noites mudaram de unidade, mas são as mesmas datas.
    const linhas = await dbOwner
      .select()
      .from(noiteOcupada)
      .where(eq(noiteOcupada.origemId, r.id));
    expect(linhas.every((n) => n.unidadeId === unidadeB)).toBe(true);
    expect(linhas).toHaveLength(2);

    await dbOwner
      .update(regraTarifa)
      .set({ precoSemanaCentavos: SEMANA })
      .where(eq(regraTarifa.anfitriaoId, anfitriaoId));
  });

  it("para outro tipo, recalcula", async () => {
    const r = await reservar();

    const resultado = await withTenant(anfitriaoId, (tx) =>
      remarcar(tx, anfitriaoId, r.id, {
        unidadeId: unidadeDeOutroTipo,
        autor: AUTOR,
      }),
    );

    expect(resultado.recalculou).toBe(true);

    const [depois] = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.id, r.id));
    expect(depois!.tipoId).toBe(tipoAlternativoId);
    // O chalé tem ocupação base 2, então 4 adultos pagam duas pessoas extras.
    expect(resultado.totalCentavos).toBeGreaterThan(SEMANA * 2);
  });
});

// ---------------------------------------------------------------------------

describe("o que não se remarca", () => {
  it("recusa reserva cancelada", async () => {
    const r = await reservar();
    await withTenant(anfitriaoId, (tx) =>
      mudarStatus(tx, anfitriaoId, r.id, "cancelada", {
        autor: AUTOR,
        motivo: "teste",
        hojeNaCasa: "2027-03-01",
      }),
    );

    await expect(
      withTenant(anfitriaoId, (tx) =>
        remarcar(tx, anfitriaoId, r.id, { saida: "2027-03-12", autor: AUTOR }),
      ),
    ).rejects.toThrow(AlteracaoInvalidaError);
  });

  it("recusa estadia já concluída — mudaria o histórico da casa", async () => {
    const r = await reservar();
    for (const passo of ["confirmada", "hospedado", "concluida"] as const) {
      await withTenant(anfitriaoId, (tx) =>
        mudarStatus(tx, anfitriaoId, r.id, passo, { autor: AUTOR }),
      );
    }

    await expect(
      withTenant(anfitriaoId, (tx) =>
        remarcar(tx, anfitriaoId, r.id, { saida: "2027-03-12", autor: AUTOR }),
      ),
    ).rejects.toThrow(/histórico/);
  });

  it("recusa período invertido e pedido sem mudança", async () => {
    const r = await reservar();

    await expect(
      withTenant(anfitriaoId, (tx) =>
        remarcar(tx, anfitriaoId, r.id, {
          entrada: "2027-03-10",
          saida: "2027-03-08",
          autor: AUTOR,
        }),
      ),
    ).rejects.toThrow(/depois da entrada/);

    await expect(
      withTenant(anfitriaoId, (tx) =>
        remarcar(tx, anfitriaoId, r.id, { saida: SAIDA, autor: AUTOR }),
      ),
    ).rejects.toThrow(/Nada mudou/);
  });
});

// ---------------------------------------------------------------------------

describe("saída antecipada", () => {
  async function hospedado(saida = "2027-03-13") {
    const r = await reservar({ saida });
    for (const passo of ["confirmada", "hospedado"] as const) {
      await withTenant(anfitriaoId, (tx) =>
        mudarStatus(tx, anfitriaoId, r.id, passo, { autor: AUTOR }),
      );
    }
    return r;
  }

  it("por padrão COBRA A ESTADIA INTEIRA e não devolve nada", async () => {
    // A decisão do proprietário, e coerente com o resto: cancelamento exige
    // uma semana de antecedência para haver devolução, e quem vai embora
    // antes avisou com zero dias.
    const r = await hospedado();
    const totalContratado = r.totalCentavos;

    const resultado = await withTenant(anfitriaoId, (tx) =>
      saidaAntecipada(tx, anfitriaoId, r.id, "2027-03-10", AUTOR),
    );

    expect(resultado.noitesLiberadas).toBe(3);
    expect(resultado.valorDasNoitesLiberadasCentavos).toBeGreaterThan(0);
    expect(resultado.devolucaoCentavos).toBe(0);
    expect(resultado.totalCentavos).toBe(totalContratado);
    expect(resultado.diferencaCentavos).toBe(0);
  });

  it("libera as noites não usadas: a casa volta a vender", async () => {
    // Mesmo sem devolver nada, o calendário tem de dizer a verdade — senão a
    // limpeza não é agendada e a noite seguinte não é vendida.
    const r = await hospedado();
    expect(await noitesDe(r.id)).toHaveLength(5);

    await withTenant(anfitriaoId, (tx) =>
      saidaAntecipada(tx, anfitriaoId, r.id, "2027-03-10", AUTOR),
    );

    expect(await noitesDe(r.id)).toEqual(["2027-03-08", "2027-03-09"]);

    // E outra reserva já consegue pegar as noites liberadas.
    const nova = await reservar({
      entrada: "2027-03-10",
      saida: "2027-03-12",
      nome: "Quem chegou depois",
    });
    expect(await noitesDe(nova.id)).toEqual(["2027-03-10", "2027-03-11"]);
  });

  it("o orçamento guarda as noites não usadas, marcadas como cobradas", async () => {
    // Apagá-las esconderia o que foi contratado e cobrado — e é justamente
    // isso que o hóspede vai conferir no recibo.
    const r = await hospedado();
    await withTenant(anfitriaoId, (tx) =>
      saidaAntecipada(tx, anfitriaoId, r.id, "2027-03-10", AUTOR),
    );

    const [depois] = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.id, r.id));
    const orcamento = depois!.orcamento as { noites: { regraNome: string }[] };

    expect(orcamento.noites).toHaveLength(5);
    expect(
      orcamento.noites.filter((n) => n.regraNome.includes("não usada")),
    ).toHaveLength(3);
  });

  it("com a política mudada para devolver, devolve", async () => {
    // O percentual é coluna, não constante: muda sem programador.
    await dbOwner
      .update(politicaCancelamento)
      .set({ saidaAntecipadaPontosBase: 10_000 })
      .where(eq(politicaCancelamento.anfitriaoId, anfitriaoId));

    const r = await hospedado();
    const resultado = await withTenant(anfitriaoId, (tx) =>
      saidaAntecipada(tx, anfitriaoId, r.id, "2027-03-10", AUTOR),
    );

    expect(resultado.devolucaoCentavos).toBe(
      resultado.valorDasNoitesLiberadasCentavos,
    );
    expect(resultado.totalCentavos).toBe(
      r.totalCentavos - resultado.valorDasNoitesLiberadasCentavos,
    );
  });

  it("só vale para quem está na casa", async () => {
    const r = await reservar({ saida: "2027-03-13" });
    await expect(
      withTenant(anfitriaoId, (tx) =>
        saidaAntecipada(tx, anfitriaoId, r.id, "2027-03-10", AUTOR),
      ),
    ).rejects.toThrow(/na casa/);
  });

  it("recusa data que não antecipa nada, e a que zera a estadia", async () => {
    const r = await hospedado();

    await expect(
      withTenant(anfitriaoId, (tx) =>
        saidaAntecipada(tx, anfitriaoId, r.id, "2027-03-14", AUTOR),
      ),
    ).rejects.toThrow(/antes da que está marcada/);

    await expect(
      withTenant(anfitriaoId, (tx) =>
        saidaAntecipada(tx, anfitriaoId, r.id, ENTRADA, AUTOR),
      ),
    ).rejects.toThrow(/cancelamento/);
  });
});
