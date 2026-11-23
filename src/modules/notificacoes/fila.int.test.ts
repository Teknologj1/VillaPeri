import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { fecharConexao } from "@/db/client";
import * as schema from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { anfitriao } from "@/modules/anfitriao/schema";

import { drenarFila, enfileirar } from "./service";
import { notificacao } from "./schema";

config({ path: [".env.local", ".env"], quiet: true });

const clienteOwner = postgres(process.env.DATABASE_URL_MIGRATOR!, { max: 5 });
const dbOwner = drizzle(clienteOwner, { schema });

const NOME = "__teste_fila";
let anfitriaoId: string;

/**
 * As mensagens entregues, por tentativa.
 *
 * O enviador de verdade fala com Resend e com a RIIA. Aqui o que importa é
 * QUANTAS vezes cada mensagem saiu, não para onde.
 */
const entregues: string[] = [];
let demora = 0;
let falharProximas = 0;
/** O status que o provedor falso devolve ao falhar. */
let statusDaFalha = 503;

beforeAll(async () => {
  // Um enviador falso, posto no ambiente: `enviadorDoCanal` lê daqui.
  process.env.RESEND_API_KEY = "re_teste";
  process.env.EMAIL_REMETENTE = "teste@villaperi.test";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (!String(url).includes("resend.com")) {
      return originalFetch(url as never, init as never);
    }
    const corpo = JSON.parse(String(init.body)) as { text: string };
    if (demora > 0) await new Promise((r) => setTimeout(r, demora));
    if (falharProximas > 0) {
      falharProximas--;
      return new Response("falha do provedor", { status: statusDaFalha });
    }
    entregues.push(corpo.text);
    return new Response(JSON.stringify({ id: "msg" }), { status: 200 });
  }) as typeof fetch;

  const [existente] = await dbOwner
    .select()
    .from(anfitriao)
    .where(eq(anfitriao.nome, NOME))
    .limit(1);
  if (existente) {
    await dbOwner
      .delete(notificacao)
      .where(eq(notificacao.anfitriaoId, existente.id));
    await dbOwner.delete(anfitriao).where(eq(anfitriao.id, existente.id));
  }

  const [a] = await dbOwner
    .insert(anfitriao)
    .values({ nome: NOME, status: "ativa" })
    .returning();
  anfitriaoId = a!.id;
});

beforeEach(async () => {
  entregues.length = 0;
  demora = 0;
  falharProximas = 0;
  statusDaFalha = 503;
  await dbOwner
    .delete(notificacao)
    .where(eq(notificacao.anfitriaoId, anfitriaoId));
});

afterEach(() => {
  demora = 0;
});

afterAll(async () => {
  await dbOwner
    .delete(notificacao)
    .where(eq(notificacao.anfitriaoId, anfitriaoId));
  await dbOwner.delete(anfitriao).where(eq(anfitriao.id, anfitriaoId));
  await clienteOwner.end();
  await fecharConexao();
});

async function enfileirarUma(texto: string) {
  await withTenant(anfitriaoId, (tx) =>
    enfileirar(tx, [
      {
        anfitriaoId,
        canal: "email",
        paraQuem: "hospede",
        destinatario: "hospede@teste.local",
        nomeDestinatario: "Hóspede",
        assunto: "Teste",
        corpo: texto,
        evento: "teste",
        referenciaTipo: "reserva",
        referenciaId: crypto.randomUUID(),
      },
    ]),
  );
}

async function linhas() {
  return dbOwner
    .select()
    .from(notificacao)
    .where(eq(notificacao.anfitriaoId, anfitriaoId));
}

// ---------------------------------------------------------------------------

describe("drenar a fila", () => {
  it("entrega e marca como enviada", async () => {
    await enfileirarUma("olá");

    const r = await drenarFila(anfitriaoId);

    expect(r.enviadas).toBe(1);
    expect(entregues).toEqual(["olá"]);

    const [linha] = await linhas();
    expect(linha!.status).toBe("enviada");
    expect(linha!.tentativas).toBe(1);
    expect(linha!.enviadaEm).not.toBeNull();
    expect(linha!.reservadaEm).toBeNull();
  });

  it("a mensagem que falha volta para a fila, com o erro guardado", async () => {
    await enfileirarUma("vai falhar");
    falharProximas = 1;

    const r = await drenarFila(anfitriaoId);

    expect(r.falharam).toBe(1);
    const [linha] = await linhas();
    expect(linha!.status).toBe("pendente");
    expect(linha!.tentativas).toBe(1);
    expect(linha!.ultimoErro).toMatch(/503/);
    // Solta a reserva: outro drenador pode pegá-la em seguida.
    expect(linha!.reservadaEm).toBeNull();

    // E a próxima passada entrega.
    const segunda = await drenarFila(anfitriaoId);
    expect(segunda.enviadas).toBe(1);
    expect(entregues).toEqual(["vai falhar"]);
  });

  it("desiste ao esgotar as tentativas", async () => {
    await enfileirarUma("sem sorte");
    falharProximas = 99;

    for (let i = 0; i < 6; i++) await drenarFila(anfitriaoId);

    const [linha] = await linhas();
    expect(linha!.status).toBe("falhou");
    expect(linha!.tentativas).toBe(5);
    expect(entregues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("dois drenadores ao mesmo tempo", () => {
  it("NÃO mandam a mesma mensagem duas vezes", async () => {
    // É o caso que passou a existir ao drenar logo depois do fato: a tarefa
    // agendada e a entrega imediata podem cair no mesmo instante. Sem
    // reservar a linha antes de enviar, os dois selecionam a mesma pendente
    // e o hóspede recebe a confirmação em dobro.
    await enfileirarUma("uma vez só");

    // A demora alarga a janela entre selecionar e marcar — é justamente nela
    // que o segundo drenador roubaria a mensagem.
    demora = 150;

    const [a, b] = await Promise.all([
      drenarFila(anfitriaoId),
      drenarFila(anfitriaoId),
    ]);

    expect(entregues).toEqual(["uma vez só"]);
    expect(a.enviadas + b.enviadas).toBe(1);

    const todas = await linhas();
    expect(todas).toHaveLength(1);
    expect(todas[0]!.status).toBe("enviada");
    expect(todas[0]!.tentativas).toBe(1);
  });

  it("dividem o trabalho em vez de disputá-lo", async () => {
    // `skip locked`: o segundo drenador pula o que o primeiro travou e leva
    // outras mensagens, em vez de esperar.
    for (let i = 0; i < 6; i++) await enfileirarUma(`mensagem ${i}`);
    demora = 60;

    const [a, b] = await Promise.all([
      drenarFila(anfitriaoId, 3),
      drenarFila(anfitriaoId, 3),
    ]);

    expect(a.enviadas + b.enviadas).toBe(6);
    expect(entregues).toHaveLength(6);
    expect(new Set(entregues).size).toBe(6);
  });
});

// ---------------------------------------------------------------------------

describe("destravar", () => {
  it("mensagem presa em 'enviando' volta à fila depois do prazo", async () => {
    // O drenador morreu no meio do envio. Sem destravar, a mensagem ficaria
    // reservada para sempre e nunca mais sairia.
    await enfileirarUma("ficou presa");
    const [linha] = await linhas();
    await dbOwner
      .update(notificacao)
      .set({
        status: "enviando",
        reservadaEm: new Date(Date.now() - 10 * 60_000),
      })
      .where(eq(notificacao.id, linha!.id));

    const r = await drenarFila(anfitriaoId);

    expect(r.enviadas).toBe(1);
    expect(entregues).toEqual(["ficou presa"]);
  });

  it("mensagem reservada AGORA não é roubada", async () => {
    // O outro drenador ainda está enviando. Pegá-la agora é exatamente o
    // envio em dobro que a reserva existe para impedir.
    await enfileirarUma("em curso");
    const [linha] = await linhas();
    await dbOwner
      .update(notificacao)
      .set({ status: "enviando", reservadaEm: new Date() })
      .where(eq(notificacao.id, linha!.id));

    const r = await drenarFila(anfitriaoId);

    expect(r.enviadas).toBe(0);
    expect(entregues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("o provedor dizendo 'não insista'", () => {
  it("422 desiste na PRIMEIRA, sem gastar as cinco tentativas", async () => {
    // É o combinado com a RIIA: 422 é número sem WhatsApp. Insistir não muda
    // o resultado — só atrasa o momento em que a recepção descobre que o
    // hóspede não foi avisado.
    await enfileirarUma("número sem WhatsApp");
    statusDaFalha = 422;
    falharProximas = 99;

    const r = await drenarFila(anfitriaoId);

    expect(r.falharam).toBe(1);
    const [linha] = await linhas();
    expect(linha!.status).toBe("falhou");
    expect(linha!.tentativas).toBe(1);
    expect(linha!.ultimoErro).toMatch(/422/);
  });

  it("e não é tentada de novo nas passadas seguintes", async () => {
    await enfileirarUma("número sem WhatsApp");
    statusDaFalha = 422;
    falharProximas = 99;
    await drenarFila(anfitriaoId);

    const chamadasAntes = falharProximas;
    const segunda = await drenarFila(anfitriaoId);

    expect(segunda.enviadas + segunda.falharam).toBe(0);
    expect(falharProximas).toBe(chamadasAntes);
  });

  it("503 continua tentando — é falha passageira, e o provedor volta", async () => {
    // A diferença entre os dois é a razão de o permanente existir: tratar
    // tudo igual faria um provedor fora do ar por dois minutos matar a
    // confirmação de reserva do hóspede.
    await enfileirarUma("provedor caiu");
    statusDaFalha = 503;
    falharProximas = 1;

    await drenarFila(anfitriaoId);
    const [linha] = await linhas();
    expect(linha!.status).toBe("pendente");

    const segunda = await drenarFila(anfitriaoId);
    expect(segunda.enviadas).toBe(1);
    expect(entregues).toEqual(["provedor caiu"]);
  });

  it("400 também desiste: o corpo é nosso, e reenviar manda o mesmo", async () => {
    await enfileirarUma("corpo recusado");
    statusDaFalha = 400;
    falharProximas = 99;

    await drenarFila(anfitriaoId);

    const [linha] = await linhas();
    expect(linha!.status).toBe("falhou");
    expect(linha!.tentativas).toBe(1);
  });

  it("401 e 404 continuam tentando: são configuração, que alguém conserta", async () => {
    // Segredo errado ou integração ainda não cadastrada do outro lado. Uma
    // pessoa arruma, e aí a mensagem que estava na fila sai — desistir na
    // primeira a perderia.
    for (const status of [401, 404]) {
      await dbOwner
        .delete(notificacao)
        .where(eq(notificacao.anfitriaoId, anfitriaoId));
      await enfileirarUma(`erro ${status}`);
      statusDaFalha = status;
      falharProximas = 1;

      await drenarFila(anfitriaoId);
      const [linha] = await linhas();
      expect(linha!.status, `status ${status}`).toBe("pendente");
    }
  });
});
