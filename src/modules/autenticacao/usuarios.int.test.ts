import { randomBytes, randomUUID } from "node:crypto";

import { config } from "dotenv";
import { and, eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fecharConexao } from "@/db/client";
import * as schema from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { auth } from "@/lib/auth";
import { anfitriao, perfil, permissao } from "@/modules/anfitriao/schema";
import { auditoria } from "@/modules/auditoria/schema";

import { account, session, user } from "./schema";
import { membro } from "./schema-membro";
import { carregarSessaoDoPainel } from "./service";
import {
  AcessoJaExisteError,
  criarAcessoAoPainel,
  definirAtivoDoMembro,
  listarAcessos,
  sortearSenhaNova,
  trocarPerfilDoMembro,
} from "./usuarios";

config({ path: [".env.local", ".env"], quiet: true });

const urlOwner = process.env.DATABASE_URL_MIGRATOR;
if (!urlOwner) throw new Error("DATABASE_URL_MIGRATOR é necessária nos testes.");
const clienteOwner = postgres(urlOwner, { max: 5 });
const dbOwner = drizzle(clienteOwner, { schema });

const CASA_A = "__teste_usuarios_casa_A";
const CASA_B = "__teste_usuarios_casa_B";
/** Sufixo próprio por execução: o e-mail do Better Auth é único no sistema. */
const MARCA = randomUUID().slice(0, 8);
const dominio = `${MARCA}.teste.local`;

let anfitriaoA: string;
let anfitriaoB: string;
let perfilRecepcao: string;
let perfilProprietario: string;
let perfilDaCasaB: string;

const autor = { tipo: "sistema" } as const;

function emailDe(quem: string) {
  return `${quem}@${dominio}`;
}

async function limpar() {
  const casas = await dbOwner
    .select()
    .from(anfitriao)
    .where(inArray(anfitriao.nome, [CASA_A, CASA_B]));
  for (const c of casas) {
    await dbOwner.delete(auditoria).where(eq(auditoria.anfitriaoId, c.id));
    await dbOwner.delete(membro).where(eq(membro.anfitriaoId, c.id));
    await dbOwner.delete(permissao).where(eq(permissao.anfitriaoId, c.id));
    await dbOwner.delete(perfil).where(eq(perfil.anfitriaoId, c.id));
    await dbOwner.delete(anfitriao).where(eq(anfitriao.id, c.id));
  }

  // As contas do Better Auth são globais, sem coluna de anfitrião: a varredura
  // é pelo domínio desta execução. `account` e `session` caem por cascata.
  await dbOwner.delete(user).where(like(user.email, `%@${dominio}`));
}

/** O id do vínculo de um usuário, que é por onde a auditoria indexa. */
async function membroDe(usuarioId: string): Promise<string> {
  const [m] = await dbOwner
    .select({ id: membro.id })
    .from(membro)
    .where(eq(membro.usuarioId, usuarioId))
    .limit(1);
  if (!m) throw new Error(`Sem vínculo para ${usuarioId}.`);
  return m.id;
}

/** Entra de verdade, pela API do Better Auth. */
async function entrar(email: string, senha: string): Promise<boolean> {
  try {
    const r = await auth.api.signInEmail({ body: { email, password: senha } });
    return Boolean(r?.user);
  } catch {
    return false;
  }
}

beforeAll(async () => {
  await limpar();

  const [a] = await dbOwner
    .insert(anfitriao)
    .values({ nome: CASA_A, status: "ativa" })
    .returning();
  const [b] = await dbOwner
    .insert(anfitriao)
    .values({ nome: CASA_B, status: "ativa" })
    .returning();
  anfitriaoA = a!.id;
  anfitriaoB = b!.id;

  const [recepcao] = await dbOwner
    .insert(perfil)
    .values({
      anfitriaoId: anfitriaoA,
      nome: "Recepção",
      sistema: true,
      descontoMaximoPontosBase: 1_000,
    })
    .returning();
  const [proprietario] = await dbOwner
    .insert(perfil)
    .values({
      anfitriaoId: anfitriaoA,
      nome: "Proprietário",
      sistema: true,
      descontoMaximoPontosBase: 10_000,
      exigeDoisFatores: true,
    })
    .returning();
  const [daCasaB] = await dbOwner
    .insert(perfil)
    .values({ anfitriaoId: anfitriaoB, nome: "Proprietário", sistema: true })
    .returning();

  perfilRecepcao = recepcao!.id;
  perfilProprietario = proprietario!.id;
  perfilDaCasaB = daCasaB!.id;

  await dbOwner.insert(permissao).values([
    {
      anfitriaoId: anfitriaoA,
      perfilId: perfilRecepcao,
      modulo: "reservas",
      nivel: "editar",
    },
    {
      anfitriaoId: anfitriaoA,
      perfilId: perfilProprietario,
      modulo: "usuarios",
      nivel: "editar",
    },
  ]);
});

afterAll(async () => {
  await limpar();
  await clienteOwner.end();
  await fecharConexao();
});

describe("criarAcessoAoPainel", () => {
  it("cria alguém que consegue ENTRAR de verdade", async () => {
    // O teste que importa. O serviço escreve em `user` e `account` pelo nosso
    // `tx`, em vez de chamar o `internalAdapter` do Better Auth — ganhando
    // atomicidade e assumindo o risco de gravar um formato que o Better Auth
    // não reconheça. Supor que funciona foi o que deixou o login fora do ar
    // uma vez. Então aqui a senha vai pelo `signInEmail`, de verdade.
    const email = emailDe("entra");
    const { senha, perfilNome } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Quem Entra", email, perfilId: perfilRecepcao },
        autor,
      ),
    );

    expect(perfilNome).toBe("Recepção");
    expect(senha.length).toBeGreaterThanOrEqual(10);
    await expect(entrar(email, senha)).resolves.toBe(true);
  });

  it("recusa a senha errada", async () => {
    const email = emailDe("senha-errada");
    const { senha } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Senha Errada", email, perfilId: perfilRecepcao },
        autor,
      ),
    );

    await expect(entrar(email, `${senha}x`)).resolves.toBe(false);
  });

  it("deixa a sessão do painel pronta, com o perfil certo", async () => {
    const email = emailDe("sessao");
    const { usuarioId } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Com Sessão", email, perfilId: perfilRecepcao },
        autor,
      ),
    );

    const s = await carregarSessaoDoPainel({
      id: usuarioId,
      nome: "Com Sessão",
      email,
      doisFatoresAtivos: false,
    });

    expect(s).not.toBeNull();
    expect(s!.anfitriaoId).toBe(anfitriaoA);
    expect(s!.perfil.nome).toBe("Recepção");
    expect(s!.perfil.permissoes.reservas).toBe("editar");
  });

  it("guarda o e-mail em minúsculas, para o login não depender de maiúscula", async () => {
    const email = emailDe("maiuscula");
    const { senha } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Maiúscula", email: email.toUpperCase(), perfilId: perfilRecepcao },
        autor,
      ),
    );

    // Quem cadastra digita "Ana@Villa.com" e depois entra com "ana@villa.com".
    // Sem normalizar, são duas pessoas diferentes para o banco.
    await expect(entrar(email, senha)).resolves.toBe(true);
  });

  it("recusa quem já tem acesso", async () => {
    const email = emailDe("repetido");
    await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Repetido", email, perfilId: perfilRecepcao },
        autor,
      ),
    );

    await expect(
      withTenant(anfitriaoA, (tx) =>
        criarAcessoAoPainel(
          tx,
          anfitriaoA,
          { nome: "Repetido de novo", email, perfilId: perfilRecepcao },
          autor,
        ),
      ),
    ).rejects.toThrow(AcessoJaExisteError);
  });

  it("manda reativar, em vez de recriar, quando o acesso está desativado", async () => {
    const email = emailDe("desativado");
    const { usuarioId } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Desativado", email, perfilId: perfilRecepcao },
        autor,
      ),
    );

    const [m] = await dbOwner
      .select()
      .from(membro)
      .where(eq(membro.usuarioId, usuarioId))
      .limit(1);
    await withTenant(anfitriaoA, (tx) =>
      definirAtivoDoMembro(tx, anfitriaoA, m!.id, false, autor),
    );

    await expect(
      withTenant(anfitriaoA, (tx) =>
        criarAcessoAoPainel(
          tx,
          anfitriaoA,
          { nome: "Desativado", email, perfilId: perfilRecepcao },
          autor,
        ),
      ),
    ).rejects.toThrow(/desativado/i);
  });

  it("adota a conta órfã de uma criação interrompida", async () => {
    // A conta existe no Better Auth e não é membro de ninguém: é o que sobra
    // se a criação cair entre a conta e o vínculo. Recusar aqui trancaria
    // aquele e-mail para sempre, porque o e-mail é único no sistema.
    const email = emailDe("orfa");
    const id = `t-${MARCA}-orfa`;
    await dbOwner
      .insert(user)
      .values({ id, name: "Órfã", email, emailVerified: false });

    const { senha, usuarioId } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Órfã", email, perfilId: perfilRecepcao },
        autor,
      ),
    );

    expect(usuarioId).toBe(id);
    await expect(entrar(email, senha)).resolves.toBe(true);
  });

  it("recusa um perfil que não é desta casa", async () => {
    // O RLS já esconde o perfil da casa B, mas a recusa tem de ser explícita:
    // um `insert` com perfil_id de outro anfitrião passaria pela chave
    // estrangeira e criaria um vínculo cruzado.
    await expect(
      withTenant(anfitriaoA, (tx) =>
        criarAcessoAoPainel(
          tx,
          anfitriaoA,
          {
            nome: "Perfil de fora",
            email: emailDe("perfil-de-fora"),
            perfilId: perfilDaCasaB,
          },
          autor,
        ),
      ),
    ).rejects.toThrow(/[Pp]erfil não encontrado/);
  });

  it("não escreve a senha na auditoria", async () => {
    const email = emailDe("auditoria");
    const { senha, usuarioId } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Auditada", email, perfilId: perfilRecepcao },
        autor,
      ),
    );

    const linhas = await dbOwner
      .select()
      .from(auditoria)
      .where(
        and(
          eq(auditoria.entidade, "membro"),
          eq(auditoria.entidadeId, await membroDe(usuarioId)),
        ),
      );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.acao).toBe("criou");
    expect(JSON.stringify(linhas[0]!.valorDepois)).toContain(email);
    expect(JSON.stringify(linhas[0])).not.toContain(senha);
  });
});

/**
 * As contas que já existem têm id no formato do Better Auth — um texto como
 * "lMuyiovC5YgYDWxgHGeifWFkignmzDV3", não um uuid. `auditoria.entidade_id` é
 * `uuid`.
 *
 * Auditar a mudança pelo id do USUÁRIO parece natural e derruba toda operação
 * sobre essas contas com `22P02: invalid input syntax for type uuid` — a conta
 * do proprietário inclusive, que foi criada pelo script. Nada disso aparece no
 * typecheck: as duas colunas são string em TypeScript.
 *
 * Por isso a auditoria aponta para o VÍNCULO, cujo id é uuid, e estes testes
 * passam por uma conta com id do formato antigo de propósito.
 */
describe("conta com id no formato do Better Auth", () => {
  async function contaAntiga(sufixo: string) {
    // Um id no formato do Better Auth: texto alfanumérico, sem hífen. É o que
    // está no banco hoje, inclusive na conta do proprietário.
    const id = randomBytes(24).toString("base64url").replace(/[-_]/g, "a");
    const email = emailDe(sufixo);
    await dbOwner
      .insert(user)
      .values({ id, name: `Antiga ${sufixo}`, email, emailVerified: false });
    const [m] = await dbOwner
      .insert(membro)
      .values({
        anfitriaoId: anfitriaoA,
        usuarioId: id,
        perfilId: perfilRecepcao,
      })
      .returning();
    return { usuarioId: id, membroId: m!.id, email };
  }

  it("troca de perfil sem quebrar a auditoria", async () => {
    const c = await contaAntiga("antiga-perfil");
    expect(c.usuarioId).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    await withTenant(anfitriaoA, (tx) =>
      trocarPerfilDoMembro(tx, anfitriaoA, c.membroId, perfilProprietario, autor),
    );

    const linhas = await dbOwner
      .select()
      .from(auditoria)
      .where(eq(auditoria.entidadeId, c.membroId));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.valorDepois).toMatchObject({ usuarioId: c.usuarioId });
  });

  it("desativa sem quebrar a auditoria", async () => {
    const c = await contaAntiga("antiga-ativo");

    await withTenant(anfitriaoA, (tx) =>
      definirAtivoDoMembro(tx, anfitriaoA, c.membroId, false, autor),
    );

    const linhas = await dbOwner
      .select()
      .from(auditoria)
      .where(eq(auditoria.entidadeId, c.membroId));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.acao).toBe("desativou");
  });

  it("recebe senha nova sem quebrar a auditoria, e consegue entrar", async () => {
    const c = await contaAntiga("antiga-senha");

    const { senha } = await withTenant(anfitriaoA, (tx) =>
      sortearSenhaNova(tx, anfitriaoA, c.membroId, autor),
    );

    // A conta não tinha credencial nenhuma; a senha nova criou uma que serve.
    await expect(entrar(c.email, senha)).resolves.toBe(true);
  });
});

describe("listarAcessos", () => {
  it("mostra só quem é desta casa", async () => {
    const daA = emailDe("lista-a");
    const daB = emailDe("lista-b");

    await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Da casa A", email: daA, perfilId: perfilRecepcao },
        autor,
      ),
    );
    await withTenant(anfitriaoB, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoB,
        { nome: "Da casa B", email: daB, perfilId: perfilDaCasaB },
        autor,
      ),
    );

    const lista = await withTenant(anfitriaoA, (tx) => listarAcessos(tx));
    const emails = lista.map((m) => m.email);

    expect(emails).toContain(daA);
    // `user` é tabela global e sem RLS. O que isola é partir de `membro`; uma
    // consulta que começasse em `user` traria o sistema inteiro.
    expect(emails).not.toContain(daB);
  });

  it("traz o nome do perfil e se ele exige dois fatores", async () => {
    const email = emailDe("dono");
    await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Dono", email, perfilId: perfilProprietario },
        autor,
      ),
    );

    const lista = await withTenant(anfitriaoA, (tx) => listarAcessos(tx));
    const dono = lista.find((m) => m.email === email);

    expect(dono?.perfilNome).toBe("Proprietário");
    expect(dono?.exigeDoisFatores).toBe(true);
    expect(dono?.doisFatoresAtivos).toBe(false);
  });
});

describe("trocarPerfilDoMembro", () => {
  it("muda o que a pessoa pode, na requisição seguinte", async () => {
    const email = emailDe("promovida");
    const { usuarioId } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Promovida", email, perfilId: perfilRecepcao },
        autor,
      ),
    );

    const antes = await carregarSessaoDoPainel({
      id: usuarioId,
      nome: "Promovida",
      email,
      doisFatoresAtivos: false,
    });
    expect(antes!.perfil.permissoes.usuarios).toBe("nenhum");

    const [m] = await dbOwner
      .select()
      .from(membro)
      .where(eq(membro.usuarioId, usuarioId))
      .limit(1);
    await withTenant(anfitriaoA, (tx) =>
      trocarPerfilDoMembro(tx, anfitriaoA, m!.id, perfilProprietario, autor),
    );

    // Sem derrubar sessão: o painel resolve o perfil a cada requisição.
    const depois = await carregarSessaoDoPainel({
      id: usuarioId,
      nome: "Promovida",
      email,
      doisFatoresAtivos: false,
    });
    expect(depois!.perfil.nome).toBe("Proprietário");
    expect(depois!.perfil.permissoes.usuarios).toBe("editar");
  });

  it("registra o perfil anterior e o novo", async () => {
    const email = emailDe("auditoria-perfil");
    const { usuarioId } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Trocada", email, perfilId: perfilRecepcao },
        autor,
      ),
    );
    const [m] = await dbOwner
      .select()
      .from(membro)
      .where(eq(membro.usuarioId, usuarioId))
      .limit(1);

    await withTenant(anfitriaoA, (tx) =>
      trocarPerfilDoMembro(tx, anfitriaoA, m!.id, perfilProprietario, autor),
    );

    const linhas = await dbOwner
      .select()
      .from(auditoria)
      .where(
        and(
          eq(auditoria.entidadeId, m!.id),
          eq(auditoria.acao, "trocou-perfil"),
        ),
      );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.valorAntes).toMatchObject({ perfil: "Recepção" });
    expect(linhas[0]!.valorDepois).toMatchObject({
      perfil: "Proprietário",
      usuarioId,
    });
  });
});

describe("definirAtivoDoMembro", () => {
  it("fecha o painel e derruba a sessão aberta", async () => {
    const email = emailDe("demitida");
    const { usuarioId, senha } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Demitida", email, perfilId: perfilRecepcao },
        autor,
      ),
    );

    // Uma sessão de verdade, criada pelo login, para provar que ela cai.
    await entrar(email, senha);
    const abertas = await dbOwner
      .select()
      .from(session)
      .where(eq(session.userId, usuarioId));
    expect(abertas.length).toBeGreaterThan(0);

    const [m] = await dbOwner
      .select()
      .from(membro)
      .where(eq(membro.usuarioId, usuarioId))
      .limit(1);
    await withTenant(anfitriaoA, (tx) =>
      definirAtivoDoMembro(tx, anfitriaoA, m!.id, false, autor),
    );

    const s = await carregarSessaoDoPainel({
      id: usuarioId,
      nome: "Demitida",
      email,
      doisFatoresAtivos: false,
    });
    expect(s).toBeNull();

    const sobraram = await dbOwner
      .select()
      .from(session)
      .where(eq(session.userId, usuarioId));
    expect(sobraram).toHaveLength(0);
  });

  it("reativa e devolve o painel", async () => {
    const email = emailDe("readmitida");
    const { usuarioId } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Readmitida", email, perfilId: perfilRecepcao },
        autor,
      ),
    );
    const [m] = await dbOwner
      .select()
      .from(membro)
      .where(eq(membro.usuarioId, usuarioId))
      .limit(1);

    await withTenant(anfitriaoA, (tx) =>
      definirAtivoDoMembro(tx, anfitriaoA, m!.id, false, autor),
    );
    await withTenant(anfitriaoA, (tx) =>
      definirAtivoDoMembro(tx, anfitriaoA, m!.id, true, autor),
    );

    const s = await carregarSessaoDoPainel({
      id: usuarioId,
      nome: "Readmitida",
      email,
      doisFatoresAtivos: false,
    });
    expect(s).not.toBeNull();
  });
});

describe("sortearSenhaNova", () => {
  it("troca a senha, derruba as sessões e a antiga para de servir", async () => {
    const email = emailDe("esqueceu");
    const { usuarioId, senha: antiga } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Esqueceu", email, perfilId: perfilRecepcao },
        autor,
      ),
    );

    await entrar(email, antiga);

    const [m] = await dbOwner
      .select()
      .from(membro)
      .where(eq(membro.usuarioId, usuarioId))
      .limit(1);
    const { senha: nova } = await withTenant(anfitriaoA, (tx) =>
      sortearSenhaNova(tx, anfitriaoA, m!.id, autor),
    );

    expect(nova).not.toBe(antiga);
    await expect(entrar(email, antiga)).resolves.toBe(false);
    await expect(entrar(email, nova)).resolves.toBe(true);
  });

  it("cria a credencial quando ela não existe", async () => {
    // Conta sem linha em `account`: acontece com quem foi criado pelo script
    // antigo e teve a credencial apagada, ou num banco restaurado pela metade.
    // Um `update` sem linha é silencioso — a tela diria "senha trocada" e a
    // pessoa continuaria sem entrar.
    const email = emailDe("sem-credencial");
    const { usuarioId } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Sem credencial", email, perfilId: perfilRecepcao },
        autor,
      ),
    );
    await dbOwner.delete(account).where(eq(account.userId, usuarioId));

    const [m] = await dbOwner
      .select()
      .from(membro)
      .where(eq(membro.usuarioId, usuarioId))
      .limit(1);
    const { senha } = await withTenant(anfitriaoA, (tx) =>
      sortearSenhaNova(tx, anfitriaoA, m!.id, autor),
    );

    await expect(entrar(email, senha)).resolves.toBe(true);
  });

  it("não escreve a senha na auditoria", async () => {
    const email = emailDe("auditoria-senha");
    const { usuarioId } = await withTenant(anfitriaoA, (tx) =>
      criarAcessoAoPainel(
        tx,
        anfitriaoA,
        { nome: "Auditada senha", email, perfilId: perfilRecepcao },
        autor,
      ),
    );
    const [m] = await dbOwner
      .select()
      .from(membro)
      .where(eq(membro.usuarioId, usuarioId))
      .limit(1);

    const { senha } = await withTenant(anfitriaoA, (tx) =>
      sortearSenhaNova(tx, anfitriaoA, m!.id, autor),
    );

    const linhas = await dbOwner
      .select()
      .from(auditoria)
      .where(
        and(eq(auditoria.entidadeId, m!.id), eq(auditoria.acao, "trocou-senha")),
      );

    expect(linhas).toHaveLength(1);
    expect(JSON.stringify(linhas[0])).not.toContain(senha);
  });
});
