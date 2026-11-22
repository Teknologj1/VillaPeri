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
import { noiteOcupada } from "@/modules/calendario/schema";
import { notificacao } from "@/modules/notificacoes/schema";
import { politicaCancelamento, regraTarifa } from "@/modules/tarifas/schema";

import {
  buscarHospede,
  buscarReservaPorCodigo,
  hojeNaCasa,
  listarHospedes,
  listarReservas,
  preReservasVencidas,
  registrarAcessoDadoPessoal,
  listarAcessosAoHospede,
} from "./consultas";
import {
  acessoDadoPessoal,
  hospede,
  pagamento,
  reserva,
  solicitacao,
} from "./schema";
import { criarReserva, mudarStatus } from "./service";

config({ path: [".env.local", ".env"], quiet: true });

const urlOwner = process.env.DATABASE_URL_MIGRATOR;
if (!urlOwner) throw new Error("DATABASE_URL_MIGRATOR é necessária nos testes.");
const clienteOwner = postgres(urlOwner, { max: 5 });
const dbOwner = drizzle(clienteOwner, { schema });

const NOME = "__teste_consultas";
const AUTOR = { tipo: "sistema" } as const;

let anfitriaoId: string;
let tipoId: string;
let unidadeId: string;
let unidades: string[] = [];

/**
 * Telefone único por nome.
 *
 * O serviço reaproveita a ficha do hóspede pelo telefone — é assim que a
 * recepção reconhece quem já se hospedou. Derivar o número do TAMANHO do nome
 * fazia "Elisa" e "Fábio" dividirem a mesma ficha, e um caso de busca por
 * nome falhava por culpa do fixture, não do código.
 */
function telefoneDe(nome: string): string {
  let soma = 0;
  for (const c of nome) soma = (soma * 31 + c.codePointAt(0)!) % 10_000_000;
  return `62${String(soma).padStart(9, "0")}`;
}

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
    acessoDadoPessoal,
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
      slug: "casa-teste-consultas",
      capacidade: 11,
      modoPreco: "ocupacao",
      ocupacaoBase: 4,
    })
    .returning();
  tipoId = t!.id;

  // Três unidades porque alguns casos precisam de três estadias no MESMO
  // dia — a chave única (unidade, noite) recusa isso numa unidade só, e com
  // razão. A Villa Peri é locada inteira, mas o motor é multi-unidade.
  const us = await dbOwner
    .insert(unidade)
    .values([
      { anfitriaoId, tipoId, nome: "Casa 1" },
      { anfitriaoId, tipoId, nome: "Casa 2" },
      { anfitriaoId, tipoId, nome: "Casa 3" },
    ])
    .returning();
  unidades = us.map((u) => u.id);
  unidadeId = unidades[0]!;

  await dbOwner.insert(regraTarifa).values({
    anfitriaoId,
    propriedadeId: p!.id,
    nome: "Diária padrão",
    nivel: "padrao",
    precoSemanaCentavos: 54_300,
    precoFimDeSemanaCentavos: 75_000,
    valorPessoaExtraCentavos: 11_000,
  });

  await dbOwner.insert(politicaCancelamento).values({
    anfitriaoId,
    nome: "Padrão",
    faixas: [{ diasAntes: 7, percentualPontosBase: 10_000 }],
    padrao: true,
  });
});

beforeEach(async () => {
  for (const t of [
    notificacao,
    noiteOcupada,
    pagamento,
    reserva,
    solicitacao,
    acessoDadoPessoal,
    hospede,
  ]) {
    await dbOwner.delete(t).where(eq(t.anfitriaoId, anfitriaoId));
  }
});

afterAll(async () => {
  await limpar();
  await clienteOwner.end();
  await fecharConexao();
});

/** Uma reserva pronta, com o nome e as datas que o caso precisa. */
async function reservar(
  nome: string,
  entrada: string,
  saida: string,
  ate?: "confirmada" | "hospedado" | "concluida" | "cancelada",
  unidade = 0,
) {
  const r = await withTenant(anfitriaoId, (tx) =>
    criarReserva(tx, anfitriaoId, {
      unidadeId: unidades[unidade]!,
      tipoId,
      entrada,
      saida,
      adultos: 4,
      criancas: 0,
      hospede: { nome, telefone: telefoneDe(nome) },
      autor: AUTOR,
    }),
  );

  const caminho: Record<string, string[]> = {
    confirmada: ["confirmada"],
    hospedado: ["confirmada", "hospedado"],
    concluida: ["confirmada", "hospedado", "concluida"],
    cancelada: ["cancelada"],
  };

  for (const passo of ate ? caminho[ate]! : []) {
    await withTenant(anfitriaoId, (tx) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mudarStatus(tx, anfitriaoId, r.id, passo as any, {
        autor: AUTOR,
        hojeNaCasa: "2027-01-01",
      }),
    );
  }

  return r;
}

// ---------------------------------------------------------------------------

describe("listarReservas", () => {
  it("acha a reserva que ATRAVESSA o intervalo, não só a que começa dentro", async () => {
    // Réveillon: entra em dezembro, sai em janeiro. Quem filtrar pela data de
    // entrada perde essa reserva na tela de janeiro — e é a única da casa.
    await reservar("Ana", "2027-12-28", "2028-01-03", "confirmada");

    const emJaneiro = await withTenant(anfitriaoId, (tx) =>
      listarReservas(tx, { de: "2028-01-01", ate: "2028-02-01" }),
    );
    const emDezembro = await withTenant(anfitriaoId, (tx) =>
      listarReservas(tx, { de: "2027-12-01", ate: "2028-01-01" }),
    );

    expect(emJaneiro.map((r) => r.hospedeNome)).toEqual(["Ana"]);
    expect(emDezembro.map((r) => r.hospedeNome)).toEqual(["Ana"]);
  });

  it("não acha a reserva que SAI no primeiro dia do intervalo", async () => {
    // Sai dia 1º: a última noite foi 31/12. Não há hóspede na casa em
    // janeiro, e a reserva não pertence à tela de janeiro.
    await reservar("Bruno", "2027-12-28", "2028-01-01", "confirmada");

    const emJaneiro = await withTenant(anfitriaoId, (tx) =>
      listarReservas(tx, { de: "2028-01-01", ate: "2028-02-01" }),
    );
    expect(emJaneiro).toEqual([]);
  });

  it("soma o que já foi pago em cada linha", async () => {
    const r = await reservar("Clara", "2027-05-10", "2027-05-12", "confirmada");
    await dbOwner.insert(pagamento).values([
      {
        anfitriaoId,
        reservaId: r.id,
        tipo: "sinal",
        valorCentavos: 32_580,
        metodo: "pix",
        data: "2027-05-01",
      },
      {
        anfitriaoId,
        reservaId: r.id,
        tipo: "saldo",
        valorCentavos: 10_000,
        metodo: "dinheiro",
        data: "2027-05-10",
      },
    ]);

    const [linha] = await withTenant(anfitriaoId, (tx) => listarReservas(tx));
    expect(linha!.pagoCentavos).toBe(42_580);
  });

  it("conta reembolso como saída, não como entrada", async () => {
    // O reembolso entra NEGATIVO justamente para a soma ser a receita. Se
    // fosse positivo, cancelar uma reserva aumentaria o quanto ela pagou.
    const r = await reservar("Davi", "2027-06-10", "2027-06-12", "confirmada");
    await dbOwner.insert(pagamento).values([
      {
        anfitriaoId,
        reservaId: r.id,
        tipo: "sinal",
        valorCentavos: 30_000,
        metodo: "pix",
        data: "2027-06-01",
      },
      {
        anfitriaoId,
        reservaId: r.id,
        tipo: "reembolso",
        valorCentavos: -30_000,
        metodo: "pix",
        data: "2027-06-05",
      },
    ]);

    const [linha] = await withTenant(anfitriaoId, (tx) => listarReservas(tx));
    expect(linha!.pagoCentavos).toBe(0);
  });

  it("filtra por status e busca por nome ou código", async () => {
    await reservar("Elisa", "2027-07-05", "2027-07-07", "confirmada");
    const outra = await reservar("Fábio", "2027-07-20", "2027-07-22");

    const confirmadas = await withTenant(anfitriaoId, (tx) =>
      listarReservas(tx, { status: ["confirmada"] }),
    );
    expect(confirmadas.map((r) => r.hospedeNome)).toEqual(["Elisa"]);

    const porNome = await withTenant(anfitriaoId, (tx) =>
      listarReservas(tx, { busca: "fáb" }),
    );
    expect(porNome.map((r) => r.hospedeNome)).toEqual(["Fábio"]);

    const porCodigo = await withTenant(anfitriaoId, (tx) =>
      listarReservas(tx, { busca: outra.codigo }),
    );
    expect(porCodigo.map((r) => r.id)).toEqual([outra.id]);
  });
});

// ---------------------------------------------------------------------------

describe("hojeNaCasa", () => {
  /**
   * O dia 15 com as três situações ao mesmo tempo. É o caso real de uma
   * virada de hóspede: alguém sai de manhã e outro entra à tarde.
   */
  async function montarODia15() {
    // Uma unidade para cada: "Fica" cobre as noites de 13 a 19, que incluem
    // as dos outros dois. Na mesma unidade a chave única (unidade, noite)
    // recusaria — e deve recusar.
    await reservar("Chega", "2027-09-15", "2027-09-18", "confirmada", 0);
    await reservar("Sai", "2027-09-12", "2027-09-15", "hospedado", 1);
    await reservar("Fica", "2027-09-13", "2027-09-20", "hospedado", 2);
  }

  it("separa chegada, saída e quem fica — cada nome numa lista só", async () => {
    // Estas duas não dividem noite nenhuma — a de 14 para 15 é da "Sai", e a
    // "Chega" começa na de 15 para 16 —, então a mesma unidade serve.
    await reservar("Chega", "2027-09-15", "2027-09-18", "confirmada");
    await reservar("Sai", "2027-09-12", "2027-09-15", "hospedado");

    const dia = await withTenant(anfitriaoId, (tx) =>
      hojeNaCasa(tx, "2027-09-15"),
    );

    expect(dia.chegadas.map((r) => r.hospedeNome)).toEqual(["Chega"]);
    expect(dia.saidas.map((r) => r.hospedeNome)).toEqual(["Sai"]);
    expect(dia.naCasa).toEqual([]);

    // Ninguém aparece em duas listas: são três grupos de ação distintos.
    const todos = [...dia.chegadas, ...dia.saidas, ...dia.naCasa];
    expect(new Set(todos.map((r) => r.id)).size).toBe(todos.length);
  });

  it("quem sai hoje NÃO conta como quem está na casa", async () => {
    // A noite de 14 para 15 pertence ao dia 14. No dia 15 esse hóspede não
    // tem noite nenhuma — mas está na casa até o meio-dia, e a portaria
    // precisa vê-lo na lista de SAÍDAS, não na de permanência.
    await reservar("Sai", "2027-10-12", "2027-10-15", "hospedado");

    const dia = await withTenant(anfitriaoId, (tx) =>
      hojeNaCasa(tx, "2027-10-15"),
    );
    expect(dia.saidas.map((r) => r.hospedeNome)).toEqual(["Sai"]);
    expect(dia.naCasa).toEqual([]);
    expect(dia.chegadas).toEqual([]);
  });

  it("no meio da estadia, o hóspede está em 'na casa' e em mais nenhuma", async () => {
    await reservar("Fica", "2027-11-10", "2027-11-20", "hospedado");

    const dia = await withTenant(anfitriaoId, (tx) =>
      hojeNaCasa(tx, "2027-11-15"),
    );
    expect(dia.naCasa.map((r) => r.hospedeNome)).toEqual(["Fica"]);
    expect(dia.chegadas).toEqual([]);
    expect(dia.saidas).toEqual([]);
  });

  it("não mostra reserva cancelada", async () => {
    await reservar("Desistiu", "2027-09-15", "2027-09-18", "cancelada");

    const dia = await withTenant(anfitriaoId, (tx) =>
      hojeNaCasa(tx, "2027-09-15"),
    );
    expect([...dia.chegadas, ...dia.saidas, ...dia.naCasa]).toEqual([]);
  });

  it("no dia da virada, as três listas somam cada reserva uma vez", async () => {
    await montarODia15();
    const dia = await withTenant(anfitriaoId, (tx) =>
      hojeNaCasa(tx, "2027-09-15"),
    );
    const todos = [...dia.chegadas, ...dia.saidas, ...dia.naCasa];
    expect(todos).toHaveLength(3);
    expect(new Set(todos.map((r) => r.id)).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------

describe("preReservasVencidas", () => {
  it("acha a pré-reserva cujo prazo passou, e não a confirmada", async () => {
    const vencida = await reservar("Vencida", "2027-08-10", "2027-08-12");
    await dbOwner
      .update(reserva)
      .set({ expiraEm: new Date(Date.now() - 60_000) })
      .where(eq(reserva.id, vencida.id));

    const confirmada = await reservar(
      "Firme",
      "2027-08-20",
      "2027-08-22",
      "confirmada",
    );

    const vencidas = await withTenant(anfitriaoId, (tx) =>
      preReservasVencidas(tx),
    );
    expect(vencidas.map((r) => r.id)).toEqual([vencida.id]);
    expect(vencidas.map((r) => r.id)).not.toContain(confirmada.id);
  });
});

// ---------------------------------------------------------------------------

describe("hóspedes", () => {
  it("conta só as estadias que valem, e acha pela busca", async () => {
    // Mesmo telefone: o serviço reaproveita a ficha em vez de duplicar.
    const tel = "62988887777";
    for (const [entrada, saida, ate] of [
      ["2027-02-10", "2027-02-12", "concluida"],
      ["2027-03-10", "2027-03-12", "confirmada"],
      ["2027-04-10", "2027-04-12", "cancelada"],
    ] as const) {
      await withTenant(anfitriaoId, (tx) =>
        criarReserva(tx, anfitriaoId, {
          unidadeId,
          tipoId,
          entrada,
          saida,
          adultos: 4,
          criancas: 0,
          hospede: { nome: "Helena", telefone: tel },
          autor: AUTOR,
        }),
      ).then(async (r) => {
        const caminho = {
          concluida: ["confirmada", "hospedado", "concluida"],
          confirmada: ["confirmada"],
          cancelada: ["cancelada"],
        }[ate];
        for (const passo of caminho) {
          await withTenant(anfitriaoId, (tx) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mudarStatus(tx, anfitriaoId, r.id, passo as any, {
              autor: AUTOR,
              hojeNaCasa: "2027-01-01",
            }),
          );
        }
      });
    }

    const lista = await withTenant(anfitriaoId, (tx) =>
      listarHospedes(tx, "helena"),
    );
    expect(lista).toHaveLength(1);
    // Três reservas, mas a cancelada não é visita.
    expect(lista[0]!.estadias).toBe(2);
    expect(lista[0]!.ultimaSaida).toBe("2027-03-12");
    expect(lista[0]!.recorrente).toBe(true);

    const porTelefone = await withTenant(anfitriaoId, (tx) =>
      listarHospedes(tx, "98888"),
    );
    expect(porTelefone.map((h) => h.nome)).toEqual(["Helena"]);
  });

  it("a ficha traz as reservas da pessoa, da mais recente para a mais antiga", async () => {
    const r = await reservar("Igor", "2027-05-10", "2027-05-12", "confirmada");
    const ficha = await withTenant(anfitriaoId, (tx) =>
      buscarHospede(tx, r.hospedeId),
    );
    expect(ficha?.hospede.nome).toBe("Igor");
    expect(ficha?.reservas.map((x) => x.id)).toEqual([r.id]);
  });

  it("registra cada abertura de ficha com dado pessoal", async () => {
    const r = await reservar("Joana", "2027-06-10", "2027-06-12");

    await withTenant(anfitriaoId, (tx) =>
      registrarAcessoDadoPessoal(tx, {
        anfitriaoId,
        hospedeId: r.hospedeId,
        usuarioId: "usuario-de-teste",
        motivo: "abriu a ficha da reserva",
      }),
    );

    const acessos = await withTenant(anfitriaoId, (tx) =>
      listarAcessosAoHospede(tx, r.hospedeId),
    );
    expect(acessos).toHaveLength(1);
    expect(acessos[0]!.usuarioId).toBe("usuario-de-teste");
    expect(acessos[0]!.motivo).toBe("abriu a ficha da reserva");
  });
});

// ---------------------------------------------------------------------------

describe("buscarReservaPorCodigo", () => {
  it("acha pelo código, aceitando minúsculas", async () => {
    const r = await reservar("Lia", "2027-07-10", "2027-07-12", "confirmada");

    const ficha = await withTenant(anfitriaoId, (tx) =>
      buscarReservaPorCodigo(tx, r.codigo.toLowerCase()),
    );
    expect(ficha?.reserva.id).toBe(r.id);
    expect(ficha?.hospede.nome).toBe("Lia");
    expect(ficha?.pagoCentavos).toBe(0);
  });

  it("devolve null para código que não existe, em vez de levantar erro", async () => {
    const ficha = await withTenant(anfitriaoId, (tx) =>
      buscarReservaPorCodigo(tx, "R-ZZZZ"),
    );
    expect(ficha).toBeNull();
  });
});
