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
import {
  abrirDatas,
  calendarioDoPeriodo,
  fecharDatas,
  listarBloqueios,
} from "./service";

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

// ---------------------------------------------------------------------------

describe("reabrir datas", () => {
  it("solta as noites E apaga o fechamento, na mesma transação", async () => {
    // Apagar só o registro deixaria as noites ocupadas para sempre, sem nada
    // no sistema explicando por quê — a recepção veria a casa cheia sem
    // reserva nenhuma.
    const { bloqueioId } = await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { propriedadeId },
        primeiraNoite: "2027-09-10",
        ultimaNoite: "2027-09-12",
        motivo: "reforma",
      }),
    );
    expect(await noitesDaUnidade(unidadeA)).toHaveLength(3);

    const r = await withTenant(anfitriaoId, (tx) =>
      abrirDatas(tx, anfitriaoId, bloqueioId, { tipo: "sistema" }),
    );

    expect(r.noitesLiberadas).toBe(6); // três noites × duas unidades
    expect(await noitesDaUnidade(unidadeA)).toEqual([]);
    expect(await noitesDaUnidade(unidadeB)).toEqual([]);

    // Por id, e não "setembro está vazio": outros casos deste arquivo também
    // fecham datas em setembro, e a asserção larga passaria a depender da
    // ordem em que os testes rodam.
    const restantes = await withTenant(anfitriaoId, (tx) =>
      listarBloqueios(tx, "2027-09-01", "2027-09-30"),
    );
    expect(restantes.map((b) => b.id)).not.toContain(bloqueioId);
  });

  it("não encosta nas noites de reserva", async () => {
    // O `liberarNoitesPorOrigem` filtra por origem: reabrir um fechamento não
    // pode soltar a noite de quem reservou.
    const reservaId = randomUUID();
    await withTenant(anfitriaoId, (tx) =>
      ocuparNoites(tx, {
        anfitriaoId,
        unidadeId: unidadeA,
        origem: "reserva",
        origemId: reservaId,
        noites: [{ noite: "2027-10-20" }],
      }),
    );
    const { bloqueioId } = await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { unidadeId: unidadeA },
        primeiraNoite: "2027-10-21",
        ultimaNoite: "2027-10-22",
        motivo: "reforma",
      }),
    );

    await withTenant(anfitriaoId, (tx) =>
      abrirDatas(tx, anfitriaoId, bloqueioId, { tipo: "sistema" }),
    );

    expect(await noitesDaUnidade(unidadeA)).toEqual(["2027-10-20"]);
  });
});

// ---------------------------------------------------------------------------

describe("o mês na tela", () => {
  it("monta a grade de noite_ocupada, com a origem de cada noite", async () => {
    // De `noite_ocupada`, que é a verdade sobre ocupação — não de reserva e
    // bloqueio separadamente. Com duas fontes, a tela e o motor de
    // disponibilidade discordariam algum dia.
    const reservaId = randomUUID();
    await withTenant(anfitriaoId, (tx) =>
      ocuparNoites(tx, {
        anfitriaoId,
        unidadeId: unidadeA,
        origem: "reserva",
        origemId: reservaId,
        noites: [{ noite: "2027-11-05" }],
      }),
    );
    await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { unidadeId: unidadeA },
        primeiraNoite: "2027-11-10",
        ultimaNoite: "2027-11-11",
        motivo: "uso_proprietario",
      }),
    );

    const mes = await withTenant(anfitriaoId, (tx) =>
      calendarioDoPeriodo(tx, "2027-11-01", "2027-11-30"),
    );

    const a = mes.find((u) => u.unidadeId === unidadeA)!;
    expect(a.dias).toHaveLength(30);

    const porNoite = new Map(a.dias.map((d) => [d.noite, d]));
    expect(porNoite.get("2027-11-05")!.origem).toBe("reserva");
    expect(porNoite.get("2027-11-05")!.origemId).toBe(reservaId);
    expect(porNoite.get("2027-11-10")!.origem).toBe("bloqueio");
    expect(porNoite.get("2027-11-11")!.origem).toBe("bloqueio");
    // As livres vêm com origem nula, não ausentes: a grade precisa de todos
    // os dias do mês para desenhar as casas vazias.
    expect(porNoite.get("2027-11-06")!.origem).toBeNull();
    expect(a.dias.filter((d) => d.origem === null)).toHaveLength(27);
  });

  it("o fechamento que atravessa o mês aparece nos DOIS meses", async () => {
    // Réveillon: fecha 28/12 a 02/01. Em ambos os meses a casa está fechada,
    // e filtrar por "começa dentro" esconderia metade.
    await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { propriedadeId },
        primeiraNoite: "2027-12-28",
        ultimaNoite: "2028-01-02",
        motivo: "uso_proprietario",
      }),
    );

    const dezembro = await withTenant(anfitriaoId, (tx) =>
      listarBloqueios(tx, "2027-12-01", "2027-12-31"),
    );
    const janeiro = await withTenant(anfitriaoId, (tx) =>
      listarBloqueios(tx, "2028-01-01", "2028-01-31"),
    );

    expect(dezembro).toHaveLength(1);
    expect(janeiro).toHaveLength(1);
    expect(janeiro[0]!.id).toBe(dezembro[0]!.id);
  });

  it("mês sem nada devolve todos os dias livres", async () => {
    const mes = await withTenant(anfitriaoId, (tx) =>
      calendarioDoPeriodo(tx, "2029-02-01", "2029-02-28"),
    );
    expect(mes[0]!.dias).toHaveLength(28);
    expect(mes[0]!.dias.every((d) => d.origem === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("fechar duas vezes as mesmas datas", () => {
  it("recusa o segundo fechamento e NÃO deixa registro órfão", async () => {
    // Um fechamento que não é dono de noite nenhuma é um registro que mente:
    // ao reabrir o que de fato segura as datas, a tela continuaria mostrando
    // este como fechado, com as noites livres.
    await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { propriedadeId },
        primeiraNoite: "2028-03-10",
        ultimaNoite: "2028-03-12",
        motivo: "reforma",
      }),
    );

    const erro = await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { propriedadeId },
        primeiraNoite: "2028-03-10",
        ultimaNoite: "2028-03-12",
        motivo: "uso_proprietario",
      }),
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(/já estão fechadas/);

    // A transação foi desfeita: só o primeiro ficou.
    const existentes = await withTenant(anfitriaoId, (tx) =>
      listarBloqueios(tx, "2028-03-01", "2028-03-31"),
    );
    expect(existentes).toHaveLength(1);
    expect(existentes[0]!.motivo).toBe("reforma");
  });

  it("conta as noites que REALMENTE tomou, não as que pediu", async () => {
    // Com uma unidade já fechada, fechar a casa inteira toma só o que falta.
    // Reportar o pretendido faria a tela dizer "4 noites fechadas" quando
    // duas já estavam.
    await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { unidadeId: unidadeA },
        primeiraNoite: "2028-04-10",
        ultimaNoite: "2028-04-11",
        motivo: "reforma",
      }),
    );

    const r = await withTenant(anfitriaoId, (tx) =>
      fecharDatas(tx, anfitriaoId, {
        escopo: { propriedadeId },
        primeiraNoite: "2028-04-10",
        ultimaNoite: "2028-04-11",
        motivo: "fechamento",
      }),
    );

    // Duas noites × duas unidades = 4 pedidas; a unidade A já tinha as suas.
    expect(r.noitesFechadas).toBe(2);
  });
});
