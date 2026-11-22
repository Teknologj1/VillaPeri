import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";

import { type Tx, withTenant } from "@/db/tenant";
import { telefoneCanonico } from "@/lib/telefone";
import { lembrarResposta, respostaGuardada } from "@/modules/anfitriao";
import {
  type ChaveReconhecida,
  type Ferramenta,
  acharOuCriarConversa,
  dentroDoLimite,
  motivoDaNegativa,
  podeUsar,
  reconhecerChave,
  registrarAcao,
} from "@/modules/riia";

/**
 * O que toda rota da API da RIIA faz antes e depois do trabalho dela.
 *
 * Autenticar, conferir escopo e nível, frear por limite, resolver a conversa
 * pelo telefone, responder a repetição com a resposta guardada e registrar a
 * ação. Escrito uma vez porque uma rota que esqueça qualquer um desses passos
 * não falha de forma visível — ela simplesmente fica mais permissiva que as
 * outras, e ninguém percebe até acontecer.
 */

export type ErroDaApi = {
  codigo: string;
  mensagem: string;
  dados?: Record<string, unknown>;
};

/**
 * O formato de erro, igual em todas as rotas.
 *
 * Código estável para a RIIA decidir o que fazer, mensagem em português para
 * ela repassar ao hóspede sem reescrever, e dados estruturados para montar a
 * frase com números certos. "Erro 400" não ajuda ninguém a responder no
 * WhatsApp.
 */
export function erro(
  status: number,
  codigo: string,
  mensagem: string,
  dados?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ erro: { codigo, mensagem, dados } }, { status });
}

export type ContextoDaChamada = {
  chave: ChaveReconhecida;
  anfitriaoId: string;
  tx: Tx;
  /** A conversa do telefone que veio no corpo, criada se for a primeira. */
  conversaId: string | null;
  telefone: string | null;
};

type Opcoes<E> = {
  ferramenta: Ferramenta;
  /** Esquema do corpo (POST) ou dos parâmetros de busca (GET). */
  entrada: ZodType<E>;
  /** Lê os parâmetros da URL em vez do corpo. */
  deQuery?: boolean;
  /** Guarda a resposta pela chave de idempotência e repete em vez de refazer. */
  idempotente?: boolean;
  executar: (dados: E, ctx: ContextoDaChamada) => Promise<unknown>;
};



/** O segundo argumento que o Next passa a uma rota com segmento dinâmico. */
type ContextoDeRota = { params: Promise<Record<string, string>> };

export function rota<E>(opcoes: Opcoes<E>) {
  return async function manipular(
    requisicao: NextRequest,
    contextoDaRota?: ContextoDeRota,
  ) {
    const reconhecida = await reconhecerChave(
      requisicao.headers.get("authorization"),
    );

    if (!reconhecida.ok) {
      const { motivo } = reconhecida.falha;
      const mensagens: Record<string, string> = {
        ausente: "Falta o cabeçalho Authorization com a chave da API.",
        formato: "A chave não está no formato vp_<prefixo>_<segredo>.",
        desconhecida: "Chave não reconhecida.",
        revogada: "Esta chave foi revogada.",
        vencida: "Esta chave passou da validade.",
      };
      return erro(401, `chave_${motivo}`, mensagens[motivo] ?? "Não autorizado.");
    }

    const { chave } = reconhecida;

    if (!podeUsar(chave, opcoes.ferramenta)) {
      // Diz QUAL das duas trancas fechou — escopo da chave ou nível da conta —
      // porque a correção é em lugares diferentes.
      return erro(
        403,
        "sem_escopo",
        motivoDaNegativa(chave, opcoes.ferramenta),
        { ferramenta: opcoes.ferramenta, nivelDaConta: chave.nivelAutonomia },
      );
    }

    const limite = dentroDoLimite(chave.id, chave.limitePorMinuto);
    if (!limite.ok) {
      return NextResponse.json(
        {
          erro: {
            codigo: "limite_excedido",
            mensagem: `Limite de ${chave.limitePorMinuto} chamadas por minuto. Tente de novo em ${limite.esperaSegundos}s.`,
            dados: { esperaSegundos: limite.esperaSegundos },
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(limite.esperaSegundos) },
        },
      );
    }

    // --- entrada -----------------------------------------------------------

    let bruto: unknown;
    if (opcoes.deQuery) {
      bruto = Object.fromEntries(requisicao.nextUrl.searchParams);
    } else {
      try {
        bruto = await requisicao.json();
      } catch {
        return erro(400, "corpo_invalido", "O corpo precisa ser JSON válido.");
      }
    }

    // Os segmentos da URL entram no mesmo objeto, e MANDAM sobre o que veio
    // no corpo: `/reservas/R-4K7P` com `{"codigo":"R-OUTRA"}` dentro é um
    // pedido ambíguo, e a URL é a parte que o chamador escreveu de propósito.
    const doCaminho = contextoDaRota ? await contextoDaRota.params : null;
    if (doCaminho && typeof bruto === "object" && bruto !== null) {
      bruto = { ...(bruto as object), ...doCaminho };
    }

    const analise = opcoes.entrada.safeParse(bruto);
    if (!analise.success) {
      return erro(
        422,
        "entrada_invalida",
        analise.error.issues[0]?.message ?? "Parâmetros inválidos.",
        {
          problemas: analise.error.issues.map((i) => ({
            campo: i.path.join("."),
            mensagem: i.message,
          })),
        },
      );
    }

    // --- idempotência ------------------------------------------------------

    const chaveIdem = requisicao.headers.get("idempotency-key");
    const hashRequisicao = createHash("sha256")
      .update(JSON.stringify(bruto ?? null))
      .digest("hex");
    const rotaNome = opcoes.ferramenta;

    if (opcoes.idempotente && chaveIdem) {
      const guardada = await withTenant(chave.anfitriaoId, (tx) =>
        respostaGuardada(tx, chaveIdem),
      );
      if (guardada) {
        if (guardada.hashRequisicao !== hashRequisicao) {
          // Mesma chave com corpo diferente não é repetição: é erro de quem
          // chama. Devolver a resposta antiga esconderia o engano e a RIIA
          // acharia ter criado algo que não criou.
          return erro(
            409,
            "idempotencia_conflito",
            "Esta chave de idempotência já foi usada com outro conteúdo.",
          );
        }
        return NextResponse.json(guardada.resposta, {
          status: guardada.statusHttp,
          headers: { "Idempotent-Replay": "true" },
        });
      }
    }

    // --- trabalho ----------------------------------------------------------

    const telefoneBruto =
      typeof bruto === "object" && bruto !== null && "telefone" in bruto
        ? String((bruto as { telefone?: unknown }).telefone ?? "")
        : "";
    // Canônico: é a identidade da conversa. Sem isto, "(62) 98888-7777" e
    // "5562988887777" viram duas conversas do mesmo hóspede.
    const telefone = telefoneBruto ? telefoneCanonico(telefoneBruto) : null;

    try {
      const { resposta, status, conversaId } = await withTenant(
        chave.anfitriaoId,
        async (tx) => {
          const conversaId = telefone
            ? await acharOuCriarConversa(
                tx,
                chave.anfitriaoId,
                telefone,
                nomeDoCorpo(bruto),
              )
            : null;

          const saida = await opcoes.executar(analise.data, {
            chave,
            anfitriaoId: chave.anfitriaoId,
            tx,
            conversaId,
            telefone,
          });

          const resultado =
            saida instanceof RespostaDaFerramenta
              ? saida
              : new RespostaDaFerramenta(saida, 200);

          if (opcoes.idempotente && chaveIdem) {
            await lembrarResposta(tx, chave.anfitriaoId, {
              chave: chaveIdem,
              rota: rotaNome,
              hashRequisicao,
              resposta: resultado.corpo,
              statusHttp: resultado.status,
            });
          }

          await registrarAcao(tx, chave.anfitriaoId, {
            chaveApiId: chave.id,
            conversaId,
            ferramenta: opcoes.ferramenta,
            chaveIdempotencia: chaveIdem,
            parametros: bruto,
            resultado: resultado.corpo,
            statusHttp: resultado.status,
          });

          return {
            resposta: resultado.corpo,
            status: resultado.status,
            conversaId,
          };
        },
      );

      return NextResponse.json(
        conversaId ? { ...(resposta as object), conversaId } : resposta,
        { status },
      );
    } catch (e) {
      if (e instanceof ErroDeFerramenta) {
        // Registrado fora da transação que falhou: a de dentro foi desfeita,
        // e sem isto a recusa não apareceria em lugar nenhum.
        await withTenant(chave.anfitriaoId, (tx) =>
          registrarAcao(tx, chave.anfitriaoId, {
            chaveApiId: chave.id,
            conversaId: null,
            ferramenta: opcoes.ferramenta,
            chaveIdempotencia: chaveIdem,
            parametros: bruto,
            resultado: { codigo: e.codigo, mensagem: e.message },
            statusHttp: e.status,
          }),
        ).catch(() => undefined);

        return erro(e.status, e.codigo, e.message, e.dados);
      }
      throw e;
    }
  };
}

/** Para a ferramenta devolver um status diferente de 200. */
export class RespostaDaFerramenta {
  constructor(
    readonly corpo: unknown,
    readonly status: number,
  ) {}
}

/** Recusa com código estável, que vira a resposta de erro da API. */
export class ErroDeFerramenta extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly dados?: Record<string, unknown>,
  ) {
    super(mensagem);
    this.name = "ErroDeFerramenta";
  }
}

/** O nome que veio no corpo, quando veio: serve para nomear a conversa. */
function nomeDoCorpo(bruto: unknown): string | null {
  if (typeof bruto !== "object" || bruto === null || !("nome" in bruto)) {
    return null;
  }
  return String((bruto as { nome?: unknown }).nome ?? "") || null;
}
