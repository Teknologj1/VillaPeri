import { describe, expect, it } from "vitest";

import { dentroDoLimite, hashDaChave, limparLimites } from "./chaves";
import {
  FERRAMENTAS,
  TODAS_AS_FERRAMENTAS,
  ferramentasDoNivel,
  motivoDaNegativa,
  podeUsar,
} from "./ferramentas";

/**
 * O formato da chave, testado à parte do banco.
 *
 * A primeira versão dividia a chave por "_" exigindo três pedaços — e o
 * segredo é base64url, que contém "_". Metade das chaves geradas era
 * recusada pelo próprio sistema que as criou, com a mensagem "formato
 * inválido". Estes casos existem para isso não voltar.
 */
const FORMATO = /^vp_([0-9a-f]{8})_(.+)$/;

describe("o formato da chave", () => {
  it("separa prefixo e segredo mesmo com _ e - no segredo", () => {
    const comSeparadores =
      "vp_a1b2c3d4_nW0GgrJIMKJo-JPVYVBBwgORuK0ROp_R5SpomYQ6kWk";
    const partes = FORMATO.exec(comSeparadores);

    expect(partes).not.toBeNull();
    expect(partes![1]).toBe("a1b2c3d4");
    expect(partes![2]).toBe("nW0GgrJIMKJo-JPVYVBBwgORuK0ROp_R5SpomYQ6kWk");
  });

  it("o prefixo é hexadecimal de oito, para a leitura ser posicional", () => {
    expect(FORMATO.test("vp_a1b2c3d4_segredo")).toBe(true);
    // Qualquer coisa fora disso é ambígua com o segredo base64url.
    expect(FORMATO.test("vp_A1B2C3D4_segredo")).toBe(false);
    expect(FORMATO.test("vp_a1b2c3_segredo")).toBe(false);
    expect(FORMATO.test("vp_a1b2c3d4e5_segredo")).toBe(false);
    expect(FORMATO.test("vp_a1b2c3d4_")).toBe(false);
    expect(FORMATO.test("a1b2c3d4_segredo")).toBe(false);
  });

  it("o hash é SHA-256 em hexadecimal, estável", () => {
    const h = hashDaChave("segredo-de-teste");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDaChave("segredo-de-teste")).toBe(h);
    expect(hashDaChave("segredo-de-tesce")).not.toBe(h);
  });
});

// ---------------------------------------------------------------------------

describe("escopo e nível", () => {
  it("exige as duas coisas: o escopo na chave E o nível da conta", () => {
    const chave = {
      escopos: ["buscar_disponibilidade", "criar_pre_reserva"],
      nivelAutonomia: 1,
    };

    expect(podeUsar(chave, "buscar_disponibilidade")).toBe(true);
    // Tem o escopo, mas a conta está no nível 1 e a ferramenta é do 2.
    expect(podeUsar(chave, "criar_pre_reserva")).toBe(false);
    // Está no nível, mas a chave não recebeu o escopo.
    expect(podeUsar(chave, "obter_politicas")).toBe(false);
  });

  it("baixar o nível corta as ferramentas de todas as chaves de uma vez", () => {
    // É o botão de freio da conta: sem isto, cortar a autonomia da RIIA
    // obrigaria a reeditar o escopo de cada chave, uma por uma.
    const comTudo = {
      escopos: TODAS_AS_FERRAMENTAS as string[],
      nivelAutonomia: 2,
    };
    expect(podeUsar(comTudo, "criar_pre_reserva")).toBe(true);

    const freada = { ...comTudo, nivelAutonomia: 1 };
    expect(podeUsar(freada, "criar_pre_reserva")).toBe(false);
    expect(podeUsar(freada, "solicitar_cancelamento")).toBe(false);
    expect(podeUsar(freada, "buscar_disponibilidade")).toBe(true);
  });

  it("o motivo diz QUAL das duas trancas fechou", () => {
    // A correção é em lugares diferentes: escopo se edita na chave, nível na
    // conta. "Sem permissão" mandaria o integrador procurar no lugar errado.
    const semNivel = { escopos: ["criar_pre_reserva"], nivelAutonomia: 1 };
    expect(motivoDaNegativa(semNivel, "criar_pre_reserva")).toMatch(/nível/);

    const semEscopo = { escopos: [], nivelAutonomia: 2 };
    expect(motivoDaNegativa(semEscopo, "criar_pre_reserva")).toMatch(/escopo/);
  });

  it("o nível 1 não alcança nenhuma ferramenta que muda o mundo", () => {
    const doNivel1 = ferramentasDoNivel(1);
    for (const f of doNivel1) expect(FERRAMENTAS[f].nivel).toBe(1);

    expect(doNivel1).not.toContain("criar_pre_reserva");
    expect(doNivel1).not.toContain("gerar_cobranca");
    // Mas alcança a saída para uma pessoa, que é o que torna o nível 1
    // aceitável: sem ela, um modelo encurralado inventa a resposta.
    expect(doNivel1).toContain("transferir_para_humano");
  });

  it("o nível 2 acrescenta a pré-reserva e não a cobrança", () => {
    const doNivel2 = ferramentasDoNivel(2);
    expect(doNivel2).toContain("criar_pre_reserva");
    expect(doNivel2).toContain("enviar_link_fnrh");
    expect(doNivel2).not.toContain("gerar_cobranca");
  });
});

// ---------------------------------------------------------------------------

describe("limite por minuto", () => {
  it("deixa passar até o limite e recusa depois", () => {
    limparLimites();
    const agora = 1_700_000_000_000;

    for (let i = 0; i < 3; i++) {
      expect(dentroDoLimite("k", 3, agora).ok).toBe(true);
    }
    const quarta = dentroDoLimite("k", 3, agora);
    expect(quarta.ok).toBe(false);
    expect(quarta.esperaSegundos).toBeGreaterThan(0);
  });

  it("a janela desliza: passado um minuto, volta a passar", () => {
    limparLimites();
    const agora = 1_700_000_000_000;
    for (let i = 0; i < 3; i++) dentroDoLimite("k", 3, agora);

    expect(dentroDoLimite("k", 3, agora + 59_000).ok).toBe(false);
    expect(dentroDoLimite("k", 3, agora + 61_000).ok).toBe(true);
  });

  it("cada chave tem a própria contagem", () => {
    // Uma chave gastando o limite não pode derrubar as outras do anfitrião.
    limparLimites();
    const agora = 1_700_000_000_000;
    for (let i = 0; i < 3; i++) dentroDoLimite("a", 3, agora);

    expect(dentroDoLimite("a", 3, agora).ok).toBe(false);
    expect(dentroDoLimite("b", 3, agora).ok).toBe(true);
  });
});
