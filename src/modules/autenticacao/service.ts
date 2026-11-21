import { and, eq } from "drizzle-orm";

import { comContextoDeUsuario, definirAnfitriao } from "@/db/tenant";
import {
  type Modulo,
  type Nivel,
  type PerfilComPermissoes,
  buscarPerfilComPermissoes,
} from "@/modules/anfitriao";

import { membro } from "./schema-membro";

export type SessaoDoPainel = {
  usuarioId: string;
  nome: string;
  email: string;
  anfitriaoId: string;
  perfil: PerfilComPermissoes;
  /**
   * O perfil exige verificação em dois passos e a pessoa ainda não ativou.
   *
   * A especificação torna os dois fatores obrigatórios para o Proprietário.
   * Enquanto a tela de ativação não existe, o painel avisa em vez de bloquear
   * — bloquear sem oferecer o caminho de ativação trancaria o proprietário
   * para fora do próprio sistema.
   */
  precisaAtivarDoisFatores: boolean;
};

export type DadosDoUsuario = {
  id: string;
  nome: string;
  email: string;
  doisFatoresAtivos: boolean;
};

/**
 * Resolve, a partir do usuário autenticado, de qual anfitrião ele é e o que
 * pode fazer.
 *
 * É o único caminho entre a autenticação (global) e o domínio (isolado por
 * anfitrião). Tudo no painel começa aqui, inclusive o `anfitriaoId` que o
 * resto da requisição usa em `withTenant`.
 *
 * `usuarioId` tem de vir da sessão assinada — nunca de parâmetro de URL, de
 * corpo de requisição ou de cabeçalho. Quem chamar isto com um id vindo do
 * cliente entrega o sistema inteiro.
 */
export async function carregarSessaoDoPainel(
  usuario: DadosDoUsuario,
): Promise<SessaoDoPainel | null> {
  const usuarioId = usuario.id;
  return comContextoDeUsuario(usuarioId, async (tx) => {
    const [vinculo] = await tx
      .select()
      .from(membro)
      .where(and(eq(membro.usuarioId, usuarioId), eq(membro.ativo, true)))
      .limit(1);

    // Usuário existe mas não é membro de nenhum anfitrião, ou foi desativado.
    // Autenticado não é o mesmo que autorizado.
    if (!vinculo) return null;

    // A partir daqui a transação corre no contexto do anfitrião, como
    // qualquer outra leitura do sistema.
    await definirAnfitriao(tx, vinculo.anfitriaoId);

    const perfil = await buscarPerfilComPermissoes(tx, vinculo.perfilId);
    if (!perfil) return null;

    return {
      usuarioId,
      nome: usuario.nome,
      email: usuario.email,
      anfitriaoId: vinculo.anfitriaoId,
      perfil,
      precisaAtivarDoisFatores:
        perfil.exigeDoisFatores && !usuario.doisFatoresAtivos,
    };
  });
}

// ---------------------------------------------------------------------------
// Permissões
// ---------------------------------------------------------------------------

/** Ordem crescente de poder. `lancar` cria, mas não altera o que já existe. */
const FORCA: Record<Nivel, number> = {
  nenhum: 0,
  ver: 1,
  lancar: 2,
  editar: 3,
};

export function nivelEm(sessao: SessaoDoPainel, modulo: Modulo): Nivel {
  return sessao.perfil.permissoes[modulo] ?? "nenhum";
}

export function podeNoModulo(
  sessao: SessaoDoPainel,
  modulo: Modulo,
  minimo: Nivel,
): boolean {
  return FORCA[nivelEm(sessao, modulo)] >= FORCA[minimo];
}

export class SemPermissaoError extends Error {
  readonly modulo: Modulo;
  readonly exigido: Nivel;
  readonly concedido: Nivel;

  constructor(modulo: Modulo, exigido: Nivel, concedido: Nivel) {
    super(
      `O perfil não tem permissão de "${exigido}" no módulo "${modulo}" (tem "${concedido}").`,
    );
    this.name = "SemPermissaoError";
    this.modulo = modulo;
    this.exigido = exigido;
    this.concedido = concedido;
  }
}

/** Levanta erro se o perfil não alcançar o nível. Use antes de agir. */
export function exigirPermissao(
  sessao: SessaoDoPainel,
  modulo: Modulo,
  minimo: Nivel,
): void {
  if (!podeNoModulo(sessao, modulo, minimo)) {
    throw new SemPermissaoError(modulo, minimo, nivelEm(sessao, modulo));
  }
}

/**
 * Se o desconto cabe no que o perfil concede sozinho.
 *
 * Acima disso a reserva não é recusada: fica "aguardando aprovação" do
 * Gerente ou do Proprietário, que é o que a especificação pede.
 */
export function descontoDentroDoLimite(
  sessao: SessaoDoPainel,
  descontoPontosBase: number,
): boolean {
  return descontoPontosBase <= sessao.perfil.descontoMaximoPontosBase;
}
