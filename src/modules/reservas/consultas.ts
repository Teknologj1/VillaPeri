import { and, desc, eq, gt, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";

import type { Tx } from "@/db/tenant";
import { type Noite, somarDias } from "@/lib/data";

import {
  acessoDadoPessoal,
  acompanhante,
  hospede,
  pagamento,
  reserva,
  solicitacao,
} from "./schema";
import { type StatusReserva, TODOS_OS_STATUS, seguraNoites } from "./status";

/**
 * As leituras que o painel faz.
 *
 * Ficam aqui, e não nas páginas, porque as tabelas são do módulo: quem está
 * fora pergunta, não lê. Separadas de `service.ts` porque lá mora o que MUDA
 * o mundo — e misturar as duas coisas acaba com uma consulta chamada dentro de
 * uma transação de escrita por engano.
 */

/**
 * Quanto já entrou, por reserva.
 *
 * Subconsulta e não laço: a lista mostra o saldo de cada linha, e perguntar
 * uma vez por reserva transformaria uma tela em dezenas de idas ao banco.
 *
 * `reserva.id` do lado de fora é escrito à mão, e NÃO interpolado como
 * `${reserva.id}`. O Drizzle só qualifica a coluna quando a consulta tem mais
 * de uma tabela: numa consulta de tabela única ele emite `"id"` puro, que
 * dentro desta subconsulta resolve para a coluna `id` de `pagamento` — a
 * comparação vira `p.reserva_id = p.id`, nunca verdadeira, e o saldo sai
 * zero em toda linha. Sem erro, sem aviso, só o número errado na tela.
 */
const pagoPorReserva = sql<number>`coalesce((
  select sum(p.valor_centavos)::int
  from ${pagamento} p
  where p.reserva_id = reserva.id
), 0)`;

/**
 * A projeção da lista, num lugar só.
 *
 * Cinco telas mostram reservas em linha; escrever as colunas em cada uma é
 * como uma delas acaba sem o campo que as outras ganharam depois.
 */
const COLUNAS_DA_LISTA = {
  id: reserva.id,
  codigo: reserva.codigo,
  status: reserva.status,
  canal: reserva.canal,
  entrada: reserva.entrada,
  saida: reserva.saida,
  adultos: reserva.adultos,
  criancas: reserva.criancas,
  totalCentavos: reserva.totalCentavos,
  sinalCentavos: reserva.sinalCentavos,
  pagoCentavos: pagoPorReserva,
  hospedeId: hospede.id,
  hospedeNome: hospede.nome,
  hospedeTelefone: hospede.telefone,
  unidadeId: reserva.unidadeId,
  fnrhStatus: reserva.fnrhStatus,
  horarioChegada: reserva.horarioChegada,
  expiraEm: reserva.expiraEm,
  criadoEm: reserva.criadoEm,
} as const;

export type ReservaDaLista = {
  id: string;
  codigo: string;
  status: StatusReserva;
  canal: string;
  entrada: Noite;
  saida: Noite;
  adultos: number;
  criancas: number;
  totalCentavos: number;
  sinalCentavos: number;
  pagoCentavos: number;
  hospedeId: string;
  hospedeNome: string;
  hospedeTelefone: string | null;
  unidadeId: string;
  fnrhStatus: string;
  horarioChegada: string | null;
  expiraEm: Date | null;
  criadoEm: Date;
};

/** Os status em que a reserva ainda conta como ocupação real da casa. */
const STATUS_ATIVOS = TODOS_OS_STATUS.filter(seguraNoites);

/** O começo de toda consulta de lista: reserva + titular. */
function consultaBase(tx: Tx) {
  return tx
    .select(COLUNAS_DA_LISTA)
    .from(reserva)
    .innerJoin(hospede, eq(hospede.id, reserva.hospedeId));
}

export type FiltroDeReservas = {
  /** Vazio ou ausente = todos os status. */
  status?: StatusReserva[];
  /** Reservas que TOCAM este intervalo, mesmo que comecem antes dele. */
  de?: Noite;
  ate?: Noite;
  /** Nome do hóspede ou código da reserva. */
  busca?: string;
  limite?: number;
};

export async function listarReservas(
  tx: Tx,
  filtro: FiltroDeReservas = {},
): Promise<ReservaDaLista[]> {
  const condicoes = [];

  if (filtro.status?.length) {
    condicoes.push(inArray(reserva.status, filtro.status));
  }

  // Sobreposição de intervalos, não "começa dentro": uma estadia de 28/12 a
  // 03/01 aparece em dezembro E em janeiro, porque em ambos os meses há
  // hóspede na casa. Filtrar pela data de entrada esconderia metade dela.
  if (filtro.de) condicoes.push(gt(reserva.saida, filtro.de));
  if (filtro.ate) condicoes.push(lt(reserva.entrada, filtro.ate));

  if (filtro.busca?.trim()) {
    const termo = `%${filtro.busca.trim()}%`;
    condicoes.push(or(ilike(hospede.nome, termo), ilike(reserva.codigo, termo)));
  }

  return consultaBase(tx)
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(desc(reserva.entrada))
    .limit(filtro.limite ?? 200) as Promise<ReservaDaLista[]>;
}

// ---------------------------------------------------------------------------
// A ficha
// ---------------------------------------------------------------------------

export type ReservaCompleta = {
  reserva: typeof reserva.$inferSelect;
  hospede: typeof hospede.$inferSelect;
  acompanhantes: (typeof acompanhante.$inferSelect)[];
  pagamentos: (typeof pagamento.$inferSelect)[];
  pagoCentavos: number;
  solicitacao: typeof solicitacao.$inferSelect | null;
};

/**
 * A ficha inteira, pelo código.
 *
 * Pelo código e não pelo id porque é o que a pessoa tem na mão: está no
 * e-mail do hóspede, na conversa do WhatsApp e no papel da portaria. A URL
 * fica legível e o atendente consegue digitá-la.
 */
export async function buscarReservaPorCodigo(
  tx: Tx,
  codigo: string,
): Promise<ReservaCompleta | null> {
  const [linha] = await tx
    .select()
    .from(reserva)
    .where(eq(reserva.codigo, codigo.toUpperCase()))
    .limit(1);
  return linha ? montarFicha(tx, linha) : null;
}

export async function buscarReservaPorId(
  tx: Tx,
  id: string,
): Promise<ReservaCompleta | null> {
  const [linha] = await tx
    .select()
    .from(reserva)
    .where(eq(reserva.id, id))
    .limit(1);
  return linha ? montarFicha(tx, linha) : null;
}

async function montarFicha(
  tx: Tx,
  linha: typeof reserva.$inferSelect,
): Promise<ReservaCompleta> {
  const [titulares, acompanhantes, pagamentos, pedido] = await Promise.all([
    tx.select().from(hospede).where(eq(hospede.id, linha.hospedeId)).limit(1),
    tx.select().from(acompanhante).where(eq(acompanhante.reservaId, linha.id)),
    tx
      .select()
      .from(pagamento)
      .where(eq(pagamento.reservaId, linha.id))
      .orderBy(pagamento.data),
    linha.solicitacaoId
      ? tx
          .select()
          .from(solicitacao)
          .where(eq(solicitacao.id, linha.solicitacaoId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const titular = titulares[0];
  if (!titular) throw new Error("Reserva sem ficha de hóspede.");

  return {
    reserva: linha,
    hospede: titular,
    acompanhantes,
    pagamentos,
    pagoCentavos: pagamentos.reduce((s, p) => s + p.valorCentavos, 0),
    solicitacao: pedido[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hoje na casa
// ---------------------------------------------------------------------------

export type HojeNaCasa = {
  chegadas: ReservaDaLista[];
  saidas: ReservaDaLista[];
  naCasa: ReservaDaLista[];
};

/**
 * O que a portaria precisa saber do dia.
 *
 * `hoje` vem de fora, de `hojeNaPropriedade()`, e nunca de `now()` do banco:
 * o servidor roda em UTC, e depois das 21h em Brasília ele já virou o dia — a
 * lista mostraria as chegadas de amanhã como se fossem de hoje.
 *
 * "Na casa" exclui quem chega e quem sai hoje, que já aparecem nas outras
 * duas listas: são três grupos de AÇÃO distintos, não o mesmo nome três vezes.
 *
 * A saída é a única que não se acha por noite ocupada: a noite de 14 a 15
 * pertence ao dia 14, então no dia da saída o hóspede não tem noite nenhuma.
 * É por isso que ela é consultada por `saida = hoje`, e não pelo intervalo.
 */
export async function hojeNaCasa(tx: Tx, hoje: Noite): Promise<HojeNaCasa> {
  const amanha = somarDias(hoje, 1);

  const [doDia, saidas] = await Promise.all([
    listarReservas(tx, { status: STATUS_ATIVOS, de: hoje, ate: amanha }),
    consultaBase(tx).where(
      and(
        eq(reserva.saida, hoje),
        inArray(reserva.status, ["confirmada", "hospedado", "concluida"]),
      ),
    ) as Promise<ReservaDaLista[]>,
  ]);

  // `doDia` são as reservas que têm a NOITE de hoje. Quem sai hoje não tem
  // nenhuma, então já está fora desta lista pela própria consulta — não é
  // preciso descontá-lo de novo. Basta separar quem chega de quem continua.
  return {
    chegadas: doDia.filter((r) => r.entrada === hoje),
    saidas,
    naCasa: doDia.filter((r) => r.entrada !== hoje),
  };
}

/** Reservas que tocam o intervalo, para montar o calendário do mês. */
export async function reservasNoPeriodo(
  tx: Tx,
  de: Noite,
  ate: Noite,
): Promise<ReservaDaLista[]> {
  return listarReservas(tx, { status: STATUS_ATIVOS, de, ate });
}

/** Reservas que entram a partir de hoje, para a tela inicial. */
export async function proximasChegadas(
  tx: Tx,
  hoje: Noite,
  limite = 5,
): Promise<ReservaDaLista[]> {
  return consultaBase(tx)
    .where(
      and(
        gte(reserva.entrada, hoje),
        inArray(reserva.status, [
          "pre_reserva",
          "aguardando_aprovacao",
          "confirmada",
        ]),
      ),
    )
    .orderBy(reserva.entrada)
    .limit(limite) as Promise<ReservaDaLista[]>;
}

/**
 * As pré-reservas cujo prazo passou.
 *
 * Tratadas como vencidas NA LEITURA, não pela tarefa agendada: cron em
 * serverless tem cota e granularidade, e nenhuma regra de correção pode
 * depender de ele ter rodado no minuto certo.
 */
export async function preReservasVencidas(
  tx: Tx,
  agora: Date = new Date(),
): Promise<(typeof reserva.$inferSelect)[]> {
  return tx
    .select()
    .from(reserva)
    .where(
      and(
        inArray(reserva.status, ["pre_reserva", "aguardando_aprovacao"]),
        lte(reserva.expiraEm, agora),
      ),
    );
}

// ---------------------------------------------------------------------------
// Hóspedes
// ---------------------------------------------------------------------------

export type HospedeDaLista = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  recorrente: boolean;
  estadias: number;
  ultimaSaida: Noite | null;
};

/**
 * O cadastro de hóspedes, com quantas vezes cada um ficou.
 *
 * A contagem usa só estadias que aconteceram ou vão acontecer — cancelada e
 * no-show não contam como visita, senão "hóspede recorrente" passaria a
 * significar "pessoa que já desistiu três vezes".
 */
export async function listarHospedes(
  tx: Tx,
  busca?: string,
  limite = 100,
): Promise<HospedeDaLista[]> {
  const termo = busca?.trim();

  // `hospede.id` escrito à mão, pela mesma razão de `pagoPorReserva`: esta
  // consulta tem uma tabela só, então interpolar daria `"id"` puro, que aqui
  // dentro resolve para `reserva.id` e devolve zero em todo mundo.
  const estadias = sql<number>`coalesce((
    select count(*)::int from ${reserva} r
    where r.hospede_id = hospede.id
      and r.status in ('confirmada','hospedado','concluida')
  ), 0)`;

  const ultimaSaida = sql<string | null>`(
    select max(r.saida) from ${reserva} r
    where r.hospede_id = hospede.id
      and r.status in ('confirmada','hospedado','concluida')
  )`;

  return tx
    .select({
      id: hospede.id,
      nome: hospede.nome,
      telefone: hospede.telefone,
      email: hospede.email,
      cidade: hospede.cidade,
      uf: hospede.uf,
      recorrente: hospede.recorrente,
      estadias,
      ultimaSaida,
    })
    .from(hospede)
    .where(
      termo
        ? or(
            ilike(hospede.nome, `%${termo}%`),
            ilike(hospede.telefone, `%${termo}%`),
            ilike(hospede.email, `%${termo}%`),
          )
        : undefined,
    )
    .orderBy(hospede.nome)
    .limit(limite) as Promise<HospedeDaLista[]>;
}

export type FichaDoHospede = {
  hospede: typeof hospede.$inferSelect;
  reservas: ReservaDaLista[];
};

export async function buscarHospede(
  tx: Tx,
  id: string,
): Promise<FichaDoHospede | null> {
  const [linha] = await tx
    .select()
    .from(hospede)
    .where(eq(hospede.id, id))
    .limit(1);
  if (!linha) return null;

  const reservas = (await consultaBase(tx)
    .where(eq(reserva.hospedeId, id))
    .orderBy(desc(reserva.entrada))) as ReservaDaLista[];

  return { hospede: linha, reservas };
}

/**
 * Registra que alguém abriu uma ficha com dado pessoal.
 *
 * "Cada abertura de ficha é registrada." Em tabela própria, e sempre ANTES de
 * os dados chegarem à tela: registrar depois significa que uma falha no meio
 * do caminho deixa a leitura sem rastro.
 */
export async function registrarAcessoDadoPessoal(
  tx: Tx,
  dados: {
    anfitriaoId: string;
    hospedeId: string;
    usuarioId: string | null;
    motivo?: string;
  },
): Promise<void> {
  await tx.insert(acessoDadoPessoal).values({
    anfitriaoId: dados.anfitriaoId,
    hospedeId: dados.hospedeId,
    usuarioId: dados.usuarioId,
    motivo: dados.motivo ?? null,
  });
}

/** Quem abriu esta ficha, do mais recente para o mais antigo. */
export async function listarAcessosAoHospede(
  tx: Tx,
  hospedeId: string,
  limite = 20,
): Promise<(typeof acessoDadoPessoal.$inferSelect)[]> {
  return tx
    .select()
    .from(acessoDadoPessoal)
    .where(eq(acessoDadoPessoal.hospedeId, hospedeId))
    .orderBy(desc(acessoDadoPessoal.quando))
    .limit(limite);
}

// ---------------------------------------------------------------------------
// Solicitações
// ---------------------------------------------------------------------------

export async function listarSolicitacoes(
  tx: Tx,
  apenasAbertas = true,
  limite = 100,
): Promise<(typeof solicitacao.$inferSelect)[]> {
  return tx
    .select()
    .from(solicitacao)
    .where(
      apenasAbertas
        ? inArray(solicitacao.status, ["nova", "respondida"])
        : undefined,
    )
    .orderBy(desc(solicitacao.criadoEm))
    .limit(limite);
}

export async function buscarSolicitacao(
  tx: Tx,
  id: string,
): Promise<typeof solicitacao.$inferSelect | null> {
  const [linha] = await tx
    .select()
    .from(solicitacao)
    .where(eq(solicitacao.id, id))
    .limit(1);
  return linha ?? null;
}

/** Para o aviso de pedidos novos sem resposta na tela inicial. */
export async function contarSolicitacoesAbertas(tx: Tx): Promise<number> {
  const [linha] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(solicitacao)
    .where(eq(solicitacao.status, "nova"));
  return linha?.total ?? 0;
}
