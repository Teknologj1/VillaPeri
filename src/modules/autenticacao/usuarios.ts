import { randomBytes, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Tx } from "@/db/tenant";
import { auth } from "@/lib/auth";
import { buscarPerfil, listarPerfis } from "@/modules/anfitriao";
import { type Autor, auditar } from "@/modules/auditoria";

import { account, session, user } from "./schema";
import { membro } from "./schema-membro";

export type AcessoAoPainel = {
  membroId: string;
  usuarioId: string;
  nome: string;
  email: string;
  perfilId: string;
  perfilNome: string;
  exigeDoisFatores: boolean;
  doisFatoresAtivos: boolean;
  ativo: boolean;
  criadoEm: Date;
};

/**
 * Quem tem acesso ao painel deste anfitrião.
 *
 * O `innerJoin` com `membro` não é conveniência de leitura: é o que isola.
 * `user` é tabela global e sem RLS — tem de ser, porque o login procura a
 * pessoa pelo e-mail antes de existir contexto de anfitrião. `membro` tem
 * RLS, então partir dela e juntar é o que garante que esta lista traga só
 * gente desta casa. Começar a consulta em `user` traria o sistema todo.
 *
 * O nome do perfil vem de uma segunda consulta, pelo serviço do Anfitrião, e
 * não de um `join` com a tabela `perfil`: ela é do módulo vizinho. São cinco
 * perfis — o custo é nenhum, e a fronteira continua valendo.
 */
export async function listarAcessos(tx: Tx): Promise<AcessoAoPainel[]> {
  const [linhas, perfis] = await Promise.all([
    tx
      .select({
        membroId: membro.id,
        usuarioId: membro.usuarioId,
        perfilId: membro.perfilId,
        ativo: membro.ativo,
        criadoEm: membro.criadoEm,
        nome: user.name,
        email: user.email,
        doisFatoresAtivos: user.twoFactorEnabled,
      })
      .from(membro)
      .innerJoin(user, eq(user.id, membro.usuarioId))
      .orderBy(user.name),
    listarPerfis(tx),
  ]);

  const porId = new Map(perfis.map((p) => [p.id, p]));

  return linhas.map((l) => {
    const p = porId.get(l.perfilId);
    return {
      membroId: l.membroId,
      usuarioId: l.usuarioId,
      nome: l.nome,
      email: l.email,
      perfilId: l.perfilId,
      // Um vínculo aponta para um perfil que existe, por chave estrangeira.
      // Se o mapa não o tiver, algo quebrou o isolamento ou a integridade —
      // melhor a tela dizer isso do que mostrar um espaço em branco.
      perfilNome: p?.nome ?? "perfil desconhecido",
      exigeDoisFatores: p?.exigeDoisFatores ?? false,
      doisFatoresAtivos: l.doisFatoresAtivos ?? false,
      ativo: l.ativo,
      criadoEm: l.criadoEm,
    };
  });
}

export class AcessoJaExisteError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "AcessoJaExisteError";
  }
}

/**
 * Uma senha inicial sorteada: 16 bytes em base64url, 22 caracteres.
 *
 * Passa com folga do `minPasswordLength: 10` do Better Auth e é ditável por
 * telefone. Não é guardada em texto claro em lugar nenhum: quem criou o acesso
 * a vê uma vez, na tela, e passa adiante.
 */
function senhaSorteada(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Um id no formato do próprio Better Auth, para `user` e `account`.
 *
 * `ctx.generateId` devolve `string | false`: `false` é como se diz a ele
 * "deixe o banco gerar". Nossas colunas são `text` sem `default`, então um
 * `false` aqui viraria `null` e o insert falharia na chave primária. O uuid é
 * a rede de segurança — funciona, só não fica igual aos demais.
 */
function idDoBetterAuth(
  ctx: { generateId: (opcoes: { model: string }) => string | false },
  model: "user" | "account",
): string {
  const id = ctx.generateId({ model });
  return id === false ? randomUUID() : id;
}

export type AcessoNovo = {
  nome: string;
  email: string;
  perfilId: string;
};

/**
 * Cria o acesso de alguém ao painel, com uma senha inicial sorteada.
 *
 * **Escreve nas tabelas do Better Auth pelo nosso `tx`, de propósito.** O
 * caminho natural seria `auth.$context.internalAdapter.createUser(...)`, que é
 * o que o script `usuario:criar` faz — mas o adaptador usa a conexão dele, não
 * esta transação. A conta e o vínculo ficariam em duas transações separadas, e
 * uma falha no meio deixaria uma conta órfã: existe para o login, não é membro
 * de ninguém, não entra no painel, e tentar recriá-la bate no e-mail único.
 *
 * Daqui, `user`, `account` e `membro` entram na MESMA transação: ou a pessoa
 * tem acesso completo, ou não existe. Do Better Auth usamos só
 * `ctx.password.hash`, que é função pura e não toca no banco — o formato do
 * hash continua sendo o dele, e quem valida a senha no login continua sendo
 * ele. O teste de integração entra pelo `signInEmail` de verdade justamente
 * para provar isso, em vez de supor.
 */
export async function criarAcessoAoPainel(
  tx: Tx,
  anfitriaoId: string,
  dados: AcessoNovo,
  autor: Autor,
): Promise<{ senha: string; usuarioId: string; perfilNome: string }> {
  const email = dados.email.trim().toLowerCase();

  // O RLS já recusaria um perfil de outro anfitrião, mas a mensagem seria
  // "perfil não encontrado" sem dizer por quê. E se um dia a política mudar,
  // esta checagem continua aqui.
  const p = await buscarPerfil(tx, dados.perfilId);
  if (!p) throw new Error("Perfil não encontrado.");

  const [existente] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existente) {
    // A conta existe. Ou esta pessoa já é da casa — e aí o acesso se reativa,
    // não se recria — ou é a conta órfã de uma criação interrompida, e o
    // vínculo que falta é justamente o que vamos inserir.
    //
    // Hoje há um anfitrião só, então "existe conta sem vínculo visível" é o
    // caso da criação interrompida. Quando houver vários, isto precisa virar
    // convite que a pessoa aceita: ligar a conta de alguém a uma casa sem o
    // consentimento dela não é cadastro, é tomada de conta.
    const [vinculo] = await tx
      .select({ ativo: membro.ativo })
      .from(membro)
      .where(eq(membro.usuarioId, existente.id))
      .limit(1);

    if (vinculo) {
      throw new AcessoJaExisteError(
        vinculo.ativo
          ? `${email} já tem acesso ao painel.`
          : `${email} já tem acesso, desativado. Reative em vez de criar outro.`,
      );
    }
  }

  const senha = senhaSorteada();
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(senha);

  // O gerador de id é o do próprio Better Auth, não `randomUUID()`: as colunas
  // são `text` e as contas criadas por ele têm o formato dele. Misturar
  // formatos funcionaria, mas deixaria duas safras de id na mesma tabela sem
  // nenhuma razão.
  const usuarioId = existente?.id ?? idDoBetterAuth(ctx, "user");

  if (!existente) {
    await tx.insert(user).values({
      id: usuarioId,
      name: dados.nome.trim(),
      email,
      emailVerified: false,
    });
  }

  // `providerId: "credential"` é o que o Better Auth procura ao validar senha.
  // Outro valor aqui cria uma conta que existe e nunca entra.
  await tx
    .insert(account)
    .values({
      id: idDoBetterAuth(ctx, "account"),
      userId: usuarioId,
      providerId: "credential",
      accountId: usuarioId,
      password: hash,
    })
    .onConflictDoNothing();

  const [m] = await tx
    .insert(membro)
    .values({ anfitriaoId, usuarioId, perfilId: p.id })
    .returning({ id: membro.id });

  await auditar(tx, {
    anfitriaoId,
    entidade: "membro",
    // O id do VÍNCULO, não o do usuário. `auditoria.entidade_id` é `uuid`, e
    // `user.id` é `text` com o formato do Better Auth
    // ("lMuyiovC5YgYDWxgHGeifWFkignmzDV3"), que o Postgres recusa com 22P02.
    // Auditar pelo usuário derrubaria toda mudança de acesso das contas que já
    // existem — inclusive a do proprietário. O e-mail vai no conteúdo, que é
    // onde se procura por pessoa.
    entidadeId: m!.id,
    acao: "criou",
    // A senha NÃO entra na auditoria. O que importa registrar é quem ganhou
    // acesso, com qual perfil e por decisão de quem.
    valorDepois: { nome: dados.nome.trim(), email, perfil: p.nome, usuarioId },
    autor,
  });

  return { senha, usuarioId, perfilNome: p.nome };
}

/**
 * Troca o perfil de quem já tem acesso.
 *
 * Vale na requisição seguinte, sem derrubar a sessão: `carregarSessaoDoPainel`
 * resolve o perfil a cada requisição a partir do `membro`, então não existe
 * permissão em cache para expirar.
 */
export async function trocarPerfilDoMembro(
  tx: Tx,
  anfitriaoId: string,
  membroId: string,
  perfilId: string,
  autor: Autor,
): Promise<void> {
  const [m] = await tx
    .select()
    .from(membro)
    .where(eq(membro.id, membroId))
    .limit(1);
  if (!m) throw new Error("Acesso não encontrado.");

  const p = await buscarPerfil(tx, perfilId);
  if (!p) throw new Error("Perfil não encontrado.");

  if (m.perfilId === perfilId) return;

  const anterior = await buscarPerfil(tx, m.perfilId);

  await tx
    .update(membro)
    .set({ perfilId })
    .where(and(eq(membro.id, membroId), eq(membro.anfitriaoId, anfitriaoId)));

  await auditar(tx, {
    anfitriaoId,
    entidade: "membro",
    entidadeId: m.id,
    acao: "trocou-perfil",
    valorAntes: { perfil: anterior?.nome ?? m.perfilId },
    valorDepois: { perfil: p.nome, usuarioId: m.usuarioId },
    autor,
  });
}

/**
 * Liga e desliga o acesso de alguém.
 *
 * Desativar é o caminho, não apagar: a auditoria aponta para o usuário, e as
 * reservas lançadas por ele também. Apagar a linha deixaria o histórico
 * falando de alguém que não existe mais.
 *
 * `carregarSessaoDoPainel` só aceita vínculo `ativo`, então desativar fecha o
 * painel na próxima requisição — inclusive para quem está logado agora. As
 * sessões abertas vão embora junto, para não depender disso.
 */
export async function definirAtivoDoMembro(
  tx: Tx,
  anfitriaoId: string,
  membroId: string,
  ativo: boolean,
  autor: Autor,
): Promise<void> {
  const [m] = await tx
    .select()
    .from(membro)
    .where(eq(membro.id, membroId))
    .limit(1);
  if (!m) throw new Error("Acesso não encontrado.");
  if (m.ativo === ativo) return;

  await tx
    .update(membro)
    .set({ ativo })
    .where(and(eq(membro.id, membroId), eq(membro.anfitriaoId, anfitriaoId)));

  if (!ativo) {
    await tx.delete(session).where(eq(session.userId, m.usuarioId));
  }

  await auditar(tx, {
    anfitriaoId,
    entidade: "membro",
    entidadeId: m.id,
    acao: ativo ? "reativou" : "desativou",
    valorAntes: { ativo: m.ativo },
    valorDepois: { ativo, usuarioId: m.usuarioId },
    autor,
  });
}

/**
 * Sorteia uma senha nova para quem perdeu a dela.
 *
 * Não é "enviar link de redefinição": o painel não tem e-mail transacional
 * configurado, e inventar um fluxo de recuperação por e-mail que ninguém
 * testou é pior do que o proprietário ditar uma senha nova por telefone.
 */
export async function sortearSenhaNova(
  tx: Tx,
  anfitriaoId: string,
  membroId: string,
  autor: Autor,
): Promise<{ senha: string; email: string }> {
  const [m] = await tx
    .select({ id: membro.id, usuarioId: membro.usuarioId, email: user.email })
    .from(membro)
    .innerJoin(user, eq(user.id, membro.usuarioId))
    .where(eq(membro.id, membroId))
    .limit(1);
  if (!m) throw new Error("Acesso não encontrado.");

  const senha = senhaSorteada();
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(senha);

  const atualizadas = await tx
    .update(account)
    .set({ password: hash })
    .where(
      and(eq(account.userId, m.usuarioId), eq(account.providerId, "credential")),
    )
    .returning({ id: account.id });

  // Sem linha de credencial não há senha para trocar, e um `update` que não
  // acha nada é silencioso: a tela diria "senha trocada" e a pessoa seguiria
  // sem conseguir entrar.
  if (atualizadas.length === 0) {
    await tx.insert(account).values({
      id: idDoBetterAuth(ctx, "account"),
      userId: m.usuarioId,
      providerId: "credential",
      accountId: m.usuarioId,
      password: hash,
    });
  }

  // Derruba o que estiver aberto, na mesma transação. Trocar a senha e deixar
  // a sessão antiga valendo não resolve o caso em que a senha vazou — que é
  // metade das razões para trocar.
  await tx.delete(session).where(eq(session.userId, m.usuarioId));

  await auditar(tx, {
    anfitriaoId,
    entidade: "membro",
    entidadeId: m.id,
    acao: "trocou-senha",
    valorDepois: { usuarioId: m.usuarioId, email: m.email },
    autor,
  });

  return { senha, email: m.email };
}
