import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db, fecharConexao } from "@/db/client";
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
  conferirFnrh,
  enviarLinkDaFnrh,
  fichaPorToken,
  preencherFnrh,
} from "./fnrh";
import {
  acessoDadoPessoal,
  acompanhante,
  hospede,
  pagamento,
  reserva,
  solicitacao,
} from "./schema";
import { criarReserva, mudarStatus } from "./service";

config({ path: [".env.local", ".env"], quiet: true });

const clienteOwner = postgres(process.env.DATABASE_URL_MIGRATOR!, { max: 5 });
const dbOwner = drizzle(clienteOwner, { schema });

const NOME = "__teste_fnrh";
const AUTOR = { tipo: "sistema" } as const;

let anfitriaoId: string;
let tipoId: string;
let unidadeId: string;

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
    acompanhante,
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
      slug: "casa-teste-fnrh",
      capacidade: 11,
      modoPreco: "ocupacao",
      ocupacaoBase: 4,
    })
    .returning();
  tipoId = t!.id;

  const [u] = await dbOwner
    .insert(unidade)
    .values({ anfitriaoId, tipoId, nome: "Casa" })
    .returning();
  unidadeId = u!.id;

  await dbOwner.insert(regraTarifa).values({
    anfitriaoId,
    propriedadeId: p!.id,
    nome: "Diária padrão",
    nivel: "padrao",
    precoSemanaCentavos: 54_300,
    precoFimDeSemanaCentavos: 75_000,
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
    acompanhante,
    reserva,
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

/** Uma reserva confirmada — é a partir daí que a ficha faz sentido. */
async function reservaConfirmada(nome = "Joana") {
  const r = await withTenant(anfitriaoId, (tx) =>
    criarReserva(tx, anfitriaoId, {
      unidadeId,
      tipoId,
      entrada: "2027-05-10",
      saida: "2027-05-13",
      adultos: 4,
      criancas: 1,
      hospede: { nome, telefone: "62988887777", email: "joana@teste.local" },
      autor: AUTOR,
    }),
  );
  await withTenant(anfitriaoId, (tx) =>
    mudarStatus(tx, anfitriaoId, r.id, "confirmada", { autor: AUTOR }),
  );
  return r;
}

const PREENCHIDO = {
  documento: "1234567 SSP-GO",
  nascimento: "1988-03-14",
  nacionalidade: "Brasileira",
  cidade: "Goiânia",
  uf: "go",
  motivoViagem: "Lazer",
  acompanhantes: [
    { nome: "Pedro Silva", documento: "7654321", nascimento: "1990-07-02" },
    { nome: "Lia Silva", documento: null, nascimento: "2019-01-20" },
  ],
};

// ---------------------------------------------------------------------------

describe("o link da ficha", () => {
  it("gera token, enfileira os dois avisos e marca como enviada", async () => {
    const r = await reservaConfirmada();

    const { token, url } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );

    expect(token.length).toBeGreaterThan(20);
    expect(url).toContain(`/fnrh/${token}`);

    const [depois] = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.id, r.id));
    expect(depois!.fnrhStatus).toBe("link_enviado");
    expect(depois!.fnrhExpiraEm!.getTime()).toBeGreaterThan(Date.now());

    // Filtrado pelo anfitrião: `dbOwner` tem BYPASSRLS e enxerga TODAS as
    // contas do banco local. Sem este `and`, qualquer link gerado para a
    // conta real durante o desenvolvimento entra na contagem e o teste passa
    // a falhar conforme o que mais existe no banco.
    const avisos = await dbOwner
      .select()
      .from(notificacao)
      .where(
        and(
          eq(notificacao.anfitriaoId, anfitriaoId),
          eq(notificacao.evento, "fnrh.link_enviado"),
        ),
      );
    expect(avisos.map((a) => a.canal).sort()).toEqual(["email", "whatsapp"]);
    // O link tem de estar no corpo, senão a mensagem não serve para nada.
    for (const a of avisos) expect(a.corpo).toContain(token);
  });

  it("reaproveita o token ainda válido ao reenviar", async () => {
    // O hóspede pode ter guardado o link da primeira mensagem. Trocar o token
    // a cada reenvio quebraria justamente quem estava tentando usá-lo.
    const r = await reservaConfirmada();
    const primeiro = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );
    const segundo = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );
    expect(segundo.token).toBe(primeiro.token);
  });

  it("reenviar não faz a ficha preenchida voltar para 'enviada'", async () => {
    const r = await reservaConfirmada();
    const { token } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );
    await withTenant(anfitriaoId, (tx) =>
      preencherFnrh(tx, anfitriaoId, token, PREENCHIDO),
    );

    await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );

    const [depois] = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.id, r.id));
    expect(depois!.fnrhStatus).toBe("preenchida");
  });
});

// ---------------------------------------------------------------------------

describe("a função que descobre o anfitrião pelo token", () => {
  /** Como a página pública chama: pela conexão da aplicação, sem contexto. */
  async function anfitriaoPorToken(token: string) {
    const linhas = await db.execute<{ anfitriao_por_token_fnrh: string | null }>(
      sql`select anfitriao_por_token_fnrh(${token})`,
    );
    return linhas[0]?.anfitriao_por_token_fnrh ?? null;
  }

  it("devolve o anfitrião para token válido", async () => {
    const r = await reservaConfirmada();
    const { token } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );
    expect(await anfitriaoPorToken(token)).toBe(anfitriaoId);
  });

  it("devolve nada para token inventado", async () => {
    expect(await anfitriaoPorToken("nao-existe")).toBeNull();
    expect(await anfitriaoPorToken("")).toBeNull();
  });

  it("devolve nada quando o prazo venceu", async () => {
    const r = await reservaConfirmada();
    const { token } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );
    await dbOwner
      .update(reserva)
      .set({ fnrhExpiraEm: new Date(Date.now() - 60_000) })
      .where(eq(reserva.id, r.id));

    expect(await anfitriaoPorToken(token)).toBeNull();
  });

  it("devolve nada quando a reserva foi cancelada", async () => {
    // Link antigo de reserva desfeita não pode continuar aberto.
    const r = await reservaConfirmada();
    const { token } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );
    await withTenant(anfitriaoId, (tx) =>
      mudarStatus(tx, anfitriaoId, r.id, "cancelada", {
        autor: AUTOR,
        motivo: "teste",
        hojeNaCasa: "2027-05-01",
      }),
    );

    expect(await anfitriaoPorToken(token)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("preencher a ficha", () => {
  it("grava o titular, os acompanhantes e o consentimento", async () => {
    const r = await reservaConfirmada();
    const { token } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );

    const resultado = await withTenant(anfitriaoId, (tx) =>
      preencherFnrh(tx, anfitriaoId, token, PREENCHIDO),
    );
    expect(resultado?.codigo).toBe(r.codigo);

    const [h] = await dbOwner
      .select()
      .from(hospede)
      .where(eq(hospede.id, r.hospedeId));
    expect(h!.documento).toBe("1234567 SSP-GO");
    expect(h!.nascimento).toBe("1988-03-14");
    expect(h!.cidade).toBe("Goiânia");
    // A UF é normalizada: a pessoa digita "go", o registro guarda "GO".
    expect(h!.uf).toBe("GO");
    expect(h!.aceiteLgpd).toBe(true);
    expect(h!.aceiteLgpdEm).not.toBeNull();

    const acs = await dbOwner
      .select()
      .from(acompanhante)
      .where(eq(acompanhante.reservaId, r.id));
    expect(acs.map((a) => a.nome).sort()).toEqual(["Lia Silva", "Pedro Silva"]);

    const [depois] = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.id, r.id));
    expect(depois!.fnrhStatus).toBe("preenchida");
  });

  it("substitui os acompanhantes em vez de somar", async () => {
    // Quem corrige um nome e reenvia espera ver a lista que digitou, não a
    // antiga com a nova grudada embaixo.
    const r = await reservaConfirmada();
    const { token } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );

    await withTenant(anfitriaoId, (tx) =>
      preencherFnrh(tx, anfitriaoId, token, PREENCHIDO),
    );
    await withTenant(anfitriaoId, (tx) =>
      preencherFnrh(tx, anfitriaoId, token, {
        ...PREENCHIDO,
        acompanhantes: [{ nome: "Pedro da Silva", documento: "7654321" }],
      }),
    );

    const acs = await dbOwner
      .select()
      .from(acompanhante)
      .where(eq(acompanhante.reservaId, r.id));
    expect(acs.map((a) => a.nome)).toEqual(["Pedro da Silva"]);
  });

  it("recusa token vencido, mesmo com a página já aberta", async () => {
    // Entre abrir o formulário e enviá-lo pode ter passado um mês. Validar só
    // na exibição é confiar que o mundo não muda entre duas requisições.
    const r = await reservaConfirmada();
    const { token } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );
    await dbOwner
      .update(reserva)
      .set({ fnrhExpiraEm: new Date(Date.now() - 1000) })
      .where(eq(reserva.id, r.id));

    const resultado = await withTenant(anfitriaoId, (tx) =>
      preencherFnrh(tx, anfitriaoId, token, PREENCHIDO),
    );
    expect(resultado).toBeNull();

    const [h] = await dbOwner
      .select()
      .from(hospede)
      .where(eq(hospede.id, r.hospedeId));
    expect(h!.documento).toBeNull();
  });

  it("recusa token de outra reserva qualquer", async () => {
    await reservaConfirmada();
    const resultado = await withTenant(anfitriaoId, (tx) =>
      preencherFnrh(tx, anfitriaoId, "token-inventado", PREENCHIDO),
    );
    expect(resultado).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("o que a página pública enxerga", () => {
  it("mostra a estadia e o titular, e nada de dinheiro", async () => {
    const r = await reservaConfirmada();
    const { token } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );

    const ficha = await withTenant(anfitriaoId, (tx) =>
      fichaPorToken(tx, token),
    );

    expect(ficha?.codigo).toBe(r.codigo);
    expect(ficha?.titular.nome).toBe("Joana");
    expect(ficha?.adultos).toBe(4);

    // Quem está do outro lado tem um link e mais nada. Um link que vaza não
    // pode virar acesso ao financeiro da casa.
    const texto = JSON.stringify(ficha);
    expect(texto).not.toContain("totalCentavos");
    expect(texto).not.toContain("sinalCentavos");
    expect(texto).not.toContain("orcamento");
    expect(texto).not.toContain(String(r.totalCentavos));
  });

  it("não devolve nada para token vencido", async () => {
    const r = await reservaConfirmada();
    const { token } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );
    await dbOwner
      .update(reserva)
      .set({ fnrhExpiraEm: new Date(Date.now() - 1000) })
      .where(eq(reserva.id, r.id));

    expect(
      await withTenant(anfitriaoId, (tx) => fichaPorToken(tx, token)),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("conferir", () => {
  it("só confere o que foi preenchido", async () => {
    const r = await reservaConfirmada();
    await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );

    await expect(
      withTenant(anfitriaoId, (tx) =>
        conferirFnrh(tx, anfitriaoId, r.id, AUTOR),
      ),
    ).rejects.toThrow(/Só se confere/);
  });

  it("confere a ficha preenchida", async () => {
    const r = await reservaConfirmada();
    const { token } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );
    await withTenant(anfitriaoId, (tx) =>
      preencherFnrh(tx, anfitriaoId, token, PREENCHIDO),
    );

    await withTenant(anfitriaoId, (tx) =>
      conferirFnrh(tx, anfitriaoId, r.id, AUTOR),
    );

    const [depois] = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.id, r.id));
    expect(depois!.fnrhStatus).toBe("conferida");
  });

  it("corrigir depois de conferida volta para preenchida", async () => {
    // A conferência valeu para o que a recepção viu, não para o que veio
    // depois.
    const r = await reservaConfirmada();
    const { token } = await withTenant(anfitriaoId, (tx) =>
      enviarLinkDaFnrh(tx, anfitriaoId, r.id, AUTOR),
    );
    await withTenant(anfitriaoId, (tx) =>
      preencherFnrh(tx, anfitriaoId, token, PREENCHIDO),
    );
    await withTenant(anfitriaoId, (tx) =>
      conferirFnrh(tx, anfitriaoId, r.id, AUTOR),
    );

    await withTenant(anfitriaoId, (tx) =>
      preencherFnrh(tx, anfitriaoId, token, {
        ...PREENCHIDO,
        documento: "outro documento",
      }),
    );

    const [depois] = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.id, r.id));
    expect(depois!.fnrhStatus).toBe("preenchida");
  });
});
