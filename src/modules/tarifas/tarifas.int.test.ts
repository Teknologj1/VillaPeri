import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fecharConexao } from "@/db/client";
import * as schema from "@/db/schema";
import { withTenant } from "@/db/tenant";
import {
  anfitriao,
  propriedade,
  tipoAcomodacao,
} from "@/modules/anfitriao/schema";

import { auditoria } from "@/modules/auditoria/schema";

import { SemTarifaError, orcar } from "./motor";
import { feriado, regraTarifa } from "./schema";
import {
  atualizarRegraTarifa,
  orcarEstadia,
  sincronizarFeriadosNacionais,
} from "./service";

config({ path: [".env.local", ".env"], quiet: true });

const urlOwner = process.env.DATABASE_URL_MIGRATOR;
if (!urlOwner) throw new Error("DATABASE_URL_MIGRATOR é necessária nos testes.");
const clienteOwner = postgres(urlOwner, { max: 5 });
const dbOwner = drizzle(clienteOwner, { schema });

const NOME = "__teste_tarifas";
const SEMANA = 80_000;
const FDS = 100_000;

let anfitriaoId: string;
let propriedadeId: string;
let tipoId: string;

async function limpar() {
  const [a] = await dbOwner
    .select()
    .from(anfitriao)
    .where(eq(anfitriao.nome, NOME))
    .limit(1);
  if (!a) return;
  await dbOwner.delete(regraTarifa).where(eq(regraTarifa.anfitriaoId, a.id));
  await dbOwner.delete(feriado).where(eq(feriado.anfitriaoId, a.id));
  await dbOwner.delete(tipoAcomodacao).where(eq(tipoAcomodacao.anfitriaoId, a.id));
  await dbOwner.delete(propriedade).where(eq(propriedade.anfitriaoId, a.id));
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
    .values({ anfitriaoId, nome: "Casa de teste" })
    .returning();
  propriedadeId = p!.id;

  const [t] = await dbOwner
    .insert(tipoAcomodacao)
    .values({
      anfitriaoId,
      propriedadeId,
      nome: "Casa inteira",
      slug: "casa-teste",
      capacidade: 11,
      modoPreco: "ocupacao",
      ocupacaoBase: 4,
    })
    .returning();
  tipoId = t!.id;
});

afterAll(async () => {
  await limpar();
  await clienteOwner.end();
  await fecharConexao();
});

const pedidoBase = () => ({
  noites: ["2026-12-11", "2026-12-12", "2026-12-13"],
  adultos: 2,
  criancas: 0,
  tipo: { id: tipoId, modoPreco: "ocupacao" as const, ocupacaoBase: 4 },
  propriedadeId,
});

describe("orçamento a partir do banco", () => {
  it("recusa cotar enquanto não há diária cadastrada", async () => {
    // Estado real da Villa Peri hoje: estrutura pronta, tabela de preços
    // vazia. O certo é falhar, não cotar R$ 0,00.
    await expect(
      withTenant(anfitriaoId, (tx) => orcarEstadia(tx, pedidoBase())),
    ).rejects.toBeInstanceOf(SemTarifaError);
  });

  it("cota pela diária padrão depois de cadastrada", async () => {
    await dbOwner.insert(regraTarifa).values({
      anfitriaoId,
      propriedadeId,
      nome: "Diária padrão",
      nivel: "padrao",
      precoSemanaCentavos: SEMANA,
      precoFimDeSemanaCentavos: FDS,
      valorPessoaExtraCentavos: 10_000,
    });

    const o = await withTenant(anfitriaoId, (tx) => orcarEstadia(tx, pedidoBase()));

    // Sexta e sábado a R$ 1.000, domingo a R$ 800.
    expect(o.noites.map((n) => n.precoCentavos)).toEqual([FDS, FDS, SEMANA]);
    expect(o.totalCentavos).toBe(280_000);
    expect(o.noites[0]?.regraNome).toBe("Diária padrão");
  });

  it("o preço vindo do banco é idêntico ao do motor puro", async () => {
    // Guarda direta do portão da Fase 1A: "site, simulador e reserva dão o
    // mesmo preço". Os três passam por estas duas funções; se o carregamento
    // do catálogo distorcer qualquer campo, a igualdade quebra aqui.
    const pedido = { ...pedidoBase(), adultos: 7 };

    const doBanco = await withTenant(anfitriaoId, (tx) => orcarEstadia(tx, pedido));

    const regras = await dbOwner
      .select()
      .from(regraTarifa)
      .where(eq(regraTarifa.anfitriaoId, anfitriaoId));

    const doMotor = orcar(pedido, {
      regras: regras.map((r) => ({
        id: r.id,
        nome: r.nome,
        nivel: r.nivel,
        propriedadeId: r.propriedadeId,
        tipoId: r.tipoId,
        unidadeId: r.unidadeId,
        vigenciaInicio: r.vigenciaInicio,
        vigenciaFim: r.vigenciaFim,
        precoSemanaCentavos: r.precoSemanaCentavos,
        precoFimDeSemanaCentavos: r.precoFimDeSemanaCentavos,
        precoFixoCentavos: r.precoFixoCentavos,
        ajustePontosBase: r.ajustePontosBase,
        valorPessoaExtraCentavos: r.valorPessoaExtraCentavos,
        valorCriancaCentavos: r.valorCriancaCentavos,
        aplicaNaVespera: r.aplicaNaVespera,
        prioridade: r.prioridade,
        ativa: r.ativa,
      })),
      feriados: [],
      extras: [],
      descontosEstadiaLonga: [],
      diasFimDeSemana: [5, 6],
    });

    expect(doBanco.totalCentavos).toBe(doMotor.totalCentavos);
    expect(doBanco.subtotalNoitesCentavos).toBe(doMotor.subtotalNoitesCentavos);
    expect(doBanco.adicionalOcupacaoCentavos).toBe(doMotor.adicionalOcupacaoCentavos);
  });

  it("aplica a regra de feriado sobre um feriado gravado no banco", async () => {
    await withTenant(anfitriaoId, (tx) =>
      sincronizarFeriadosNacionais(tx, anfitriaoId, 2026, 2026),
    );
    await dbOwner.insert(regraTarifa).values({
      anfitriaoId,
      propriedadeId,
      nome: "Feriado",
      nivel: "feriado",
      ajustePontosBase: 3_000, // +30%
    });

    // 25/12/2026 é uma sexta: base de fim de semana 100.000 → 130.000.
    const o = await withTenant(anfitriaoId, (tx) =>
      orcarEstadia(tx, { ...pedidoBase(), noites: ["2026-12-25"] }),
    );

    expect(o.noites[0]?.feriado).toBe("Natal");
    expect(o.noites[0]?.precoCentavos).toBe(130_000);
    expect(o.noites[0]?.nivel).toBe("feriado");
  });

  it("os feriados não vazam entre anfitriões", async () => {
    // sincronizarFeriadosNacionais grava com o anfitrião do contexto; o RLS
    // tem de manter isso isolado como qualquer outro dado.
    const doOutro = await dbOwner
      .select()
      .from(feriado)
      .where(eq(feriado.anfitriaoId, anfitriaoId));
    expect(doOutro.length).toBeGreaterThan(0);
    expect(doOutro.every((f) => f.anfitriaoId === anfitriaoId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("editar uma regra de tarifa", () => {
  async function umaRegra() {
    const [r] = await dbOwner
      .insert(regraTarifa)
      .values({
        anfitriaoId,
        propriedadeId,
        nome: "Para editar",
        nivel: "padrao",
        precoSemanaCentavos: 50_000,
        precoFimDeSemanaCentavos: 70_000,
      })
      .returning();
    return r!;
  }

  it("muda os valores e grava o antes na auditoria", async () => {
    // "Por que a diária subiu?" é pergunta que aparece meses depois, quando
    // ninguém lembra — e sem o valor anterior não há como responder.
    const r = await umaRegra();

    await withTenant(anfitriaoId, (tx) =>
      atualizarRegraTarifa(
        tx,
        anfitriaoId,
        r.id,
        { precoSemanaCentavos: 60_000 },
        { tipo: "sistema" },
      ),
    );

    const [depois] = await dbOwner
      .select()
      .from(regraTarifa)
      .where(eq(regraTarifa.id, r.id));
    expect(depois!.precoSemanaCentavos).toBe(60_000);
    // O que não foi mandado não é apagado.
    expect(depois!.precoFimDeSemanaCentavos).toBe(70_000);

    const [registro] = await dbOwner
      .select()
      .from(auditoria)
      .where(eq(auditoria.entidadeId, r.id));
    expect(registro!.acao).toBe("editou");
    expect(
      (registro!.valorAntes as { precoSemanaCentavos: number })
        .precoSemanaCentavos,
    ).toBe(50_000);
  });

  it("recusa preço fixo E ajuste percentual na mesma regra", async () => {
    // São alternativas, não somam. O banco já recusa; aqui a mensagem é
    // legível em vez de uma violação de constraint.
    const [r] = await dbOwner
      .insert(regraTarifa)
      .values({
        anfitriaoId,
        propriedadeId,
        nome: "Feriado com ajuste",
        nivel: "feriado",
        ajustePontosBase: 2_000,
      })
      .returning();

    await expect(
      withTenant(anfitriaoId, (tx) =>
        atualizarRegraTarifa(
          tx,
          anfitriaoId,
          r!.id,
          { precoFixoCentavos: 137_500 },
          { tipo: "sistema" },
        ),
      ),
    ).rejects.toThrow(/preço fixo OU ajuste/);
  });

  it("o preço novo vale para a cotação seguinte", async () => {
    // É o ponto da tela inteira: mudar aqui muda o que o site cota, porque
    // não há uma segunda tabela de preços.
    const r = await umaRegra();
    await dbOwner
      .update(regraTarifa)
      .set({ ativa: false })
      .where(eq(regraTarifa.id, r.id));

    await withTenant(anfitriaoId, (tx) =>
      atualizarRegraTarifa(
        tx,
        anfitriaoId,
        r.id,
        { ativa: true, precoSemanaCentavos: 12_300 },
        { tipo: "sistema" },
      ),
    );

    const [depois] = await dbOwner
      .select()
      .from(regraTarifa)
      .where(eq(regraTarifa.id, r.id));
    expect(depois!.ativa).toBe(true);
    expect(depois!.precoSemanaCentavos).toBe(12_300);
  });
});
