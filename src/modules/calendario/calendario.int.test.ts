import { randomUUID } from "node:crypto";

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

import { BloqueioEmConflitoError, NoiteIndisponivelError } from "./erros";
import { liberarNoitesPorOrigem, ocuparNoites } from "./repo";
import { bloqueio, noiteOcupada } from "./schema";
import { fecharDatas } from "./service";

config({ path: [".env.local", ".env"], quiet: true });

const urlOwner = process.env.DATABASE_URL_MIGRATOR;
if (!urlOwner) throw new Error("DATABASE_URL_MIGRATOR é necessária nos testes.");
const clienteOwner = postgres(urlOwner, { max: 5 });
const dbOwner = drizzle(clienteOwner, { schema });

const NOME = "__teste_calendario";
let anfitriaoId: string;
let propriedadeId: string;
let tipoId: string;
let unidadeA: string;
let unidadeB: string;

/**
 * Apaga o cenário na ordem das chaves estrangeiras: filhos antes dos pais.
 * Sem isso a limpeza falha com violação de referência e o teste seguinte
 * encontra um banco sujo.
 */
async function limparCenario() {
  const [a] = await dbOwner
    .select()
    .from(anfitriao)
    .where(eq(anfitriao.nome, NOME))
    .limit(1);
  if (!a) return;

  await dbOwner.delete(noiteOcupada).where(eq(noiteOcupada.anfitriaoId, a.id));
  await dbOwner.delete(bloqueio).where(eq(bloqueio.anfitriaoId, a.id));
  await dbOwner.delete(unidade).where(eq(unidade.anfitriaoId, a.id));
  await dbOwner.delete(tipoAcomodacao).where(eq(tipoAcomodacao.anfitriaoId, a.id));
  await dbOwner.delete(propriedade).where(eq(propriedade.anfitriaoId, a.id));
  await dbOwner.delete(anfitriao).where(eq(anfitriao.id, a.id));
}

beforeAll(async () => {
  await limparCenario();

  const [a] = await dbOwner
    .insert(anfitriao)
    .values({ nome: NOME, status: "ativa" })
    .returning();
  anfitriaoId = a!.id;

  const [p] = await dbOwner
    .insert(propriedade)
    .values({ anfitriaoId, nome: "Casa de teste" })
    .returning();
  propriedadeId = p!.id;

  const [t] = await dbOwner
    .insert(tipoAcomodacao)
    .values({
      anfitriaoId,
      propriedadeId,
      nome: "Chalé de teste",
      slug: "chale-teste",
      capacidade: 4,
    })
    .returning();
  tipoId = t!.id;

  const us = await dbOwner
    .insert(unidade)
    .values([
      { anfitriaoId, tipoId, nome: "Teste 1" },
      { anfitriaoId, tipoId, nome: "Teste 2" },
    ])
    .returning();
  unidadeA = us[0]!.id;
  unidadeB = us[1]!.id;
});

beforeEach(async () => {
  await dbOwner.delete(noiteOcupada).where(eq(noiteOcupada.anfitriaoId, anfitriaoId));
});

afterAll(async () => {
  await limparCenario();
  await clienteOwner.end();
  await fecharConexao();
});

async function noitesDaUnidade(unidadeId: string) {
  const linhas = await dbOwner
    .select()
    .from(noiteOcupada)
    .where(eq(noiteOcupada.unidadeId, unidadeId));
  return linhas.map((l) => l.noite).sort();
}

describe("a chave única impede overbooking", () => {
  it("duas reservas simultâneas na mesma noite: exatamente uma passa", async () => {
    // O teste central do sistema. Não há `await` entre uma e outra de
    // propósito: as duas transações correm ao mesmo tempo, em conexões
    // diferentes, disputando a mesma linha — que é o que acontece quando a
    // recepção e a RIIA fecham a mesma data no mesmo segundo.
    const noites = [{ noite: "2027-02-10" }, { noite: "2027-02-11" }];

    const resultados = await Promise.allSettled([
      withTenant(anfitriaoId, (tx) =>
        ocuparNoites(tx, {
          anfitriaoId,
          unidadeId: unidadeA,
          origem: "reserva",
          origemId: randomUUID(),
          noites,
        }),
      ),
      withTenant(anfitriaoId, (tx) =>
        ocuparNoites(tx, {
          anfitriaoId,
          unidadeId: unidadeA,
          origem: "reserva",
          origemId: randomUUID(),
          noites,
        }),
      ),
    ]);

    const ok = resultados.filter((r) => r.status === "fulfilled");
    const falhas = resultados.filter((r) => r.status === "rejected");

    expect(ok).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect(falhas[0]!.reason).toBeInstanceOf(NoiteIndisponivelError);

    // E o calendário ficou com UMA reserva, não com duas nem com meia.
    expect(await noitesDaUnidade(unidadeA)).toEqual(["2027-02-10", "2027-02-11"]);
  });

  it("a transação que falha não deixa noite nenhuma para trás", async () => {
    // A segunda reserva pede 3 noites, só a última em conflito. Como é uma
    // transação, ou entram as três ou nenhuma — senão o calendário ficaria
    // com uma reserva parcial, que é pior que recusar.
    await withTenant(anfitriaoId, (tx) =>
      ocuparNoites(tx, {
        anfitriaoId,
        unidadeId: unidadeA,
        origem: "reserva",
        origemId: randomUUID(),
        noites: [{ noite: "2027-03-05" }],
      }),
    );

    await expect(
      withTenant(anfitriaoId, (tx) =>
        ocuparNoites(tx, {
          anfitriaoId,
          unidadeId: unidadeA,
          origem: "reserva",
          origemId: randomUUID(),
          noites: [
            { noite: "2027-03-03" },
            { noite: "2027-03-04" },
            { noite: "2027-03-05" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(NoiteIndisponivelError);

    expect(await noitesDaUnidade(unidadeA)).toEqual(["2027-03-05"]);
  });

  it("unidades diferentes não disputam a mesma noite", async () => {
    const noites = [{ noite: "2027-04-01" }];
    await Promise.all([
      withTenant(anfitriaoId, (tx) =>
        ocuparNoites(tx, {
          anfitriaoId,
          unidadeId: unidadeA,
          origem: "reserva",
          origemId: randomUUID(),
          noites,
        }),
      ),
      withTenant(anfitriaoId, (tx) =>
        ocuparNoites(tx, {
          anfitriaoId,
          unidadeId: unidadeB,
          origem: "reserva",
          origemId: randomUUID(),
          noites,
        }),
      ),
    ]);

    expect(await noitesDaUnidade(unidadeA)).toEqual(["2027-04-01"]);
    expect(await noitesDaUnidade(unidadeB)).toEqual(["2027-04-01"]);
  });

  it("libera as noites ao cancelar, e a data volta a vender", async () => {
    const reservaId = randomUUID();
    await withTenant(anfitriaoId, (tx) =>
      ocuparNoites(tx, {
        anfitriaoId,
        unidadeId: unidadeA,
        origem: "reserva",
        origemId: reservaId,
        noites: [{ noite: "2027-05-01" }],
      }),
    );

    await withTenant(anfitriaoId, (tx) =>
      liberarNoitesPorOrigem(tx, "reserva", reservaId),
    );
    expect(await noitesDaUnidade(unidadeA)).toEqual([]);

    await withTenant(anfitriaoId, (tx) =>
      ocuparNoites(tx, {
        anfitriaoId,
        unidadeId: unidadeA,
        origem: "reserva",
        origemId: randomUUID(),
        noites: [{ noite: "2027-05-01" }],
      }),
    );
    expect(await noitesDaUnidade(unidadeA)).toEqual(["2027-05-01"]);
  });
});

describe("fechar datas", () => {
  it("fecha a casa inteira e ocupa todas as unidades", async () => {
    const r = await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { propriedadeId },
        primeiraNoite: "2027-06-10",
        ultimaNoite: "2027-06-12",
        motivo: "reforma",
      }),
    );

    // Extremos inclusivos: 10, 11 e 12 — três noites, em duas unidades.
    expect(r.noitesFechadas).toBe(6);
    expect(await noitesDaUnidade(unidadeA)).toEqual([
      "2027-06-10",
      "2027-06-11",
      "2027-06-12",
    ]);
  });

  it("fecha só a unidade quando o escopo é a unidade", async () => {
    await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { unidadeId: unidadeA },
        primeiraNoite: "2027-07-01",
        ultimaNoite: "2027-07-01",
        motivo: "reforma",
      }),
    );
    expect(await noitesDaUnidade(unidadeA)).toEqual(["2027-07-01"]);
    expect(await noitesDaUnidade(unidadeB)).toEqual([]);
  });

  it("recusa sobre noite reservada e diz qual reserva remanejar", async () => {
    const reservaId = randomUUID();
    await withTenant(anfitriaoId, (tx) =>
      ocuparNoites(tx, {
        anfitriaoId,
        unidadeId: unidadeA,
        origem: "reserva",
        origemId: reservaId,
        noites: [{ noite: "2027-08-15" }],
      }),
    );

    const erro = await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { propriedadeId },
        primeiraNoite: "2027-08-14",
        ultimaNoite: "2027-08-16",
        motivo: "fechamento",
      }),
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BloqueioEmConflitoError);
    const conflito = erro as BloqueioEmConflitoError;
    expect(conflito.conflitos).toEqual([
      { reservaId, unidadeId: unidadeA, noites: ["2027-08-15"] },
    ]);

    // E não fechou nada: a transação inteira foi desfeita.
    expect(await noitesDaUnidade(unidadeB)).toEqual([]);
  });

  it("fechamento que se repete pega só os dias da semana escolhidos", async () => {
    // Toda terça de junho de 2027: dias 1, 8, 15, 22 e 29.
    const r = await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { unidadeId: unidadeA },
        primeiraNoite: "2027-06-01",
        ultimaNoite: "2027-06-30",
        motivo: "fechamento",
        repeticao: { diasDaSemana: [2] },
      }),
    );

    expect(r.noitesFechadas).toBe(5);
    expect(await noitesDaUnidade(unidadeA)).toEqual([
      "2027-06-01",
      "2027-06-08",
      "2027-06-15",
      "2027-06-22",
      "2027-06-29",
    ]);
  });

  it("aceita bloqueio sobreposto a outro bloqueio", async () => {
    await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { unidadeId: unidadeA },
        primeiraNoite: "2027-09-01",
        ultimaNoite: "2027-09-05",
        motivo: "reforma",
      }),
    );

    // Estender a reforma não pode falhar por já estar fechado.
    await expect(
      withTenant(anfitriaoId, (tx) =>
        fecharDatas(tx, anfitriaoId, {
          escopo: { unidadeId: unidadeA },
          primeiraNoite: "2027-09-03",
          ultimaNoite: "2027-09-08",
          motivo: "reforma",
        }),
      ),
    ).resolves.toBeDefined();

    expect(await noitesDaUnidade(unidadeA)).toHaveLength(8); // 01 a 08
  });
});
