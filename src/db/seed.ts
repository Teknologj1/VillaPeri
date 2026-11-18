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
  tipoAcomodacao,
  unidade,
} from "@/modules/anfitriao/schema";

import { feriadosNoPeriodo } from "@/modules/tarifas/feriados";
import { feriado } from "@/modules/tarifas/schema";

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
// A casa
// ---------------------------------------------------------------------------

/**
 * A Villa Peri é **uma** acomodação, não três.
 *
 * O anúncio diz "Locada INTEIRA e EXCLUSIVA para uma ÚNICA reserva": as três
 * suítes são cômodos de uma casa que se aluga fechada, não quartos vendidos
 * em separado. Por isso existe um tipo e uma unidade — e é sobre essa unidade
 * que a chave única `(unidade, noite)` protege o calendário.
 *
 * A diferença não é cosmética: com três unidades, o sistema aceitaria três
 * reservas simultâneas para a mesma casa.
 */
const SUITES = [
  {
    nome: "Suíte 01",
    descricao:
      "Quarto térreo com cama de casal e cama de solteiro, banheiro privativo, frigobar e ventilador de teto. Pode ser usada conjugada com a Suíte 02.",
    capacidade: 3,
    camasCasal: 1,
    camasSolteiro: 1,
  },
  {
    nome: "Suíte 02",
    descricao:
      "Quarto térreo com cama de casal e cama de solteiro, banheiro privativo, TV, ar-condicionado e ventilador de teto. Pode ser usada conjugada com a Suíte 01.",
    capacidade: 3,
    camasCasal: 1,
    camasSolteiro: 1,
  },
  {
    nome: "Suíte 03",
    descricao:
      "Chalé de dois andares com duas camas de casal, banheiro privativo, TV, ventilador de teto e frigobar.",
    capacidade: 4,
    camasCasal: 2,
    camasSolteiro: 0,
  },
] as const;

const COMODIDADES = [
  "Piscina privativa com aquecimento solar",
  "Quintal privado totalmente cercado",
  "Churrasqueira com pia e bancada",
  "Fogão caipira a lenha",
  "Área de jantar ao ar livre",
  "Varandas com redes",
  "Espreguiçadeiras e guarda-sol",
  "Cozinha completa equipada",
  "Geladeira e frigobar",
  "Cooktop e forno elétrico",
  "Airfryer, grill e sanduicheira",
  "Cafeteira com coador",
  "Liquidificador e espremedor de laranja",
  "Panela elétrica de arroz e chaleira elétrica",
  "Pratos, talheres e taças de vinho",
  "Cooler térmico para uso dos hóspedes",
  "Mesa de jantar",
  "Wi-Fi e conexão Ethernet",
  "TV de 32 polegadas",
  "Ar-condicionado split",
  "Ventilador de teto",
  "Lareira interna",
  "Máquina de lavar",
  "Ferro de passar e varal",
  "Roupas de cama e banho fornecidas",
  "Água quente e chuveiro externo",
  "Extintor de incêndio",
  "Garagem para 4 carros, sombreada",
  "Estacionamento gratuito na rua",
  "Portão automático e casa murada",
  "Entrada independente para cada suíte",
  "Guarda-volumes para chegada cedo ou saída tarde",
];

/**
 * Regras da casa, do anúncio. Ficam no banco, e não só no texto do anúncio,
 * porque a RIIA responde por elas no WhatsApp: se morarem só num canal, a
 * secretária de IA erra quando perguntarem sobre festa, barulho ou som.
 */
const REGRAS_DA_CASA = [
  "Não é permitido festa ou churrasco com pessoas além das contratadas na hospedagem.",
  "Não é permitido barulho depois das 22 horas.",
  "Durante o dia, pedimos bom senso com o volume: evite música alta.",
  "Som automotivo é proibido.",
  "Recebemos a visita de animais silvestres, principalmente micos. Pedimos que não sejam alimentados.",
];

const DESCRICAO = `Casa de temporada no Jardim Santa Bárbara, a 6 minutos de carro do Centro Histórico de Pirenópolis e vizinha a uma reserva ambiental.

Locada inteira e exclusiva para uma única reserva.

Fácil acesso às atrações históricas e gastronômicas da cidade e região, assim como às cachoeiras, parques de ecoturismo e turismo de aventura.

Três suítes com entrada independente, cozinha completa, piscina com aquecimento solar, área de churrasco com fogão caipira, varandas com redes, portão automático e garagem privativa.

A Villa é bem arborizada, o que deixa o ambiente mais fresco. Recebemos com frequência a visita de animais silvestres, principalmente micos — pedimos que não sejam alimentados.`;

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

  let [prop] = await db
    .select()
    .from(propriedade)
    .where(eq(propriedade.anfitriaoId, villaPeri.id))
    .limit(1);
  if (!prop) {
    [prop] = await db
      .insert(propriedade)
      .values({
        anfitriaoId: villaPeri.id,
        nome: "Villa Peri",
        endereco: "Jardim Santa Bárbara",
        cidade: "Pirenópolis",
        uf: "GO",
        fuso: "America/Sao_Paulo",
        moeda: "BRL",
        regrasDaCasa: REGRAS_DA_CASA,
      })
      .returning();
  }
  if (!prop) throw new Error("Não foi possível criar a propriedade.");

  // Idempotente: atualiza as regras mesmo se a propriedade já existia.
  await db
    .update(propriedade)
    .set({ regrasDaCasa: REGRAS_DA_CASA })
    .where(eq(propriedade.id, prop.id));

  console.log("Semeando a casa…");
  const camas = SUITES.reduce((n, s) => n + s.camasCasal + s.camasSolteiro, 0);
  const capacidadeDasSuites = SUITES.reduce((n, s) => n + s.capacidade, 0);

  let [tipo] = await db
    .select()
    .from(tipoAcomodacao)
    .where(eq(tipoAcomodacao.slug, "casa-inteira"))
    .limit(1);

  if (!tipo) {
    [tipo] = await db
      .insert(tipoAcomodacao)
      .values({
        anfitriaoId: villaPeri.id,
        propriedadeId: prop.id,
        nome: "Villa Peri — casa inteira",
        slug: "casa-inteira",
        descricao: DESCRICAO,
        // 11 é o número do anúncio. As três suítes somam 10 camas-pessoa;
        // ver a nota no fim deste arquivo.
        capacidade: 11,
        quartos: SUITES.length,
        camas,
        banheiros: 3,
        // Por ocupação: um casal não paga o mesmo que onze pessoas numa casa
        // alugada inteira. O valor por pessoa adicional entra com a tabela de
        // tarifas.
        modoPreco: "ocupacao",
        ocupacaoBase: 4,
        comodidades: COMODIDADES,
        fotos: [],
      })
      .returning();
  }
  if (!tipo) throw new Error("Não foi possível criar o tipo de acomodação.");

  const unidades = await db
    .select()
    .from(unidade)
    .where(eq(unidade.tipoId, tipo.id))
    .limit(1);
  if (unidades.length === 0) {
    // UMA unidade: a casa se aluga fechada. Com três, o sistema aceitaria
    // três reservas simultâneas para a mesma casa.
    await db.insert(unidade).values({
      anfitriaoId: villaPeri.id,
      tipoId: tipo.id,
      nome: "Villa Peri",
    });
  }

  console.log("Semeando os feriados nacionais…");
  const ANO = new Date().getUTCFullYear();
  const feriadosGerados = feriadosNoPeriodo(ANO, ANO + 4);
  const feriadosNovos = await db
    .insert(feriado)
    .values(
      feriadosGerados.map((f) => ({
        anfitriaoId: villaPeri.id,
        data: f.data,
        nome: f.nome,
        ambito: f.ambito,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: feriado.id });

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
    `  acomodação   casa inteira, 1 unidade, ${tipo.capacidade} hóspedes, ` +
      `${tipo.quartos} suítes, ${tipo.camas} camas, ${tipo.banheiros} banheiros`,
  );
  console.log(`  comodidades  ${COMODIDADES.length} itens`);
  console.log(
    `  feriados     ${feriadosGerados.length} nacionais de ${ANO} a ${ANO + 4}` +
      ` (${feriadosNovos.length} novos)`,
  );

  if (capacidadeDasSuites !== tipo.capacidade) {
    console.log(
      `\n  Nota: as suítes somam ${capacidadeDasSuites} pessoas (3 + 3 + 4) e a capacidade é\n` +
        `  ${tipo.capacidade}. A diferença é a cama extra, confirmada pelo proprietário.\n` +
        `  Falta saber em qual suíte ela fica — o kit de enxoval é calculado a\n` +
        `  partir da cama montada em cada cômodo.`,
    );
  }

  console.log(
    `\n  Faltam, para o site e as reservas: tabela de tarifas, horários de\n` +
      `  check-in e check-out, política de cancelamento, sinal, e política de\n` +
      `  crianças e pets.`,
  );
}

semear()
  .then(() => cliente.end())
  .catch(async (erro) => {
    console.error(erro);
    await cliente.end();
    process.exit(1);
  });
