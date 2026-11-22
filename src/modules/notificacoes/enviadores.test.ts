import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { type Enviador, assinar, enviadorRiiaWebhook } from "./enviadores";

/** Só o HMAC, sem o prefixo `t=`. */
const hex = (assinatura: string) => assinatura.split("v1=")[1];

describe("assinatura do webhook da RIIA", () => {
  const SEGREDO = "segredo-de-teste";
  const CORPO = '{"canal":"whatsapp","telefone":"5562999999999"}';

  it("tem o formato t=<época>,v1=<hex>", async () => {
    const a = await assinar(CORPO, SEGREDO, 1_700_000_000_000);
    expect(a).toBe(
      `t=1700000000,v1=${createHmac("sha256", SEGREDO)
        .update(`1700000000.${CORPO}`)
        .digest("hex")}`,
    );
  });

  it("assina o timestamp junto com o corpo", async () => {
    // É o que impede reenvio: a mesma requisição capturada não pode ser
    // remandada depois com data nova, porque a data faz parte do que foi
    // assinado. Quem recebe compara o `t` com o próprio relógio.
    //
    // Comparar as strings inteiras não provaria nada — o `t=` do prefixo muda
    // de qualquer jeito. O que importa é o HMAC mudar com ele; se só o
    // prefixo mudasse, bastaria reescrever o `t` para o aviso de ontem passar
    // por novo.
    const a = await assinar(CORPO, SEGREDO, 1_700_000_000_000);
    const b = await assinar(CORPO, SEGREDO, 1_700_000_060_000);
    expect(hex(a)).not.toBe(hex(b));
  });

  it("muda quando o corpo muda", async () => {
    const a = await assinar(CORPO, SEGREDO, 1_700_000_000_000);
    const b = await assinar(CORPO + " ", SEGREDO, 1_700_000_000_000);
    expect(hex(a)).not.toBe(hex(b));
  });

  it("muda quando o segredo muda", async () => {
    const a = await assinar(CORPO, SEGREDO, 1_700_000_000_000);
    const b = await assinar(CORPO, "outro-segredo", 1_700_000_000_000);
    expect(hex(a)).not.toBe(hex(b));
  });

  it("confere com o HMAC do Node, para a RIIA poder validar com o padrão", async () => {
    const nossa = await assinar(CORPO, SEGREDO, 1_700_000_000_000);
    const esperado = createHmac("sha256", SEGREDO)
      .update(`1700000000.${CORPO}`)
      .digest("hex");
    expect(hex(nossa)).toBe(esperado);
    expect(hex(nossa)).toHaveLength(64);
  });

  it("usa segundos, não milissegundos, no `t`", async () => {
    // Trocar isso por `Date.now()` inteiro daria um `t` mil vezes maior; quem
    // valida compararia com o próprio relógio em segundos e recusaria tudo
    // como "vindo do futuro".
    const a = await assinar(CORPO, SEGREDO, 1_700_000_000_999);
    expect(a.startsWith("t=1700000000,")).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("o corpo que vai para a RIIA", () => {
  /** Captura o que o enviador manda, sem rede. */
  async function capturar(mensagem: Parameters<Enviador["enviar"]>[0]) {
    const chamadas: { url: string; corpo: string; cabecalhos: Headers }[] = [];
    const original = globalThis.fetch;

    globalThis.fetch = (async (url: string, init: RequestInit) => {
      chamadas.push({
        url: String(url),
        corpo: String(init.body),
        cabecalhos: new Headers(init.headers),
      });
      return new Response("", { status: 200 });
    }) as typeof fetch;

    try {
      await enviadorRiiaWebhook("https://riia.exemplo/entregar", "s3gr3d0").enviar(
        mensagem,
      );
    } finally {
      globalThis.fetch = original;
    }
    return chamadas[0]!;
  }

  const MENSAGEM = {
    id: "11111111-2222-3333-4444-555555555555",
    destinatario: "5562988887777",
    nomeDestinatario: "Carla",
    assunto: null,
    corpo: "Sua reserva está confirmada.",
    evento: "reserva.confirmada",
    tentativa: 2,
    referenciaTipo: "reserva",
    referenciaId: "aaaa1111-2222-3333-4444-555555555555",
  };

  it("leva o id da mensagem, para a RIIA descartar repetição", async () => {
    // Sem ele, uma entrega que deu tempo esgotado DEPOIS de a RIIA ter
    // mandado no WhatsApp faz o hóspede receber duas vezes: do nosso lado a
    // tentativa falhou, do lado dela deu certo.
    const { corpo } = await capturar(MENSAGEM);
    const d = JSON.parse(corpo);

    expect(d.id).toBe(MENSAGEM.id);
    expect(d.telefone).toBe("5562988887777");
    expect(d.texto).toBe("Sua reserva está confirmada.");
    expect(d.evento).toBe("reserva.confirmada");
    expect(d.tentativa).toBe(2);
    expect(d.referencia).toEqual({ tipo: "reserva", id: MENSAGEM.referenciaId });
  });

  it("o id é o mesmo em toda tentativa da mesma mensagem", async () => {
    const primeira = JSON.parse((await capturar(MENSAGEM)).corpo);
    const segunda = JSON.parse(
      (await capturar({ ...MENSAGEM, tentativa: 3 })).corpo,
    );

    expect(segunda.id).toBe(primeira.id);
    // Só a tentativa muda — é o que distingue reenvio de mensagem nova.
    expect(segunda.tentativa).not.toBe(primeira.tentativa);
  });

  it("vai assinado, e a assinatura cobre o corpo inteiro", async () => {
    const { corpo, cabecalhos } = await capturar(MENSAGEM);
    const assinatura = cabecalhos.get("X-VillaPeri-Assinatura");

    expect(assinatura).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);

    const t = assinatura!.match(/t=(\d+)/)![1];
    const esperado = createHmac("sha256", "s3gr3d0")
      .update(`${t}.${corpo}`)
      .digest("hex");
    expect(assinatura).toBe(`t=${t},v1=${esperado}`);
  });

  it("resposta fora do 2xx vira erro, para a mensagem continuar na fila", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("fila cheia", { status: 503 })) as typeof fetch;

    try {
      await expect(
        enviadorRiiaWebhook("https://riia.exemplo/entregar", "s").enviar(MENSAGEM),
      ).rejects.toThrow(/503/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
