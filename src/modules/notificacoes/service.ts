import { and, asc, eq, lt } from "drizzle-orm";

import { type Tx, withTenant } from "@/db/tenant";

import { enviadorDoCanal, variavelFaltante } from "./enviadores";
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
 * Tenta entregar o que está na fila.
 *
 * Chamada por tarefa agendada e, se quiser, pelo painel. O envio acontece
 * FORA de transação: é chamada de rede, e segurar uma transação aberta
 * enquanto se espera um provedor externo prende conexão do banco à toa.
 *
 * Sem provedor configurado para o canal, a mensagem continua pendente — não
 * é marcada como enviada nem descartada. Fingir que saiu é o pior resultado:
 * o hóspede não recebe e ninguém fica sabendo.
 */
export async function drenarFila(
  anfitriaoId: string,
  limite = 25,
): Promise<ResultadoDaDrenagem> {
  const pendentes = await withTenant(anfitriaoId, (tx) =>
    tx
      .select()
      .from(notificacao)
      .where(
        and(
          eq(notificacao.status, "pendente"),
          lt(notificacao.tentativas, MAXIMO_DE_TENTATIVAS),
        ),
      )
      .orderBy(asc(notificacao.criadoEm))
      .limit(limite),
  );

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
        destinatario: m.destinatario,
        nomeDestinatario: m.nomeDestinatario,
        assunto: m.assunto,
        corpo: m.corpo,
      });

      await withTenant(anfitriaoId, (tx) =>
        tx
          .update(notificacao)
          .set({
            status: "enviada",
            enviadaEm: new Date(),
            tentativas: m.tentativas + 1,
            ultimoErro: null,
          })
          .where(eq(notificacao.id, m.id)),
      );
      resultado.enviadas++;
    } catch (erro) {
      const tentativas = m.tentativas + 1;
      const texto = erro instanceof Error ? erro.message : String(erro);

      await withTenant(anfitriaoId, (tx) =>
        tx
          .update(notificacao)
          .set({
            // Só desiste ao esgotar as tentativas; antes disso continua na
            // fila para a próxima passada.
            status: tentativas >= MAXIMO_DE_TENTATIVAS ? "falhou" : "pendente",
            tentativas,
            ultimoErro: texto.slice(0, 500),
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
