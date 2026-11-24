import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Cria o PRIMEIRO acesso ao painel num banco sem TCP.
 *
 * `npm run usuario:criar` é o caminho normal, e a tela `/painel/usuarios` é o
 * caminho de todo dia. Este script existe para o ovo e a galinha: num banco de
 * produção recém-criado não há ninguém para entrar no painel e usar a tela, e
 * daqui não sai conexão Postgres — a saída de rede é um proxy HTTPS, que por
 * desenho não tunela banco de dados.
 *
 * Escreve as três linhas na mesma requisição, que é uma transação: `user`,
 * `account` e `membro`. Ou a pessoa tem acesso completo, ou não existe. Uma
 * conta sem vínculo entra no login, não entra no painel, e tranca aquele
 * e-mail para sempre, porque o e-mail é único no sistema.
 *
 * O hash da senha é feito pelo próprio Better Auth (`ctx.password.hash`, que é
 * função pura e não toca no banco). Reimplementar o scrypt dele daria uma
 * conta que existe e nunca entra — e o erro só apareceria na primeira
 * tentativa de login, em produção.
 *
 * ## Uso
 *
 *   NODE_USE_ENV_PROXY=1 SUPABASE_PROJECT_REF=<ref> \
 *     npx tsx scripts/usuario-via-api.ts --nome "Nome" --email pessoa@exemplo.com
 */

/** 16 bytes em base64url: 22 caracteres, ditáveis por telefone. */
function senhaSorteada(): string {
  return randomBytes(16).toString("base64url");
}

/** Aspas simples dobradas, para o valor entrar como texto no SQL. */
function texto(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

async function principal() {
  const { values } = parseArgs({
    options: {
      nome: { type: "string" },
      email: { type: "string" },
      perfil: { type: "string", default: "Proprietário" },
    },
  });

  if (!values.nome || !values.email) {
    console.error(
      'Uso: --nome "Nome" --email pessoa@exemplo.com [--perfil Recepção]',
    );
    process.exit(1);
  }

  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!ref) {
    console.error("Defina SUPABASE_PROJECT_REF.");
    process.exit(1);
  }

  const email = values.email.trim().toLowerCase();
  const nome = values.nome.trim();

  const { executorSupabase } = await import("./_executor-sql");
  const ex = executorSupabase(ref);

  const [alvo] = await ex.consultar<{
    anfitriao_id: string;
    perfil_id: string;
    ja_existe: boolean;
  }>(`
    select
      (select id from anfitriao order by criado_em limit 1) as anfitriao_id,
      (select p.id from perfil p where p.nome = ${texto(values.perfil)} limit 1) as perfil_id,
      exists(select 1 from "user" where email = ${texto(email)}) as ja_existe
  `);

  if (!alvo?.anfitriao_id) {
    throw new Error("Não há anfitrião no banco. Rode a semente primeiro.");
  }
  if (!alvo.perfil_id) {
    throw new Error(
      `Perfil "${values.perfil}" não existe. A semente cria Proprietário, ` +
        "Gerente, Recepção, Governança e Financeiro.",
    );
  }
  if (alvo.ja_existe) {
    throw new Error(
      `Já existe conta com o e-mail ${email}. Para trocar a senha dela, use ` +
        "a tela /painel/usuarios.",
    );
  }

  // O hash vem do Better Auth. `$context` monta o adaptador, que constrói o
  // pool do postgres-js sem conectar — então uma DATABASE_URL de forma válida
  // basta, e nenhuma consulta sai daqui.
  //
  // O BETTER_AUTH_SECRET sorteado aqui é descartável, e isso é seguro: o hash
  // de senha do Better Auth é scrypt com SALT EMBUTIDO (formato `salt:hash`),
  // independente do segredo da aplicação. Conferi gerando o hash num processo
  // com um segredo e verificando noutro processo com outro — passou. Se
  // dependesse do segredo, esta senha não serviria em produção, e o erro só
  // apareceria na primeira tentativa de login.
  process.env.DATABASE_URL ??= "postgresql://ninguem@localhost:5432/nada";
  process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64url");
  const { auth } = await import("@/lib/auth");
  const ctx = await auth.$context;

  const senha = senhaSorteada();
  const hash = await ctx.password.hash(senha);
  const usuarioId = ctx.generateId({ model: "user" });
  const contaId = ctx.generateId({ model: "account" });
  if (usuarioId === false || contaId === false) {
    throw new Error("O Better Auth está configurado para o banco gerar ids.");
  }

  // Uma requisição, uma transação. `set role villaperi_owner` porque a API do
  // provedor roda como `postgres`, e `membro` tem FORCE ROW LEVEL SECURITY: só
  // o papel com BYPASSRLS insere a primeira linha, antes de existir contexto
  // de anfitrião para as políticas lerem.
  await ex.rodar(`
    set role villaperi_owner;
    insert into "user" (id, name, email, email_verified)
      values (${texto(usuarioId)}, ${texto(nome)}, ${texto(email)}, false);
    -- updated_at explícito: na tabela account ele é NOT NULL e NÃO tem default
    -- no banco. O Drizzle o preenche sozinho quando o insert passa por ele,
    -- então o serviço do painel funciona; SQL cru não teria essa ajuda e
    -- quebraria com violação de NOT NULL. Conferi na migração 0010 em vez de
    -- supor que as duas tabelas eram iguais: na tabela user ele tem default.
    insert into account (id, user_id, provider_id, account_id, password,
                         created_at, updated_at)
      values (${texto(contaId)}, ${texto(usuarioId)}, 'credential',
              ${texto(usuarioId)}, ${texto(hash)}, now(), now());
    insert into membro (anfitriao_id, usuario_id, perfil_id)
      values (${texto(alvo.anfitriao_id)}, ${texto(usuarioId)},
              ${texto(alvo.perfil_id)});
  `);

  // Confere que as três linhas estão lá e ligadas, em vez de confiar na
  // ausência de erro.
  const [conferencia] = await ex.consultar<{
    tem_usuario: boolean;
    tem_credencial: boolean;
    perfil: string | null;
  }>(`
    select
      exists(select 1 from "user" where id = ${texto(usuarioId)}) as tem_usuario,
      exists(select 1 from account
              where user_id = ${texto(usuarioId)}
                and provider_id = 'credential'
                and password is not null) as tem_credencial,
      (select p.nome from membro m join perfil p on p.id = m.perfil_id
        where m.usuario_id = ${texto(usuarioId)} and m.ativo) as perfil
  `);

  if (
    conferencia?.tem_usuario !== true ||
    conferencia.tem_credencial !== true ||
    conferencia.perfil !== values.perfil
  ) {
    throw new Error(
      `As três linhas não ficaram consistentes: ${JSON.stringify(conferencia)}`,
    );
  }

  console.log(`
Acesso criado e conferido.

  e-mail   ${email}
  perfil   ${conferencia.perfil}
  senha    ${senha}

A senha não é recuperável: o banco guarda só o hash. Troque-a depois do
primeiro acesso, em /painel/usuarios.
`);
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
