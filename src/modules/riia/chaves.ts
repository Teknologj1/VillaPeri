import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { chavePorPrefixo, marcarUsoDaChave } from "@/lib/chave-api-publica";
import type { Tx } from "@/db/tenant";

import { chaveApi } from "./schema";
import {
  type Ferramenta,
  type NivelAutonomia,
  ferramentasDoNivel,
  motivoDaNegativa,
  podeUsar,
} from "./ferramentas";

/**
 * A credencial de serviço da RIIA: como nasce, como é reconhecida e como morre.
 */

/**
 * O formato da chave: `vp_<prefixo>_<segredo>`.
 *
 * O prefixo é HEXADECIMAL, não base64url, por um motivo prático: o segredo é
 * base64url e contém `_` e `-`. Com prefixo da mesma família, não há como
 * separar as partes sem ambiguidade — a primeira versão disto dividia por
 * `_` e recusava toda chave cujo segredo tivesse um underscore, que é mais
 * ou menos metade delas.
 *
 * Em hexadecimal de tamanho fixo, a leitura é posicional e não tem dúvida.
 * O prefixo é público por desenho (serve para achar a linha), então oito
 * caracteres bastam.
 */
const MARCA = "vp";
const FORMATO = /^vp_([0-9a-f]{8})_(.+)$/;
const BYTES_DO_PREFIXO = 4;
const BYTES_DO_SEGREDO = 32;

export function hashDaChave(segredo: string): string {
  return createHash("sha256").update(segredo).digest("hex");
}

export type ChaveReconhecida = {
  id: string;
  anfitriaoId: string;
  escopos: string[];
  nivelAutonomia: number;
  limitePorMinuto: number;
};

export type FalhaDeAutenticacao =
  | { motivo: "ausente" }
  | { motivo: "formato" }
  | { motivo: "desconhecida" }
  | { motivo: "revogada" }
  | { motivo: "vencida" };

/**
 * Reconhece a chave que veio no cabeçalho.
 *
 * Roda ANTES de existir contexto de anfitrião — é justamente o anfitrião que
 * se está descobrindo —, então usa a função `chave_api_por_prefixo()`, que é
 * a porta estreita do banco (migração 0018). Depois daqui, todo o resto da
 * requisição corre dentro de `withTenant`.
 *
 * A comparação do hash é em TEMPO CONSTANTE. Um `===` vaza, pela diferença
 * de microssegundos entre "errou no primeiro caractere" e "errou no último",
 * informação suficiente para alguém descobrir o hash byte a byte. O prefixo
 * pode ser comparado normalmente: ele é público por desenho.
 */
export async function reconhecerChave(
  cabecalho: string | null,
): Promise<
  { ok: true; chave: ChaveReconhecida } | { ok: false; falha: FalhaDeAutenticacao }
> {
  if (!cabecalho) return { ok: false, falha: { motivo: "ausente" } };

  const bruta = cabecalho.replace(/^Bearer\s+/i, "").trim();
  const partes = FORMATO.exec(bruta);
  if (!partes) return { ok: false, falha: { motivo: "formato" } };
  const [, prefixo, segredo] = partes as unknown as [string, string, string];

  const linha = await chavePorPrefixo(prefixo);
  if (!linha) return { ok: false, falha: { motivo: "desconhecida" } };

  const esperado = Buffer.from(linha.hash, "hex");
  const recebido = Buffer.from(hashDaChave(segredo), "hex");
  if (
    esperado.length !== recebido.length ||
    !timingSafeEqual(esperado, recebido)
  ) {
    return { ok: false, falha: { motivo: "desconhecida" } };
  }

  if (linha.revogada_em) return { ok: false, falha: { motivo: "revogada" } };
  if (linha.valida_ate && linha.valida_ate.getTime() < Date.now()) {
    return { ok: false, falha: { motivo: "vencida" } };
  }

  marcarUsoDaChave(linha.id);

  return {
    ok: true,
    chave: {
      id: linha.id,
      anfitriaoId: linha.anfitriao_id,
      escopos: linha.escopos ?? [],
      nivelAutonomia: linha.nivel_autonomia,
      limitePorMinuto: linha.limite_por_minuto,
    },
  };
}

export { motivoDaNegativa, podeUsar };

// ---------------------------------------------------------------------------
// Criar e revogar
// ---------------------------------------------------------------------------

export type ChaveNova = {
  nome: string;
  nivelAutonomia?: NivelAutonomia;
  /** Omitido, recebe todas as ferramentas do nível. */
  escopos?: Ferramenta[];
  limitePorMinuto?: number;
  validaAte?: Date | null;
};

/**
 * Cria a chave e devolve o segredo UMA vez.
 *
 * O segredo não é guardado em lugar nenhum — só o hash. Quem perder a chave
 * cria outra e revoga a anterior; não há "mostrar de novo", e é assim que
 * deve ser: um segredo recuperável é um segredo que vaza junto com o banco.
 */
export async function criarChave(
  tx: Tx,
  anfitriaoId: string,
  dados: ChaveNova,
): Promise<{ id: string; chave: string; prefixo: string }> {
  const nivel = dados.nivelAutonomia ?? 1;
  const prefixo = randomBytes(BYTES_DO_PREFIXO).toString("hex");
  const segredo = randomBytes(BYTES_DO_SEGREDO).toString("base64url");

  const [criada] = await tx
    .insert(chaveApi)
    .values({
      anfitriaoId,
      nome: dados.nome.trim(),
      prefixo,
      hash: hashDaChave(segredo),
      escopos: dados.escopos ?? ferramentasDoNivel(nivel),
      nivelAutonomia: nivel,
      limitePorMinuto: dados.limitePorMinuto ?? 60,
      validaAte: dados.validaAte ?? null,
    })
    .returning();

  if (!criada) throw new Error("Não foi possível criar a chave.");

  return {
    id: criada.id,
    prefixo,
    chave: `${MARCA}_${prefixo}_${segredo}`,
  };
}

/** Revogação é imediata: a próxima requisição já é recusada. */
export async function revogarChave(tx: Tx, id: string): Promise<void> {
  await tx
    .update(chaveApi)
    .set({ revogadaEm: new Date(), atualizadoEm: new Date() })
    .where(eq(chaveApi.id, id));
}

export async function listarChaves(tx: Tx) {
  return tx
    .select({
      id: chaveApi.id,
      nome: chaveApi.nome,
      prefixo: chaveApi.prefixo,
      escopos: chaveApi.escopos,
      nivelAutonomia: chaveApi.nivelAutonomia,
      limitePorMinuto: chaveApi.limitePorMinuto,
      validaAte: chaveApi.validaAte,
      revogadaEm: chaveApi.revogadaEm,
      ultimoUsoEm: chaveApi.ultimoUsoEm,
      criadoEm: chaveApi.criadoEm,
    })
    .from(chaveApi)
    .orderBy(chaveApi.criadoEm);
}

// ---------------------------------------------------------------------------
// Limite de requisições
// ---------------------------------------------------------------------------

/**
 * Janela deslizante em memória, por chave.
 *
 * Em memória porque o freio precisa ser barato: uma ida ao banco por
 * requisição para contar requisições é a própria carga que se quer limitar.
 * A consequência é conhecida e aceita: em serverless cada instância tem a sua
 * contagem, então o limite real é o configurado vezes o número de instâncias.
 *
 * Isso basta para o que o limite serve aqui — impedir que um laço na RIIA
 * faça mil chamadas por minuto. Contra ataque distribuído não é isto que
 * protege; é a chave ser secreta e revogável.
 */
const JANELA_MS = 60_000;
const chamadas = new Map<string, number[]>();

export function dentroDoLimite(
  chaveId: string,
  limitePorMinuto: number,
  agora: number = Date.now(),
): { ok: boolean; restantes: number; esperaSegundos: number } {
  const recentes = (chamadas.get(chaveId) ?? []).filter(
    (t) => agora - t < JANELA_MS,
  );

  if (recentes.length >= limitePorMinuto) {
    const maisAntiga = recentes[0]!;
    chamadas.set(chaveId, recentes);
    return {
      ok: false,
      restantes: 0,
      esperaSegundos: Math.max(
        Math.ceil((JANELA_MS - (agora - maisAntiga)) / 1000),
        1,
      ),
    };
  }

  recentes.push(agora);
  chamadas.set(chaveId, recentes);
  return {
    ok: true,
    restantes: limitePorMinuto - recentes.length,
    esperaSegundos: 0,
  };
}

/** Só para os testes: zera a contagem entre casos. */
export function limparLimites(): void {
  chamadas.clear();
}
