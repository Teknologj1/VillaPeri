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

import { regraEstadia } from "@/modules/calendario/schema";
import {
  CASA,
  COMODIDADES as GRUPOS_COMODIDADES,
  PIRENOPOLIS,
  PRECOS,
  REGRAS_DA_CASA,
  SUITES,
} from "@/modules/conteudo";
import { baseConhecimento } from "@/modules/riia/schema";
import { feriadosNoPeriodo, periodosEspeciais } from "@/modules/tarifas/feriados";
import {
  feriado,
  politicaCancelamento,
  regraTarifa,
} from "@/modules/tarifas/schema";

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
 *
 * Os dados da casa vêm do módulo Conteúdo, que é a fonte única: o site e o
 * banco liam cópias separadas das mesmas listas, e duas cópias divergem.
 */

/** O banco guarda uma lista só; o site agrupa por seção. */
const COMODIDADES = GRUPOS_COMODIDADES.flatMap((g) => g.itens);

const DESCRICAO = CASA.descricao.join("\n\n");

const TARIFA = {
  semanaCentavos: PRECOS.diariaSemanaCentavos,
  fimDeSemanaCentavos: PRECOS.diariaFimDeSemanaCentavos,
  feriadoCentavos: PRECOS.diariaFeriadoCentavos,
  especialCentavos: PRECOS.diariaEspecialCentavos,
  pessoaExtraCentavos: PRECOS.pessoaAdicionalCentavos,
  /** Criança de 5 a 9 anos paga meia; de 10 em diante, valor de adulto. */
  criancaCentavos: Math.round(PRECOS.pessoaAdicionalCentavos / 2),
  sinalPontosBase: PRECOS.sinalPercentual * 100,
} as const;

const OCUPACAO_BASE = PRECOS.ocupacaoBase;

const ESTADIA = {
  minimoNoites: PRECOS.minimoNoites,
  minimoNoitesFeriado: PRECOS.minimoNoitesFeriado,
  checkin: "14:00",
  checkout: "12:00",
} as const;

/**
 * "Devolução no mínimo uma semana antes, salvo caso de força maior."
 *
 * Uma faixa só: com 7 dias ou mais devolve tudo; abaixo disso, nada. Força
 * maior não vira faixa porque não é prazo — é exceção que alguém decide, e
 * entra como devolução manual registrada na reserva.
 */

const FAIXAS_CANCELAMENTO = [{ diasAntes: 7, percentualPontosBase: 10_000 }];

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
        ocupacaoBase: OCUPACAO_BASE,
        comodidades: COMODIDADES,
        fotos: [],
      })
      .returning();
  }
  if (!tipo) throw new Error("Não foi possível criar o tipo de acomodação.");

  // Reaplica a configuração a cada execução. Sem isto o seed é insert-only:
  // mudar uma constante aqui não chega ao banco porque a linha já existe, e o
  // valor antigo segue valendo sem ninguém perceber — foi o que aconteceu com
  // a ocupação base.
  [tipo] = await db
    .update(tipoAcomodacao)
    .set({
      descricao: DESCRICAO,
      capacidade: 11,
      quartos: SUITES.length,
      camas,
      banheiros: 3,
      modoPreco: "ocupacao",
      ocupacaoBase: OCUPACAO_BASE,
      idadeMinimaCrianca: 5,
      idadeMaximaCrianca: 9,
      comodidades: COMODIDADES,
    })
    .where(eq(tipoAcomodacao.id, tipo.id))
    .returning();
  if (!tipo) throw new Error("Falha ao atualizar o tipo de acomodação.");

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

  console.log("Semeando tarifas, regras de estadia e cancelamento…");

  // Horários, sinal e pets ficam na propriedade; idempotente de propósito,
  // para o seed poder rodar de novo depois de o proprietário mudar um valor.
  await db
    .update(propriedade)
    .set({
      checkinPadrao: ESTADIA.checkin,
      checkoutPadrao: ESTADIA.checkout,
      sinalPontosBase: TARIFA.sinalPontosBase,
      aceitaPets: false,
      // Para onde vão os avisos de pedido e de reserva confirmada. Vêm do
      // ambiente só para semear; depois o proprietário troca pelo painel,
      // porque é dado do anfitrião e não configuração de deploy.
      emailContato: process.env.EMAIL_ANFITRIAO ?? null,
      whatsappContato: process.env.NEXT_PUBLIC_WHATSAPP ?? null,
    })
    .where(eq(propriedade.id, prop.id));

  const tarifas = [
    {
      nome: "Diária padrão",
      nivel: "padrao" as const,
      precoSemanaCentavos: TARIFA.semanaCentavos,
      precoFimDeSemanaCentavos: TARIFA.fimDeSemanaCentavos,
      valorPessoaExtraCentavos: TARIFA.pessoaExtraCentavos,
      valorCriancaCentavos: TARIFA.criancaCentavos,
    },
    {
      // Vale em qualquer noite que a tabela de feriados marcar, inclusive os
      // móveis. Preço fixo, não ajuste percentual, porque foi assim que o
      // proprietário informou.
      nome: "Feriado",
      nivel: "feriado" as const,
      precoFixoCentavos: TARIFA.feriadoCentavos,
      valorPessoaExtraCentavos: TARIFA.pessoaExtraCentavos,
      valorCriancaCentavos: TARIFA.criancaCentavos,
    },
  ];

  for (const t of tarifas) {
    const existente = await db
      .select()
      .from(regraTarifa)
      .where(eq(regraTarifa.nome, t.nome))
      .limit(1);
    if (existente.length === 0) {
      await db
        .insert(regraTarifa)
        .values({ anfitriaoId: villaPeri.id, propriedadeId: prop.id, ...t });
    }
  }

  // Réveillon e Carnaval: nível "especial", que vence o de feriado na pilha
  // de preços. Uma regra por período e por ano, porque a vigência de cada
  // regra é um intervalo só — e o Carnaval muda de data todo ano.
  let especiaisNovas = 0;
  for (let ano = ANO; ano <= ANO + 4; ano++) {
    for (const periodo of periodosEspeciais(ano)) {
      const existente = await db
        .select()
        .from(regraTarifa)
        .where(eq(regraTarifa.nome, periodo.nome))
        .limit(1);
      if (existente.length > 0) continue;

      await db.insert(regraTarifa).values({
        anfitriaoId: villaPeri.id,
        propriedadeId: prop.id,
        nome: periodo.nome,
        nivel: "especial",
        vigenciaInicio: periodo.inicio,
        vigenciaFim: periodo.fim,
        precoFixoCentavos: TARIFA.especialCentavos,
        valorPessoaExtraCentavos: TARIFA.pessoaExtraCentavos,
        valorCriancaCentavos: TARIFA.criancaCentavos,
        prioridade: 10,
      });
      especiaisNovas++;
    }
  }

  const regrasEstadia = [
    {
      nome: "Mínimo de noites",
      minimoDiarias: ESTADIA.minimoNoites,
      somenteEmFeriado: false,
      prioridade: 0,
    },
    {
      nome: "Feriado prolongado",
      minimoDiarias: ESTADIA.minimoNoitesFeriado,
      somenteEmFeriado: true,
      prioridade: 10,
    },
  ];

  for (const r of regrasEstadia) {
    const existente = await db
      .select()
      .from(regraEstadia)
      .where(eq(regraEstadia.nome, r.nome))
      .limit(1);
    if (existente.length === 0) {
      await db
        .insert(regraEstadia)
        .values({ anfitriaoId: villaPeri.id, propriedadeId: prop.id, ...r });
    }
  }

  const politicas = await db
    .select()
    .from(politicaCancelamento)
    .where(eq(politicaCancelamento.nome, "Padrão"))
    .limit(1);
  if (politicas.length === 0) {
    await db.insert(politicaCancelamento).values({
      anfitriaoId: villaPeri.id,
      nome: "Padrão",
      faixas: FAIXAS_CANCELAMENTO,
      padrao: true,
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

  // -------------------------------------------------------------------------
  // Base de conhecimento: o que a RIIA responde, e o site também
  // -------------------------------------------------------------------------
  //
  // Uma fonte só para os dois é o que impede a secretária de IA dizer uma
  // coisa e o site outra sobre o mesmo assunto — e o hóspede descobrir a
  // diferença na hora da reclamação. O conteúdo nasce do módulo Conteúdo, que
  // já alimenta as páginas; o proprietário edita depois pelo painel.

  const conhecimento: {
    tema: "politica" | "passeio" | "como_chegar" | "pergunta_frequente" | "a_casa";
    titulo: string;
    texto: string;
    termos: string[];
  }[] = [
    {
      tema: "a_casa",
      titulo: "A casa é locada inteira",
      texto:
        `A ${CASA.nome} é locada INTEIRA e exclusiva para uma única reserva. ` +
        `Não dividimos a casa entre grupos: são ${CASA.quartos} suítes, ` +
        `${CASA.camas} camas e ${CASA.banheiros} banheiros para até ` +
        `${CASA.capacidade} hóspedes do mesmo grupo.`,
      termos: ["quarto", "suite", "dividir", "sozinho", "grupo", "casa inteira"],
    },
    ...PIRENOPOLIS.map((item) => ({
      tema:
        item.titulo === "Como chegar"
          ? ("como_chegar" as const)
          : ("passeio" as const),
      titulo: item.titulo,
      texto: item.texto,
      termos: item.titulo.toLowerCase().split(/\s+/),
    })),
    ...REGRAS_DA_CASA.map((regra, i) => ({
      tema: "politica" as const,
      titulo: `Regra da casa ${i + 1}`,
      texto: regra,
      termos: ["regra", "barulho", "festa", "som", "mico", "silencio"],
    })),
  ];

  let conhecimentoNovo = 0;
  for (const [i, item] of conhecimento.entries()) {
    const resultado = await db
      .insert(baseConhecimento)
      .values({
        anfitriaoId: villaPeri.id,
        tema: item.tema,
        titulo: item.titulo,
        texto: item.texto,
        termos: item.termos,
        ordem: i,
      })
      .onConflictDoNothing()
      .returning();
    conhecimentoNovo += resultado.length;
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
    `  tarifa       semana R$ ${(TARIFA.semanaCentavos / 100).toFixed(2)} · ` +
      `fim de semana R$ ${(TARIFA.fimDeSemanaCentavos / 100).toFixed(2)} · ` +
      `feriado R$ ${(TARIFA.feriadoCentavos / 100).toFixed(2)}`,
  );
  console.log(
    `  especiais    R$ ${(TARIFA.especialCentavos / 100).toFixed(2)} em réveillon e Carnaval, ` +
      `${ANO} a ${ANO + 4} (${especiaisNovas} novas)`,
  );
  console.log(
    `  por pessoa   R$ ${(TARIFA.pessoaExtraCentavos / 100).toFixed(2)} além da ocupação base ` +
      `(${tipo.ocupacaoBase}); criança de ${tipo.idadeMinimaCrianca} a ${tipo.idadeMaximaCrianca} anos paga meia`,
  );
  console.log(
    `  estadia      mínimo ${ESTADIA.minimoNoites} noites, ${ESTADIA.minimoNoitesFeriado} em feriado · ` +
      `check-in ${ESTADIA.checkin}, check-out ${ESTADIA.checkout} · sinal ${TARIFA.sinalPontosBase / 100}%`,
  );
  console.log(
    `  conhecimento ${conhecimento.length} itens para a RIIA e o site ` +
      `(${conhecimentoNovo} novos)`,
  );

}

semear()
  .then(() => cliente.end())
  .catch(async (erro) => {
    console.error(erro);
    await cliente.end();
    process.exit(1);
  });
