"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenant } from "@/db/tenant";
import { centavosDeTexto } from "@/lib/dinheiro";
import { exigirSessao } from "@/lib/sessao";
import { atualizarPropriedade } from "@/modules/anfitriao";
import { podeNoModulo } from "@/modules/autenticacao";
import { atualizarRegraDeEstadia } from "@/modules/calendario";
import { atualizarPoliticaPadrao, atualizarRegraTarifa } from "@/modules/tarifas";

export type EstadoDasTarifas = { erro?: string; aviso?: string } | null;

/**
 * Um valor em reais, vindo do formulário, para centavos.
 *
 * Campo em branco significa "não tem este preço" (`null`), que é diferente de
 * zero: uma regra de feriado sem preço fixo cai na tarifa de baixo, enquanto
 * uma com preço fixo de R$ 0,00 daria a noite de graça.
 */
function centavos(valor: unknown): number | null | "invalido" {
  const texto = String(valor ?? "").trim();
  if (texto === "") return null;
  const c = centavosDeTexto(texto);
  if (c === null || c < 0) return "invalido";
  return c;
}

const esquemaRegra = z.object({
  id: z.uuid(),
  precoSemana: z.string().optional(),
  precoFimDeSemana: z.string().optional(),
  precoFixo: z.string().optional(),
  pessoaExtra: z.string().optional(),
  crianca: z.string().optional(),
  ativa: z.string().optional(),
});

/**
 * Muda os valores de uma regra de tarifa.
 *
 * Exige `editar` em tarifas, que pela matriz é só do Proprietário: preço é a
 * decisão mais cara da casa, e um erro aqui vale para toda cotação nova até
 * alguém perceber.
 */
export async function salvarRegraTarifa(
  _estado: EstadoDasTarifas,
  dados: FormData,
): Promise<EstadoDasTarifas> {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "tarifas", "editar")) {
    return { erro: "Só o proprietário muda preços." };
  }

  const analise = esquemaRegra.safeParse(Object.fromEntries(dados));
  if (!analise.success) return { erro: "Pedido inválido." };
  const d = analise.data;

  const campos = {
    precoSemanaCentavos: centavos(d.precoSemana),
    precoFimDeSemanaCentavos: centavos(d.precoFimDeSemana),
    precoFixoCentavos: centavos(d.precoFixo),
    valorPessoaExtraCentavos: centavos(d.pessoaExtra),
    valorCriancaCentavos: centavos(d.crianca),
  };

  // O nome que a pessoa vê na tela, não o da coluna: "valor inválido em
  // precoSemanaCentavos" manda o proprietário procurar um campo que não
  // existe no formulário.
  const ROTULO: Record<string, string> = {
    precoSemanaCentavos: "diária de semana",
    precoFimDeSemanaCentavos: "diária de fim de semana",
    precoFixoCentavos: "preço da noite",
    valorPessoaExtraCentavos: "por pessoa adicional",
    valorCriancaCentavos: "por criança",
  };

  for (const [nome, valor] of Object.entries(campos)) {
    if (valor === "invalido") {
      return {
        erro: `Valor inválido em "${ROTULO[nome] ?? nome}". Escreva como 1.234,56, ou deixe em branco.`,
      };
    }
  }

  try {
    await withTenant(sessao.anfitriaoId, (tx) =>
      atualizarRegraTarifa(
        tx,
        sessao.anfitriaoId,
        d.id,
        {
          ...(campos as Record<string, number | null>),
          ativa: d.ativa === "on",
        },
        { tipo: "usuario", id: sessao.usuarioId },
      ),
    );
  } catch (erro) {
    if (erro instanceof Error) return { erro: erro.message };
    throw erro;
  }

  revalidatePath("/painel/tarifas");
  revalidatePath("/painel/simulador");
  return { aviso: "Preços salvos. Valem para toda cotação nova a partir de agora." };
}

const esquemaCondicoes = z.object({
  sinalPercentual: z.coerce.number().min(0).max(100),
  checkin: z.string().regex(/^\d{2}:\d{2}$/, "Horário no formato 14:00."),
  checkout: z.string().regex(/^\d{2}:\d{2}$/, "Horário no formato 12:00."),
  emailContato: z.union([z.email(), z.literal("")]).optional(),
  whatsappContato: z.string().trim().max(20).optional(),
});

export async function salvarCondicoesDaCasa(
  _estado: EstadoDasTarifas,
  dados: FormData,
): Promise<EstadoDasTarifas> {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "tarifas", "editar")) {
    return { erro: "Só o proprietário muda as condições da casa." };
  }

  const analise = esquemaCondicoes.safeParse(Object.fromEntries(dados));
  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? "Confira os dados." };
  }
  const d = analise.data;

  await withTenant(sessao.anfitriaoId, (tx) =>
    atualizarPropriedade(
      tx,
      sessao.anfitriaoId,
      {
        // Percentual em pontos-base: 30% = 3000. Inteiro, como todo
        // percentual do sistema — float aqui vira diferença de centavo no
        // sinal entre o que o site cotou e o que a reserva gravou.
        sinalPontosBase: Math.round(d.sinalPercentual * 100),
        checkinPadrao: d.checkin,
        checkoutPadrao: d.checkout,
        emailContato: d.emailContato || null,
        whatsappContato: d.whatsappContato?.replace(/\D/g, "") || null,
      },
      { tipo: "usuario", id: sessao.usuarioId },
    ),
  );

  revalidatePath("/painel/tarifas");
  revalidatePath("/painel/simulador");
  return {
    aviso:
      "Condições salvas. Reserva já fechada não muda — o orçamento dela é " +
      "cópia congelada; o sinal novo vale para a próxima.",
  };
}

const esquemaEstadia = z.object({
  id: z.uuid(),
  minimoDiarias: z.string().optional(),
  maximoDiarias: z.string().optional(),
  intervaloLimpezaNoites: z.string().optional(),
});

function inteiroOuNulo(v: unknown): number | null | "invalido" {
  const t = String(v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 365) return "invalido";
  return n;
}

export async function salvarRegraEstadia(
  _estado: EstadoDasTarifas,
  dados: FormData,
): Promise<EstadoDasTarifas> {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "calendario", "editar")) {
    return { erro: "Seu perfil não muda as regras de estadia." };
  }

  const analise = esquemaEstadia.safeParse(Object.fromEntries(dados));
  if (!analise.success) return { erro: "Pedido inválido." };
  const d = analise.data;

  const minimo = inteiroOuNulo(d.minimoDiarias);
  const maximo = inteiroOuNulo(d.maximoDiarias);
  const limpeza = inteiroOuNulo(d.intervaloLimpezaNoites);
  if (minimo === "invalido" || maximo === "invalido" || limpeza === "invalido") {
    return { erro: "Use números inteiros de 0 a 365, ou deixe em branco." };
  }

  try {
    await withTenant(sessao.anfitriaoId, (tx) =>
      atualizarRegraDeEstadia(
        tx,
        sessao.anfitriaoId,
        d.id,
        {
          minimoDiarias: minimo,
          maximoDiarias: maximo,
          intervaloLimpezaNoites: limpeza,
        },
        { tipo: "usuario", id: sessao.usuarioId },
      ),
    );
  } catch (erro) {
    if (erro instanceof Error) return { erro: erro.message };
    throw erro;
  }

  revalidatePath("/painel/tarifas");
  revalidatePath("/painel/simulador");
  return { aviso: "Regra de estadia salva." };
}

const esquemaPolitica = z.object({
  diasAntes: z.coerce.number().int().min(0).max(365),
  percentualDevolvido: z.coerce.number().min(0).max(100),
  saidaAntecipadaPercentual: z.coerce.number().min(0).max(100),
});

/**
 * Muda a política de cancelamento.
 *
 * Uma faixa só, por ora: é o que a casa usa — "uma semana antes devolve
 * tudo". Várias faixas o motor já calcula; o que falta é a tela, e uma tela
 * de faixas variáveis sem necessidade é complexidade sem ganho.
 */
export async function salvarPolitica(
  _estado: EstadoDasTarifas,
  dados: FormData,
): Promise<EstadoDasTarifas> {
  const sessao = await exigirSessao();
  if (!podeNoModulo(sessao, "tarifas", "editar")) {
    return { erro: "Só o proprietário muda a política de cancelamento." };
  }

  const analise = esquemaPolitica.safeParse(Object.fromEntries(dados));
  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? "Confira os dados." };
  }
  const d = analise.data;

  await withTenant(sessao.anfitriaoId, (tx) =>
    atualizarPoliticaPadrao(
      tx,
      sessao.anfitriaoId,
      {
        faixas: [
          {
            diasAntes: d.diasAntes,
            percentualPontosBase: Math.round(d.percentualDevolvido * 100),
          },
        ],
        saidaAntecipadaPontosBase: Math.round(d.saidaAntecipadaPercentual * 100),
      },
      { tipo: "usuario", id: sessao.usuarioId },
    ),
  );

  revalidatePath("/painel/tarifas");
  return { aviso: "Política de cancelamento salva." };
}
