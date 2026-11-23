import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { type Tx, withTenant } from "@/db/tenant";

import {
  FalhaPermanenteError,
  enviadorDoCanal,
  variavelFaltante,
} from "./enviadores";
import { notificacao } from "./schema";

export type Canal = "email" | "whatsapp";
export type ParaQuem = "hospede" | "anfitriao";

export type NotificacaoParaEnfileirar = {
  anfitriaoId: string;
  canal: Canal;
  paraQuem: ParaQuem;
  destinatario: string;
  nomeDestinatario?: string | null;
  assunto?: string | null;
  corpo: string;
  evento: string;
  referenciaTipo: string;
  referenciaId: string;
};

/** Tentativas antes de desistir. */
const MAXIMO_DE_TENTATIVAS = 5;

/**
 * Põe mensagens na fila, DENTRO da transação que registra o fato.
 *
 * É o ponto do desenho: se a reserva for desfeita, as mensagens dela somem
 * junto e ninguém recebe aviso de algo que não aconteceu. E se o provedor
 * estiver fora do ar, a reserva não falha por causa disso.
 */
export async function enfileirar(
  tx: Tx,
  mensagens: NotificacaoParaEnfileirar[],
): Promise<void> {
  const validas = mensagens.filter((m) => m.destinatario.trim().length > 0);
  if (validas.length === 0) return;

  await tx.insert(notificacao).values(
    validas.map((m) => ({
      anfitriaoId: m.anfitriaoId,
      canal: m.canal,
      paraQuem: m.paraQuem,
      destinatario: m.destinatario.trim(),
      nomeDestinatario: m.nomeDestinatario ?? null,
      assunto: m.assunto ?? null,
      corpo: m.corpo,
      evento: m.evento,
      referenciaTipo: m.referenciaTipo,
      referenciaId: m.referenciaId,
    })),
  );
}

export type ResultadoDaDrenagem = {
  enviadas: number;
  falharam: number;
  semProvedor: number;
  erros: string[];
};

/**
 * Quanto tempo uma linha pode ficar reservada antes de voltar à fila.
 *
 * É o destravamento: se o drenador morrer no meio do envio, a linha fica em
 * `enviando` para sempre. Passado este prazo ela volta a ser elegível — a
 * mensagem atrasa, em vez de nunca mais sair.
 *
 * Folgado de propósito. Curto demais e uma entrega lenta seria reenviada
 * enquanto a primeira ainda está em curso, que é justamente o que a reserva
 * existe para impedir.
 */
const MINUTOS_DE_RESERVA = 5;

/**
 * Tenta entregar o que está na fila.
 *
 * Chamada pela tarefa agendada e logo depois do fato que origina a mensagem
 * — o hóspede não pode esperar a próxima passada do cron para receber a
 * confirmação da reserva.
 *
 * O envio acontece FORA de transação: é chamada de rede, e segurar uma
 * transação aberta enquanto se espera um provedor externo prende conexão do
 * banco à toa.
 *
 * Sem provedor configurado para o canal, a mensagem continua pendente — não
 * é marcada como enviada nem descartada. Fingir que saiu é o pior resultado:
 * o hóspede não recebe e ninguém fica sabendo.
 */
export async function drenarFila(
  anfitriaoId: string,
  limite = 25,
): Promise<ResultadoDaDrenagem> {
  const pendentes = await reservarLote(anfitriaoId, limite);

  const resultado: ResultadoDaDrenagem = {
    enviadas: 0,
    falharam: 0,
    semProvedor: 0,
    erros: [],
  };

  // Um enviador por canal, reaproveitado — não um por mensagem.
  const enviadores = new Map(
    (["email", "whatsapp"] as const).map((c) => [c, enviadorDoCanal(c)]),
  );

  for (const m of pendentes) {
    const enviador = enviadores.get(m.canal);

    if (!enviador) {
      resultado.semProvedor++;
      continue;
    }

    try {
      await enviador.enviar({
        id: m.id,
        destinatario: m.destinatario,
        nomeDestinatario: m.nomeDestinatario,
        assunto: m.assunto,
        corpo: m.corpo,
        evento: m.evento,
        tentativa: m.tentativas,
        referenciaTipo: m.referenciaTipo,
        referenciaId: m.referenciaId,
      });

      await withTenant(anfitriaoId, (tx) =>
        tx
          .update(notificacao)
          .set({
            status: "enviada",
            enviadaEm: new Date(),
            ultimoErro: null,
            reservadaEm: null,
          })
          .where(eq(notificacao.id, m.id)),
      );
      resultado.enviadas++;
    } catch (erro) {
      // `tentativas` já foi incrementado ao reservar o lote: é o que impede
      // uma mensagem que derruba o processo de ser tentada para sempre.
      const texto = erro instanceof Error ? erro.message : String(erro);

      // O provedor pode dizer "não insista": número sem WhatsApp, e-mail que
      // não existe. Aí desiste na primeira, em vez de gastar cinco tentativas
      // para chegar à mesma conclusão — e a recepção vê o problema hoje.
      const permanente = erro instanceof FalhaPermanenteError;

      await withTenant(anfitriaoId, (tx) =>
        tx
          .update(notificacao)
          .set({
            status:
              permanente || m.tentativas >= MAXIMO_DE_TENTATIVAS
                ? "falhou"
                : "pendente",
            ultimoErro: texto.slice(0, 500),
            reservadaEm: null,
          })
          .where(eq(notificacao.id, m.id)),
      );
      resultado.falharam++;
      resultado.erros.push(`${m.canal} → ${m.destinatario}: ${texto.slice(0, 160)}`);
    }
  }

  if (resultado.semProvedor > 0) {
    const faltando = (["email", "whatsapp"] as const)
      .filter((c) => !enviadores.get(c))
      .map((c) => variavelFaltante(c));
    resultado.erros.push(
      `${resultado.semProvedor} mensagem(ns) aguardando provedor: defina ${faltando.join(" · ")}.`,
    );
  }

  return resultado;
}

/** O que está na fila de um fato, para o painel mostrar. */
export async function notificacoesDe(
  tx: Tx,
  referenciaTipo: string,
  referenciaId: string,
) {
  return tx
    .select()
    .from(notificacao)
    .where(
      and(
        eq(notificacao.referenciaTipo, referenciaTipo),
        eq(notificacao.referenciaId, referenciaId),
      ),
    )
    .orderBy(asc(notificacao.criadoEm));
}

/**
 * Toma para si um lote de mensagens, antes de enviar qualquer uma.
 *
 * Esta é a peça que permite mais de um drenador. "Seleciona pendentes,
 * envia, marca como enviada" funciona com um drenador e manda a mesma
 * mensagem duas vezes com dois: ambos selecionam a mesma linha antes de
 * qualquer um marcá-la.
 *
 * São dois passos na MESMA transação, e é a transação que os torna atômicos:
 * o `select ... for update` trava as linhas escolhidas, e o `update` as
 * marca como `enviando` antes de qualquer envio. Quem comita primeiro leva;
 * o outro só enxerga linhas que já não estão pendentes.
 *
 * O `skip locked` não é o que garante isso — a correção vem da troca de
 * status dentro da transação, e sem ele os testes de concorrência passam
 * igual. Ele é escolha de VAZÃO: o segundo drenador pula o que está travado
 * e leva outras mensagens, em vez de ficar parado esperando a transação do
 * primeiro terminar.
 *
 * `tentativas` é incrementado AQUI, ao reservar, e não ao falhar. É o que
 * impede uma mensagem que derruba o processo no meio do envio de ser tentada
 * para sempre: ela conta a tentativa mesmo que ninguém registre o resultado.
 */
async function reservarLote(
  anfitriaoId: string,
  limite: number,
): Promise<(typeof notificacao.$inferSelect)[]> {
  return withTenant(anfitriaoId, async (tx) => {
    const candidatas = await tx.execute<{ id: string }>(sql`
      select id from notificacao
       where tentativas < ${MAXIMO_DE_TENTATIVAS}
         and (
           status = 'pendente'
           or (
             status = 'enviando'
             and reservada_em < now() - make_interval(mins => ${MINUTOS_DE_RESERVA})
           )
         )
       order by criado_em
       limit ${limite}
       for update skip locked
    `);

    if (candidatas.length === 0) return [];

    return tx
      .update(notificacao)
      .set({
        status: "enviando",
        reservadaEm: new Date(),
        tentativas: sql`${notificacao.tentativas} + 1`,
      })
      .where(
        inArray(
          notificacao.id,
          candidatas.map((c) => c.id),
        ),
      )
      .returning();
  });
}
