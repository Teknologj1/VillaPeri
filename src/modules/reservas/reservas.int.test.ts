
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

import { hospede, pagamento, reserva, solicitacao } from "./schema";
import {
  NoiteIndisponivelError,
  criarReserva,
  criarSolicitacao,
  mudarStatus,
} from "./service";
import { TransicaoInvalidaError } from "./status";

config({ path: [".env.local", ".env"], quiet: true });

const urlOwner = process.env.DATABASE_URL_MIGRATOR;
if (!urlOwner) throw new Error("DATABASE_URL_MIGRATOR é necessária nos testes.");
const clienteOwner = postgres(urlOwner, { max: 5 });
const dbOwner = drizzle(clienteOwner, { schema });

const NOME = "__teste_reservas";
const SEMANA = 54_300;
const FDS = 75_000;

let anfitriaoId: string;
let propriedadeId: string;
let tipoId: string;
let unidadeId: string;

const AUTOR = { tipo: "sistema" } as const;

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
    .values({
      anfitriaoId,
      nome: "Casa de teste",
      sinalPontosBase: 3_000,
      emailContato: "anfitriao@teste.local",
      whatsappContato: "5562900000000",
    })
    .returning();
  propriedadeId = p!.id;

  const [t] = await dbOwner
    .insert(tipoAcomodacao)
    .values({
      anfitriaoId,
      propriedadeId,
      nome: "Casa inteira",
      slug: "casa-teste-reservas",
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
    propriedadeId,
    nome: "Diária padrão",
    nivel: "padrao",
    precoSemanaCentavos: SEMANA,
    precoFimDeSemanaCentavos: FDS,
    valorPessoaExtraCentavos: 11_000,
    valorCriancaCentavos: 5_500,
  });

  await dbOwner.insert(politicaCancelamento).values({
    anfitriaoId,
    nome: "Padrão",
    faixas: [{ diasAntes: 7, percentualPontosBase: 10_000 }],
    padrao: true,
  });
});

beforeEach(async () => {
  for (const t of [notificacao, noiteOcupada, pagamento, reserva, solicitacao]) {
    await dbOwner.delete(t).where(eq(t.anfitriaoId, anfitriaoId));
  }
});

afterAll(async () => {
  await limpar();
  await clienteOwner.end();
  await fecharConexao();
});

const PEDIDO = {
  unidadeId: "",
  tipoId: "",
  entrada: "2027-03-08", // segunda
  saida: "2027-03-10",
  adultos: 4,
  criancas: 0,
  hospede: {
    nome: "Maria",
    telefone: "(62) 98888-7777",
    email: "maria@teste.local",
  },
  autor: AUTOR,
};

function pedido(ajustes: Record<string, unknown> = {}) {
  return { ...PEDIDO, unidadeId, tipoId, ...ajustes };
}

// ---------------------------------------------------------------------------

describe("solicitação vinda do site", () => {
  it("registra o pedido e NÃO segura as noites", async () => {
    const s = await withTenant(anfitriaoId, (tx) =>
      criarSolicitacao(tx, anfitriaoId, {
        nome: "João",
        telefone: "62988887777",
        email: "joao@teste.local",
        entrada: "2027-03-08",
        saida: "2027-03-10",
        adultos: 2,
        criancas: 0,
        totalCotadoCentavos: 108_600,
      }),
    );

    expect(s.codigo).toMatch(/^VP-[2-9A-Z]{4}$/);
    expect(s.status).toBe("nova");

    // A decisão da especificação: pedido do site não trava o calendário.
    const ocupadas = await dbOwner
      .select()
      .from(noiteOcupada)
      .where(eq(noiteOcupada.anfitriaoId, anfitriaoId));
    expect(ocupadas).toEqual([]);
  });

  it("enfileira quatro avisos: hóspede e anfitrião, por e-mail e WhatsApp", async () => {
    const s = await withTenant(anfitriaoId, (tx) =>
      criarSolicitacao(tx, anfitriaoId, {
        nome: "João",
        telefone: "(62) 98888-7777",
        email: "joao@teste.local",
        entrada: "2027-04-05",
        saida: "2027-04-07",
        adultos: 2,
        criancas: 0,
      }),
    );

    const fila = await dbOwner
      .select()
      .from(notificacao)
      .where(eq(notificacao.referenciaId, s.id));

    expect(fila).toHaveLength(4);
    expect(new Set(fila.map((n) => `${n.paraQuem}:${n.canal}`))).toEqual(
      new Set([
        "hospede:email",
        "hospede:whatsapp",
        "anfitriao:email",
        "anfitriao:whatsapp",
      ]),
    );
    expect(fila.every((n) => n.status === "pendente")).toBe(true);
  });

  it("limpa a pontuação do telefone para o WhatsApp", async () => {
    const s = await withTenant(anfitriaoId, (tx) =>
      criarSolicitacao(tx, anfitriaoId, {
        nome: "João",
        telefone: "(62) 98888-7777",
        entrada: "2027-04-05",
        saida: "2027-04-07",
        adultos: 2,
        criancas: 0,
      }),
    );

    const [zap] = await dbOwner
      .select()
      .from(notificacao)
      .where(eq(notificacao.referenciaId, s.id));
    const doHospede = (
      await dbOwner.select().from(notificacao).where(eq(notificacao.referenciaId, s.id))
    ).find((n) => n.canal === "whatsapp" && n.paraQuem === "hospede");

    expect(zap).toBeDefined();
    expect(doHospede?.destinatario).toBe("62988887777");
  });

  it("não inventa destinatário quando falta o contato", async () => {
    const s = await withTenant(anfitriaoId, (tx) =>
      criarSolicitacao(tx, anfitriaoId, {
        nome: "Sem contato",
        entrada: "2027-04-05",
        saida: "2027-04-07",
        adultos: 2,
        criancas: 0,
      }),
    );

    const fila = await dbOwner
      .select()
      .from(notificacao)
      .where(eq(notificacao.referenciaId, s.id));

    // Só os dois do anfitrião; o hóspede não deixou e-mail nem telefone.
    expect(fila).toHaveLength(2);
    expect(fila.every((n) => n.paraQuem === "anfitriao")).toBe(true);
  });

  it("o texto do hóspede não promete a data", async () => {
    // A solicitação não segura noites; dizer "reservado" e depois a data não
    // estar livre é pior que não mandar mensagem.
    const s = await withTenant(anfitriaoId, (tx) =>
      criarSolicitacao(tx, anfitriaoId, {
        nome: "João",
        email: "joao@teste.local",
        entrada: "2027-04-05",
        saida: "2027-04-07",
        adultos: 2,
        criancas: 0,
      }),
    );
    const [msg] = await dbOwner
      .select()
      .from(notificacao)
      .where(eq(notificacao.referenciaId, s.id));
    expect(msg?.corpo).toContain("ainda não garante as datas");
  });
});

// ---------------------------------------------------------------------------

describe("criar reserva", () => {
  it("ocupa as noites com o preço de cada uma", async () => {
    const r = await withTenant(anfitriaoId, (tx) =>
      criarReserva(tx, anfitriaoId, pedido()),
    );

    expect(r.codigo).toMatch(/^R-[2-9A-Z]{4}$/);
    expect(r.status).toBe("pre_reserva");
    // Segunda e terça: duas diárias de meio de semana.
    expect(r.totalCentavos).toBe(SEMANA * 2);
    expect(r.sinalCentavos).toBe(Math.round(SEMANA * 2 * 0.3));

    const ocupadas = await dbOwner
      .select()
      .from(noiteOcupada)
      .where(eq(noiteOcupada.anfitriaoId, anfitriaoId));
    expect(ocupadas.map((n) => n.noite).sort()).toEqual([
      "2027-03-08",
      "2027-03-09",
    ]);
    expect(ocupadas.every((n) => n.precoCentavos === SEMANA)).toBe(true);
    expect(ocupadas.every((n) => n.regraTarifaId !== null)).toBe(true);
  });

  it("congela o orçamento: mudar a tarifa depois não mexe na reserva", async () => {
    const r = await withTenant(anfitriaoId, (tx) =>
      criarReserva(tx, anfitriaoId, pedido()),
    );
    const totalNaHora = r.totalCentavos;

    await dbOwner
      .update(regraTarifa)
      .set({ precoSemanaCentavos: 99_900 })
      .where(eq(regraTarifa.anfitriaoId, anfitriaoId));

    const [depois] = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.id, r.id))
      .limit(1);
    expect(depois?.totalCentavos).toBe(totalNaHora);

    await dbOwner
      .update(regraTarifa)
      .set({ precoSemanaCentavos: SEMANA })
      .where(eq(regraTarifa.anfitriaoId, anfitriaoId));
  });

  it("cobra o adicional por pessoa além da ocupação base", async () => {
    const r = await withTenant(anfitriaoId, (tx) =>
      criarReserva(tx, anfitriaoId, pedido({ adultos: 6, criancas: 2 })),
    );
    // 2 adultos extras × 110 × 2 noites + 2 crianças × 55 × 2 noites
    expect(r.totalCentavos).toBe(SEMANA * 2 + 44_000 + 22_000);
  });

  it("reúsa a ficha do hóspede pelo telefone e marca como recorrente", async () => {
    const primeira = await withTenant(anfitriaoId, (tx) =>
      criarReserva(tx, anfitriaoId, pedido()),
    );
    const segunda = await withTenant(anfitriaoId, (tx) =>
      criarReserva(
        tx,
        anfitriaoId,
        pedido({ entrada: "2027-05-10", saida: "2027-05-12" }),
      ),
    );

    expect(segunda.hospedeId).toBe(primeira.hospedeId);
    const [h] = await dbOwner
      .select()
      .from(hospede)
      .where(eq(hospede.id, primeira.hospedeId))
      .limit(1);
    expect(h?.recorrente).toBe(true);
  });

  it("duas reservas simultâneas na mesma noite: exatamente uma passa", async () => {
    const resultados = await Promise.allSettled([
      withTenant(anfitriaoId, (tx) => criarReserva(tx, anfitriaoId, pedido())),
      withTenant(anfitriaoId, (tx) =>
        criarReserva(tx, anfitriaoId, {
          ...pedido(),
          hospede: { nome: "Outro", telefone: "62977776666" },
        }),
      ),
    ]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const falha = resultados.find((r) => r.status === "rejected");
    expect(falha?.reason).toBeInstanceOf(NoiteIndisponivelError);

    // E não sobrou reserva pela metade: a transação que falhou desfez tudo.
    const reservas = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.anfitriaoId, anfitriaoId));
    expect(reservas).toHaveLength(1);

    const ocupadas = await dbOwner
      .select()
      .from(noiteOcupada)
      .where(eq(noiteOcupada.anfitriaoId, anfitriaoId));
    expect(ocupadas).toHaveLength(2);
  });

  it("com desconto acima do limite, nasce aguardando aprovação E SEGURA as noites", async () => {
    // A reserva existe e trava a data enquanto o Gerente decide. Deixar a
    // data livre durante a espera faria o hóspede perder a reserva no tempo
    // que a aprovação leva — e a recepção teria prometido algo que o sistema
    // não guardou.
    const r = await withTenant(anfitriaoId, (tx) =>
      criarReserva(
        tx,
        anfitriaoId,
        pedido({
          descontoPontosBase: 2_000, // 20%
          statusInicial: "aguardando_aprovacao",
        }),
      ),
    );

    expect(r.status).toBe("aguardando_aprovacao");
    expect(r.descontoPontosBase).toBe(2_000);

    const ocupadas = await dbOwner
      .select()
      .from(noiteOcupada)
      .where(eq(noiteOcupada.origemId, r.id));
    expect(ocupadas.map((n) => n.noite).sort()).toEqual([
      "2027-03-08",
      "2027-03-09",
    ]);

    // E o desconto entra no total congelado, não fica só anotado na coluna.
    const semDesconto = SEMANA * 2;
    expect(r.totalCentavos).toBeLessThan(semDesconto);
    expect(r.totalCentavos).toBe(semDesconto - Math.round(semDesconto * 0.2));
  });

  it("grava auditoria da criação", async () => {
    const r = await withTenant(anfitriaoId, (tx) =>
      criarReserva(tx, anfitriaoId, pedido()),
    );
    const registros = await dbOwner
      .select()
      .from(auditoria)
      .where(eq(auditoria.entidadeId, r.id));
    expect(registros.some((x) => x.acao === "criou")).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("mudança de status", () => {
  async function novaReserva() {
    return withTenant(anfitriaoId, (tx) => criarReserva(tx, anfitriaoId, pedido()));
  }

  it("percorre o fluxo até a conclusão, mantendo as noites", async () => {
    const r = await novaReserva();

    for (const destino of ["confirmada", "hospedado", "concluida"] as const) {
      await withTenant(anfitriaoId, (tx) =>
        mudarStatus(tx, anfitriaoId, r.id, destino, { autor: AUTOR }),
      );
    }

    const [final] = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.id, r.id))
      .limit(1);
    expect(final?.status).toBe("concluida");

    // A estadia aconteceu: o calendário tem de continuar mostrando ocupação,
    // senão o relatório de ocupação mente.
    const ocupadas = await dbOwner
      .select()
      .from(noiteOcupada)
      .where(eq(noiteOcupada.origemId, r.id));
    expect(ocupadas).toHaveLength(2);
  });

  it("confirmar gera o token da FNRH e limpa o prazo de expiração", async () => {
    const r = await novaReserva();
    expect(r.expiraEm).not.toBeNull();
    expect(r.fnrhToken).toBeNull();

    await withTenant(anfitriaoId, (tx) =>
      mudarStatus(tx, anfitriaoId, r.id, "confirmada", { autor: AUTOR }),
    );

    const [depois] = await dbOwner
      .select()
      .from(reserva)
      .where(eq(reserva.id, r.id))
      .limit(1);
    expect(depois?.expiraEm).toBeNull();
    expect(depois?.fnrhToken).toBeTruthy();
    expect(depois?.fnrhExpiraEm).not.toBeNull();
  });

  it("confirmar avisa hóspede e anfitrião pelos dois canais", async () => {
    const r = await novaReserva();
    await withTenant(anfitriaoId, (tx) =>
      mudarStatus(tx, anfitriaoId, r.id, "confirmada", { autor: AUTOR }),
    );

    const fila = await dbOwner
      .select()
      .from(notificacao)
      .where(eq(notificacao.referenciaId, r.id));
    expect(fila).toHaveLength(4);
    expect(fila.every((n) => n.evento === "reserva.confirmada")).toBe(true);
    const doHospede = fila.find((n) => n.paraQuem === "hospede");
    expect(doHospede?.corpo).toContain("está confirmada");
  });

  it("cancelar libera as noites e a data volta a vender", async () => {
    const r = await novaReserva();
    await withTenant(anfitriaoId, (tx) =>
      mudarStatus(tx, anfitriaoId, r.id, "cancelada", {
        autor: AUTOR,
        motivo: "desistiu",
      }),
    );

    const ocupadas = await dbOwner
      .select()
      .from(noiteOcupada)
      .where(eq(noiteOcupada.origemId, r.id));
    expect(ocupadas).toEqual([]);

    // E a mesma data aceita outra reserva.
    const outra = await withTenant(anfitriaoId, (tx) =>
      criarReserva(tx, anfitriaoId, {
        ...pedido(),
        hospede: { nome: "Outro", telefone: "62955554444" },
      }),
    );
    expect(outra.id).not.toBe(r.id);
  });

  it("no-show libera as noites", async () => {
    const r = await novaReserva();
    await withTenant(anfitriaoId, (tx) =>
      mudarStatus(tx, anfitriaoId, r.id, "confirmada", { autor: AUTOR }),
    );
    await withTenant(anfitriaoId, (tx) =>
      mudarStatus(tx, anfitriaoId, r.id, "no_show", { autor: AUTOR }),
    );

    const ocupadas = await dbOwner
      .select()
      .from(noiteOcupada)
      .where(eq(noiteOcupada.origemId, r.id));
    expect(ocupadas).toEqual([]);
  });

  it("recusa caminho que não existe", async () => {
    const r = await novaReserva();
    await expect(
      withTenant(anfitriaoId, (tx) =>
        mudarStatus(tx, anfitriaoId, r.id, "concluida", { autor: AUTOR }),
      ),
    ).rejects.toBeInstanceOf(TransicaoInvalidaError);
  });

  it("calcula a devolução pela política e pelo que foi pago", async () => {
    const r = await novaReserva();
    await withTenant(anfitriaoId, (tx) =>
      mudarStatus(tx, anfitriaoId, r.id, "confirmada", { autor: AUTOR }),
    );

    await dbOwner.insert(pagamento).values({
      anfitriaoId,
      reservaId: r.id,
      tipo: "sinal",
      valorCentavos: r.sinalCentavos,
      metodo: "pix",
      data: "2027-01-10",
    });

    // Cancelando com bastante antecedência: devolve o sinal inteiro.
    const comPrazo = await withTenant(anfitriaoId, (tx) =>
      mudarStatus(tx, anfitriaoId, r.id, "cancelada", {
        autor: AUTOR,
        hojeNaCasa: "2027-01-15",
      }),
    );
    expect(comPrazo.devolucaoCentavos).toBe(r.sinalCentavos);
    expect(comPrazo.noitesLiberadas).toBe(true);
  });

  it("não devolve nada em cima da hora", async () => {
    const r = await novaReserva();
    await withTenant(anfitriaoId, (tx) =>
      mudarStatus(tx, anfitriaoId, r.id, "confirmada", { autor: AUTOR }),
    );
    await dbOwner.insert(pagamento).values({
      anfitriaoId,
      reservaId: r.id,
      tipo: "sinal",
      valorCentavos: r.sinalCentavos,
      metodo: "pix",
      data: "2027-03-01",
    });

    // Três dias antes da entrada: abaixo dos sete da política.
    const emCima = await withTenant(anfitriaoId, (tx) =>
      mudarStatus(tx, anfitriaoId, r.id, "cancelada", {
        autor: AUTOR,
        hojeNaCasa: "2027-03-05",
      }),
    );
    expect(emCima.devolucaoCentavos).toBe(0);
  });
});
