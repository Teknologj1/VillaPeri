import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  anfitriao,
  assinatura,
  perfil,
  permissao,
  plano,
  propriedade,
} from "@/modules/anfitriao/schema";

import * as schema from "./schema";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Seed roda com o papel de migração (BYPASSRLS). Precisa: a primeira linha de
 * `anfitriao` é quem define o contexto que as políticas de RLS leem, então não
 * há contexto para definir antes dela existir.
 */
const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) {
  throw new Error(
    "O seed precisa de DATABASE_URL_MIGRATOR (papel villaperi_owner).\n" +
      "Com a conexão da aplicação ele falharia na primeira inserção, por RLS.",
  );
}

const cliente = postgres(url, { max: 1 });
const db = drizzle(cliente, { schema });

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

/** Percentuais em pontos-base: 10% = 1000. Mensalidade em centavos. */
const PLANOS = [
  { nome: "Própria", comissaoPontosBase: 0, mensalidadeCentavos: 0 },
  { nome: "Gratuito", comissaoPontosBase: 1000, mensalidadeCentavos: 0 },
  { nome: "Profissional", comissaoPontosBase: 700, mensalidadeCentavos: 4990 },
  { nome: "Premium", comissaoPontosBase: 500, mensalidadeCentavos: 9990 },
] as const;

// ---------------------------------------------------------------------------
// Matriz de perfis
// ---------------------------------------------------------------------------

type Nivel = "nenhum" | "ver" | "lancar" | "editar";
type Modulo = (typeof MODULOS)[number];

const MODULOS = [
  "calendario",
  "tarifas",
  "reservas",
  "hospedes",
  "checkin",
  "limpeza",
  "enxoval",
  "despesas",
  "relatorios",
  "usuarios",
  "auditoria",
] as const;

/**
 * A matriz de perfis da especificação, transcrita. E = editar, V = ver,
 * — = nenhum. As ressalvas que lá aparecem entre parênteses viram a coluna
 * `observacao`, para que a regra não se perca ao virar código.
 */
const MATRIZ: Record<
  string,
  {
    descontoMaximoPontosBase: number;
    exigeDoisFatores: boolean;
    permissoes: Partial<Record<Modulo, [Nivel, string?]>>;
  }
> = {
  Proprietário: {
    descontoMaximoPontosBase: 10_000, // 100%: decide preço e dinheiro
    exigeDoisFatores: true, // obrigatório, pela especificação
    permissoes: {
      calendario: ["editar"],
      tarifas: ["editar"],
      reservas: ["editar"],
      hospedes: ["editar"],
      checkin: ["editar"],
      limpeza: ["editar"],
      enxoval: ["editar"],
      despesas: ["editar"],
      relatorios: ["ver"],
      usuarios: ["editar"],
      auditoria: ["ver"],
    },
  },
  Gerente: {
    descontoMaximoPontosBase: 10_000, // aprova desconto da recepção
    exigeDoisFatores: false,
    permissoes: {
      calendario: ["editar"],
      tarifas: ["ver"],
      reservas: ["editar"],
      hospedes: ["editar"],
      checkin: ["editar"],
      limpeza: ["editar"],
      enxoval: ["editar"],
      despesas: ["editar"],
      relatorios: ["ver", "Só o resumo"],
      usuarios: ["nenhum"],
      auditoria: ["nenhum"],
    },
  },
  Recepção: {
    // Acima disto a reserva fica "aguardando aprovação". Valor inicial;
    // o proprietário ajusta.
    descontoMaximoPontosBase: 1_000, // 10%
    exigeDoisFatores: false,
    permissoes: {
      calendario: ["ver"],
      tarifas: ["ver"],
      reservas: ["editar", "Desconto até o limite do perfil"],
      hospedes: ["editar"],
      checkin: ["editar"],
      limpeza: ["ver"],
      enxoval: ["ver"],
      despesas: ["lancar"],
      relatorios: ["nenhum"],
      usuarios: ["nenhum"],
      auditoria: ["nenhum"],
    },
  },
  Governança: {
    descontoMaximoPontosBase: 0,
    exigeDoisFatores: false,
    permissoes: {
      // "Governança nunca vê valores nem contatos. Vê apenas
      //  'Quarto 3: saída hoje, troca completa de enxoval'."
      calendario: ["ver", "Só a ocupação do dia: sem valores e sem contatos"],
      tarifas: ["nenhum"],
      reservas: ["nenhum"],
      hospedes: ["nenhum"],
      checkin: ["nenhum"],
      limpeza: ["editar"],
      enxoval: ["editar", "Movimentações de enxoval"],
      despesas: ["nenhum"],
      relatorios: ["nenhum"],
      usuarios: ["nenhum"],
      auditoria: ["nenhum"],
    },
  },
  Financeiro: {
    descontoMaximoPontosBase: 0,
    exigeDoisFatores: false,
    permissoes: {
      calendario: ["ver"],
      tarifas: ["ver"],
      reservas: ["ver"],
      hospedes: ["ver", "Sem o documento do hóspede (LGPD)"],
      checkin: ["nenhum"],
      limpeza: ["nenhum"],
      enxoval: ["ver"],
      despesas: ["editar"],
      relatorios: ["ver"],
      usuarios: ["nenhum"],
      auditoria: ["nenhum"],
    },
  },
};

// ---------------------------------------------------------------------------

async function semear() {
  console.log("Semeando planos…");
  for (const p of PLANOS) {
    const existente = await db
      .select()
      .from(plano)
      .where(eq(plano.nome, p.nome))
      .limit(1);
    if (existente.length === 0) {
      await db.insert(plano).values(p);
    }
  }

  const [planoPropria] = await db
    .select()
    .from(plano)
    .where(eq(plano.nome, "Própria"))
    .limit(1);
  if (!planoPropria) throw new Error('Plano "Própria" não foi criado.');

  console.log("Semeando a Villa Peri…");
  let [villaPeri] = await db
    .select()
    .from(anfitriao)
    .where(eq(anfitriao.nome, "Villa Peri"))
    .limit(1);

  if (!villaPeri) {
    [villaPeri] = await db
      .insert(anfitriao)
      .values({ nome: "Villa Peri", status: "ativa" })
      .returning();
  }
  if (!villaPeri) throw new Error("Não foi possível criar o anfitrião.");

  const assinaturas = await db
    .select()
    .from(assinatura)
    .where(eq(assinatura.anfitriaoId, villaPeri.id))
    .limit(1);
  if (assinaturas.length === 0) {
    await db.insert(assinatura).values({
      anfitriaoId: villaPeri.id,
      planoId: planoPropria.id,
      inicio: new Date().toISOString().slice(0, 10),
      ciclo: "mensal",
      statusCobranca: "ativa",
    });
  }

  const propriedades = await db
    .select()
    .from(propriedade)
    .where(eq(propriedade.anfitriaoId, villaPeri.id))
    .limit(1);
  if (propriedades.length === 0) {
    await db.insert(propriedade).values({
      anfitriaoId: villaPeri.id,
      nome: "Villa Peri",
      cidade: "Pirenópolis",
      uf: "GO",
      fuso: "America/Sao_Paulo",
      moeda: "BRL",
    });
  }

  console.log("Semeando os cinco perfis e a matriz de permissões…");
  for (const [nome, cfg] of Object.entries(MATRIZ)) {
    let [p] = await db
      .select()
      .from(perfil)
      .where(eq(perfil.nome, nome))
      .limit(1);

    if (!p) {
      [p] = await db
        .insert(perfil)
        .values({
          anfitriaoId: villaPeri.id,
          nome,
          sistema: true,
          descontoMaximoPontosBase: cfg.descontoMaximoPontosBase,
          exigeDoisFatores: cfg.exigeDoisFatores,
        })
        .returning();
    }
    if (!p) throw new Error(`Não foi possível criar o perfil ${nome}.`);

    for (const modulo of MODULOS) {
      const celula = cfg.permissoes[modulo] ?? (["nenhum"] as [Nivel]);
      await db
        .insert(permissao)
        .values({
          anfitriaoId: villaPeri.id,
          perfilId: p.id,
          modulo,
          nivel: celula[0],
          observacao: celula[1] ?? null,
        })
        .onConflictDoNothing();
    }
  }

  console.log("\nPronto:");
  console.log(`  anfitrião    Villa Peri (${villaPeri.id})`);
  console.log(`  plano        Própria, 0% de comissão, sem mensalidade`);
  console.log(`  perfis       ${Object.keys(MATRIZ).join(", ")}`);
  console.log(
    `\nFaltam os tipos de acomodação e as unidades: dependem das decisões 1 e 2\n` +
      `da especificação (quantas unidades, de quais tipos, preço por acomodação\n` +
      `ou por ocupação).`,
  );
}

semear()
  .then(() => cliente.end())
  .catch(async (erro) => {
    console.error(erro);
    await cliente.end();
    process.exit(1);
  });
