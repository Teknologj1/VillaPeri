import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { assinar } from "./enviadores";

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
