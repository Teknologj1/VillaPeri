import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Prepara um banco gerenciado (Supabase, Neon) para receber as migrações.
 *
 * É o equivalente de `scripts/db-local.sh` para produção, e existe pela mesma
 * razão: **o dono das tabelas ignora o RLS**. Se a aplicação conectasse como
 * dono, todas as telas funcionariam e o isolamento por anfitrião simplesmente
 * não existiria — sem erro, sem log.
 *
 *   villaperi_owner   dono das tabelas, BYPASSRLS, só migrações e seed
 *   villaperi_app     a aplicação; não é dono e tem NOBYPASSRLS
 *
 * O BYPASSRLS do owner é necessário porque as tabelas usam FORCE ROW LEVEL
 * SECURITY, que sujeita o próprio dono às políticas: sem ele, nem a primeira
 * linha de `anfitriao` entraria — e é ela que define o contexto que as
 * políticas leem.
 *
 * ## O que este script tem a mais que o db-local.sh
 *
 * **Fecha a API REST do Supabase.** O Supabase publica o schema `public` por
 * HTTP, com os papéis `anon` e `authenticated`, usando uma chave que é
 * pública por desenho. Sem o REVOKE daqui, as reservas, os telefones e os
 * documentos dos hóspedes ficariam legíveis por qualquer um que soubesse a
 * URL do projeto. Nós não usamos o PostREST para nada — a aplicação fala
 * Postgres direto —, então o acesso é retirado inteiro.
 *
 * Não mexe no `service_role`: a chave dele não é pública, e revogá-la quebra
 * o Studio. Ela continua sendo acesso total ao banco; trate-a como senha.
 *
 * ## Uso
 *
 * Precisa de poder criar papéis. Dois caminhos, com o mesmo SQL:
 *
 *   SUPABASE_PROJECT_REF=<ref> npm run db:bootstrap
 *     Vai pela API de consulta do Supabase, que é HTTPS. É o caminho de quem
 *     não tem TCP até o banco — este ambiente, por exemplo, sai por um proxy
 *     HTTPS, que por desenho não tunela banco de dados.
 *     Atrás de um proxy desses, acrescente NODE_USE_ENV_PROXY=1: o `fetch`
 *     embutido do Node ignora HTTPS_PROXY sem essa variável, e a falha vem
 *     como um `fetch failed` sem explicação.
 *
 *   DATABASE_URL_SUPERUSER='postgresql://postgres.<ref>:<senha>@<host>:6543/postgres?sslmode=require' \
 *     npm run db:bootstrap
 *     Conexão direta, com o papel `postgres` do projeto.
 *
 * Idempotente: rodar de novo não quebra nada e não troca senha nenhuma, a
 * menos que você passe `--trocar-senhas`.
 *
 * **Cuidado com `--trocar-senhas`.** No Postgres o papel é do CLUSTER, não do
 * banco: trocar a senha aqui invalida a conexão de TODOS os bancos daquele
 * servidor que usem o mesmo papel. Num provedor gerenciado, onde cada projeto
 * é um cluster, isso não tem consequência; num servidor que hospeda
 * desenvolvimento e produção, tem. Derrubei o meu `.env.local` assim durante o
 * ensaio deste script.
 */

const ESQUEMA = "public";

type Papeis = { owner: string; app: string };

/** 24 bytes em base64url: 32 caracteres, sem `:` `@` `/` que quebrem a URL. */
function senhaForte(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Onde a aplicação vai conectar — que não é por onde este script falou.
 *
 * Pela API do Supabase não há URL de conexão nenhuma na mão, então a do pooler
 * é pedida ao próprio provedor. Inventar o host a partir da região seria
 * chute: o Supabase já mudou esse padrão (`aws-0-` virou `aws-1-` em projetos
 * novos), e um host errado só apareceria no primeiro acesso em produção.
 */
async function enderecoDeConexao(): Promise<{
  host: string;
  banco: string;
  sufixo: string;
}> {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (ref) {
    const resposta = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/config/database/pooler`,
    );
    if (!resposta.ok) {
      throw new Error(
        `Não consegui ler a configuração do pooler (${resposta.status}): ${await resposta.text()}`,
      );
    }
    const lista = (await resposta.json()) as {
      database_type: string;
      db_host: string;
      db_port: number;
      db_name: string;
      db_user: string;
    }[];
    const primario =
      lista.find((p) => p.database_type === "PRIMARY") ?? lista[0];
    if (!primario) throw new Error("O provedor não devolveu pooler nenhum.");
    return {
      host: `${primario.db_host}:${primario.db_port}`,
      banco: `/${primario.db_name}`,
      // No pooler do Supabase o usuário é `<papel>.<ref-do-projeto>`.
      sufixo: `.${ref}`,
    };
  }

  const url = process.env.DATABASE_URL_SUPERUSER!;
  const partes = new URL(url.replace(/^postgresql:/, "http:"));
  const usuarioBase = decodeURIComponent(partes.username);
  return {
    host: partes.host,
    // O nome do banco vem da URL recebida, não fixo em "postgres". No Supabase
    // é sempre `postgres` e por isso o erro passaria batido ali — e entregaria
    // uma conexão apontando para o banco errado em qualquer outro provedor.
    banco: partes.pathname || "/postgres",
    sufixo: usuarioBase.includes(".")
      ? `.${usuarioBase.split(".").slice(1).join(".")}`
      : "",
  };
}

async function principal() {
  const { values } = parseArgs({
    options: {
      "trocar-senhas": { type: "boolean", default: false },
      "senha-owner": { type: "string" },
      "senha-app": { type: "string" },
      saida: { type: "string" },
    },
  });

  const { escolherExecutor } = await import("./_executor-sql");
  const ex = await escolherExecutor();
  console.log(`==> Por ${ex.descricao}`);

  const papeis: Papeis = {
    owner: values["senha-owner"] ?? senhaForte(),
    app: values["senha-app"] ?? senhaForte(),
  };

  try {
    const [papeisExistentes] = await ex.consultar<{
      existe_owner: boolean;
      existe_app: boolean;
    }>(`
      select
        exists(select 1 from pg_roles where rolname = 'villaperi_owner') as existe_owner,
        exists(select 1 from pg_roles where rolname = 'villaperi_app')   as existe_app
    `);
    const existe_owner = papeisExistentes?.existe_owner === true;
    const existe_app = papeisExistentes?.existe_app === true;

    const trocar = values["trocar-senhas"] === true;
    const definirSenhaOwner = !existe_owner || trocar;
    const definirSenhaApp = !existe_app || trocar;

    console.log("==> Papéis");
    if (!existe_owner) {
      await ex.rodar(
        `create role villaperi_owner login password '${papeis.owner}'`,
      );
      console.log("    villaperi_owner criado");
    } else if (trocar) {
      await ex.rodar(
        `alter role villaperi_owner password '${papeis.owner}'`,
      );
      console.log("    villaperi_owner: senha trocada");
    } else {
      console.log("    villaperi_owner já existia (senha preservada)");
    }

    if (!existe_app) {
      await ex.rodar(`create role villaperi_app login password '${papeis.app}'`);
      console.log("    villaperi_app criado");
    } else if (trocar) {
      await ex.rodar(`alter role villaperi_app password '${papeis.app}'`);
      console.log("    villaperi_app: senha trocada");
    } else {
      console.log("    villaperi_app já existia (senha preservada)");
    }

    // Separado do CREATE de propósito: o Postgres 16 aceita conceder BYPASSRLS
    // sem superusuário, mas num ALTER à parte — é o que a documentação do
    // Supabase mostra. Explícito e idempotente: é exatamente isto que separa
    // os dois papéis, e vale repetir a cada execução.
    await ex.rodar(`alter role villaperi_owner bypassrls`);
    await ex.rodar(`alter role villaperi_app nobypassrls`);
    console.log("    BYPASSRLS no owner, NOBYPASSRLS no app");

    // Para a conexão de superusuário poder criar as tabelas COMO o owner, caso
    // as migrações rodem por ela (API de consulta do provedor, por exemplo).
    // Vai na direção segura: `postgres` passa a ser membro de
    // `villaperi_owner`, e não o contrário — o owner não herda nada do
    // Supabase.
    await ex.rodar(`grant villaperi_owner to current_user`);

    console.log("==> Privilégios no schema");
    await ex.rodar(`
      grant usage, create on schema ${ESQUEMA} to villaperi_owner;
      grant usage on schema ${ESQUEMA} to villaperi_app;
      revoke create on schema ${ESQUEMA} from public;
    `);

    // CREATE no BANCO, não só no schema.
    //
    // O migrador do Drizzle começa com `CREATE SCHEMA IF NOT EXISTS "drizzle"`
    // para a tabela de controle. Isso exige CREATE no banco — e exige mesmo
    // quando o schema já existe: o `IF NOT EXISTS` ainda checa a permissão
    // antes de decidir que não há nada a fazer (conferi, esperando o
    // contrário).
    //
    // No desenvolvimento isto nunca aparece, porque `db-local.sh` cria o banco
    // com `createdb -O villaperi_owner` e o dono do banco já tem CREATE. Em
    // provedor gerenciado o banco é de outro, e a primeira migração morre com
    // "permission denied for database". Foi o que o ensaio pegou.
    const nomeDoBanco = (
      await ex.consultar<{ nome: string }>(`select current_database() as nome`)
    )[0]?.nome;
    if (!nomeDoBanco) throw new Error("Não consegui ler o nome do banco.");
    await ex.rodar(
      `grant create, connect on database "${nomeDoBanco}" to villaperi_owner`,
    );
    await ex.rodar(`grant connect on database "${nomeDoBanco}" to villaperi_app`);
    // O app não cria nada, nem schema: o CREATE fica só com o owner.
    await ex.rodar(`create schema if not exists drizzle authorization villaperi_owner`);
    console.log("    owner pode criar o schema de controle do migrador");

    // As tabelas que o owner criar daqui em diante já nascem acessíveis ao app
    // — e só a ele. É o que faz uma migração nova não precisar de GRANT à mão.
    await ex.rodar(`
      alter default privileges for role villaperi_owner in schema ${ESQUEMA}
        grant select, insert, update, delete on tables to villaperi_app;
      alter default privileges for role villaperi_owner in schema ${ESQUEMA}
        grant usage, select on sequences to villaperi_app;
    `);
    console.log("    app lê e escreve; nunca cria");

    console.log("==> Fechando a API REST do provedor");
    // `anon` e `authenticated` são os papéis que o PostgREST do Supabase usa
    // com a chave pública. Nós não usamos o PostgREST; deixar isso aberto
    // publicaria as reservas e os dados dos hóspedes por HTTP.
    //
    // `if exists` porque num Neon ou num Postgres comum esses papéis não
    // existem, e o script tem de servir aos dois.
    const [papelAnon] = await ex.consultar<{ tem_anon: boolean }>(
      `select exists(select 1 from pg_roles where rolname = 'anon') as tem_anon`,
    );
    if (papelAnon?.tem_anon === true) {
      await ex.rodar(`
        revoke all on all tables in schema ${ESQUEMA} from anon, authenticated;
        revoke all on all sequences in schema ${ESQUEMA} from anon, authenticated;
        revoke all on all functions in schema ${ESQUEMA} from anon, authenticated;
        revoke usage on schema ${ESQUEMA} from anon, authenticated;
      `);

      // E DE PUBLIC, que é por onde o acesso realmente vinha.
      //
      // O ACL do schema trazia `=U/pg_database_owner`: grantee vazio é o
      // pseudo-papel PUBLIC, e `U` é USAGE. O `anon` nunca teve concessão
      // direta — ele usava o schema por ser, como todo papel, membro de
      // PUBLIC. Logo o `revoke ... from anon` acima não removia nada, e a
      // conferência pegou: "anon ainda usa o schema", depois de um REVOKE que
      // a API aceitou sem reclamar.
      //
      // É o REVOKE que todo passo a passo de "fechar o RLS no Supabase"
      // esquece. Quem só revoga do anon fica achando que fechou.
      //
      // Não afeta quem tem concessão própria: villaperi_owner (UC),
      // villaperi_app (U), postgres e service_role seguem com o que foi
      // concedido a eles.
      await ex.rodar(`revoke usage on schema ${ESQUEMA} from public`);
      console.log("    anon e authenticated sem acesso ao schema (e PUBLIC também)");
    } else {
      console.log("    provedor sem papéis anon/authenticated: nada a fechar");
    }

    // Confere, em vez de supor. As três condições que o isolamento exige.
    const [conferencia] = await ex.consultar<{
      owner_bypassa: boolean;
      app_bypassa: boolean;
      anon_usa_schema: boolean;
    }>(`
      select
        (select rolbypassrls from pg_roles where rolname = 'villaperi_owner') as owner_bypassa,
        (select rolbypassrls from pg_roles where rolname = 'villaperi_app')   as app_bypassa,
        coalesce(
          -- Com aspas: ESQUEMA é interpolado como TEXTO. Sem elas o Postgres
          -- lê public como nome de coluna e responde 'column public does not
          -- exist' — que foi o que a primeira execução deu, porque a
          -- refatoração tirou o template SQL que parametrizava isto.
          (select has_schema_privilege('anon', '${ESQUEMA}', 'usage')
           where exists(select 1 from pg_roles where rolname = 'anon')),
          false
        ) as anon_usa_schema
    `);

    const [podeCriar] = await ex.consultar<{ cria: boolean }>(
      `select has_database_privilege('villaperi_owner', current_database(), 'create') as cria`,
    );

    const problemas: string[] = [];
    if (podeCriar?.cria !== true) {
      problemas.push(
        "villaperi_owner sem CREATE no banco: `db:migrate` falha no primeiro " +
          "comando, com \"permission denied for database\". Se o provedor não " +
          "deixa conceder, rode as migrações com a conexão que é dona do banco " +
          "— o isolamento continua valendo, porque quem não pode ser dono das " +
          "tabelas é o villaperi_app.",
      );
    }
    if (conferencia?.owner_bypassa !== true) {
      problemas.push("villaperi_owner sem BYPASSRLS: o seed não vai conseguir inserir");
    }
    if (conferencia?.app_bypassa !== false) {
      problemas.push("villaperi_app COM BYPASSRLS: o isolamento por anfitrião não existe");
    }
    if (conferencia?.anon_usa_schema === true) {
      problemas.push("anon ainda usa o schema: as tabelas ficam legíveis pela API do provedor");
    }
    if (problemas.length > 0) {
      throw new Error(`A conferência falhou:\n  - ${problemas.join("\n  - ")}`);
    }

    console.log("\n==> Conferido: owner bypassa, app não, API do provedor fechada.");

    const { host, banco, sufixo } = await enderecoDeConexao();

    const linhas = [
      `DATABASE_URL=postgresql://villaperi_app${sufixo}:${
        definirSenhaApp ? papeis.app : "SENHA_QUE_JA_EXISTIA"
      }@${host}${banco}?sslmode=require`,
      `DATABASE_URL_MIGRATOR=postgresql://villaperi_owner${sufixo}:${
        definirSenhaOwner ? papeis.owner : "SENHA_QUE_JA_EXISTIA"
      }@${host}${banco}?sslmode=require`,
    ];

    // Gravadas em arquivo, e não só impressas: a senha não existe em lugar
    // nenhum antes desta execução e não é recuperável depois. `.env*` está no
    // .gitignore — confira antes de mudar o nome deste arquivo.
    const destino = values.saida ?? ".env.producao";
    await writeFile(destino, `${linhas.join("\n")}\n`, { mode: 0o600 });

    console.log(`
As duas conexões foram gravadas em ${destino} (modo 600, fora do git).
As senhas NÃO são recuperáveis depois: o banco guarda só o hash.

  villaperi_app      ${definirSenhaApp ? "senha nova" : "senha preservada"}
  villaperi_owner    ${definirSenhaOwner ? "senha nova" : "senha preservada"}

Em seguida:  npm run db:migrate  &&  npm run db:seed
`);
  } finally {
    await ex.fechar();
  }
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
