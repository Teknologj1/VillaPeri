import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { config } from "dotenv";
import { and, eq } from "drizzle-orm";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Cria um usuário do painel e o vincula a um anfitrião, com um perfil.
 *
 * Existe como script e não como seed porque senha não se versiona. A senha é
 * sorteada e impressa UMA vez; não fica em arquivo nenhum. Quando o painel
 * tiver a tela de usuários, isto vira a tela — e esta é a ferramenta para
 * criar o primeiro acesso, antes de existir alguém que possa usá-la.
 *
 *   npm run usuario:criar -- --nome "Renato" --email renato@exemplo.com
 *   npm run usuario:criar -- --nome "Ana" --email ana@exemplo.com --perfil Recepção
 */
async function principal() {
  const { values } = parseArgs({
    options: {
      nome: { type: "string" },
      email: { type: "string" },
      perfil: { type: "string", default: "Proprietário" },
      senha: { type: "string" },
    },
  });

  if (!values.nome || !values.email) {
    console.error(
      'Uso: npm run usuario:criar -- --nome "Nome" --email pessoa@exemplo.com [--perfil Recepção]',
    );
    process.exit(1);
  }

  const { auth } = await import("@/lib/auth");
  const { fecharConexao } = await import("@/db/client");
  const { withTenant } = await import("@/db/tenant");
  const { anfitriao, perfil } = await import("@/modules/anfitriao/schema");
  const { membro } = await import("@/modules/autenticacao/schema-membro");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { conectarComoDono } = await import("@/db/conectar");

  // O anfitrião e o perfil são lidos com a conexão de migração: ainda não há
  // sessão, logo não há contexto de anfitrião para o RLS.
  const clienteOwner = conectarComoDono({ max: 1 });
  const dbOwner = drizzle(clienteOwner);

  try {
    const [vp] = await dbOwner
      .select()
      .from(anfitriao)
      .where(eq(anfitriao.nome, "Villa Peri"))
      .limit(1);
    if (!vp) throw new Error("Anfitrião Villa Peri não encontrado. Rode o seed.");

    const [p] = await dbOwner
      .select()
      .from(perfil)
      .where(and(eq(perfil.anfitriaoId, vp.id), eq(perfil.nome, values.perfil!)))
      .limit(1);
    if (!p) {
      throw new Error(
        `Perfil "${values.perfil}" não existe. Opções: Proprietário, Gerente, Recepção, Governança, Financeiro.`,
      );
    }

    // 16 bytes em base64url: entropia de sobra e fácil de ditar por telefone.
    const senha = values.senha ?? randomBytes(16).toString("base64url");

    const ctx = await auth.$context;
    const existente = await ctx.internalAdapter.findUserByEmail(values.email!);
    if (existente) {
      throw new Error(`Já existe usuário com o e-mail ${values.email}.`);
    }

    const usuario = await ctx.internalAdapter.createUser(
      {
        name: values.nome!,
        email: values.email!,
        emailVerified: false,
      },
      // De onde veio o usuário. Fica registrado, e deixa claro na auditoria
      // que esta conta não nasceu de um cadastro pela interface.
      { method: "script:criar-usuario" },
    );

    await ctx.internalAdapter.createAccount({
      userId: usuario.id,
      providerId: "credential",
      accountId: usuario.id,
      password: await ctx.password.hash(senha),
    });

    await withTenant(vp.id, (tx) =>
      tx.insert(membro).values({
        anfitriaoId: vp.id,
        usuarioId: usuario.id,
        perfilId: p.id,
      }),
    );

    console.log(`\nUsuário criado.`);
    console.log(`  nome   ${values.nome}`);
    console.log(`  e-mail ${values.email}`);
    console.log(`  perfil ${p.nome}`);
    if (!values.senha) {
      console.log(`\n  senha  ${senha}`);
      console.log(
        `\n  Anote agora: não é guardada em lugar nenhum em texto claro.`,
      );
    }
    if (p.exigeDoisFatores) {
      console.log(
        `\n  Este perfil exige verificação em dois passos. No primeiro acesso,\n` +
          `  ative-a no painel antes de usar o sistema.`,
      );
    }
  } finally {
    await clienteOwner.end();
    await fecharConexao();
  }
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
