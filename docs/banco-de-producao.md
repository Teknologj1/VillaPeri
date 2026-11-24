# Banco de produção — Supabase

Como o banco de produção da Villa Peri é criado, ligado à aplicação e
conferido. Vale para o Supabase e, com uma ressalva marcada no texto, para
qualquer Postgres gerenciado.

A decisão: **Supabase**, com o pooler em modo transação. Não o Postgres da
Vercel — ele hoje é um Neon revendido, e o Supabase dá acesso de administrador
ao banco, que é o que a nossa arquitetura de papéis exige.

---

## Por que dois papéis, e não um

É a decisão de que tudo aqui depende. **No Postgres, o dono da tabela ignora o
RLS.** Se a aplicação conectasse como dono, todas as telas funcionariam, todos
os testes de negócio passariam, e o isolamento por anfitrião simplesmente não
existiria — sem erro, sem log. Só um anfitrião vendo os dados de outro no dia
em que houvesse um segundo.

| Papel | É dono das tabelas | BYPASSRLS | Quem usa |
|---|---|---|---|
| `villaperi_owner` | sim | **sim** | `db:migrate`, `db:seed`, scripts |
| `villaperi_app` | não | **não** | a aplicação, sempre |

O `BYPASSRLS` do owner é necessário porque as tabelas usam `FORCE ROW LEVEL
SECURITY`, que sujeita o próprio dono às políticas. Sem ele, nem a primeira
linha de `anfitriao` entraria — e é ela que define o contexto que as políticas
leem.

A aplicação se recusa a subir com a conexão errada: `src/db/isolamento.ts`
confere, no boot e no CI, que o papel em uso não tem `BYPASSRLS` e não é dono
de tabela nenhuma. As duas strings ficam lado a lado no `.env`, e trocar uma
pela outra é o erro mais fácil e mais caro do sistema.

---

## O que o Supabase exige que o Postgres local não

Quatro diferenças. As três primeiras quebram o deploy; a quarta é vazamento de
dados.

### 1. `prepare: false`, em toda conexão

O pooler em modo transação (Supavisor) **não suporta prepared statements
nomeados**. Com o padrão da biblioteca (`prepare: true`) tudo funciona contra
o Postgres local e nada conecta em produção.

Era o estado do código: `src/db/client.ts` tinha a opção, e as migrações, o
seed e os três scripts de linha de comando abriam cada um o seu
`postgres(...)` sem ela. Agora há uma fábrica só — `src/db/conectar.ts` — e
`src/db/conectar.test.ts` recusa a sexta cópia.

### 2. `CREATE` no BANCO, não só no schema

O migrador do Drizzle começa com `CREATE SCHEMA IF NOT EXISTS "drizzle"` para
a tabela de controle. Isso exige `CREATE` no banco, e exige **mesmo quando o
schema já existe**: o `IF NOT EXISTS` checa a permissão antes de concluir que
não há nada a fazer.

No desenvolvimento isso nunca aparece, porque `scripts/db-local.sh` cria o
banco com `createdb -O villaperi_owner` e o dono do banco já tem `CREATE`. Em
provedor gerenciado o banco é de outro, e a primeira migração morre com
`permission denied for database`. O `db:bootstrap` concede.

### 3. O usuário do pooler leva o projeto no nome

No pooler compartilhado o usuário é `<papel>.<ref-do-projeto>` — por exemplo
`villaperi_app.abcdefghijklmnop`. O papel sozinho responde `Tenant or user not
found`. Porta **6543**, modo transação.

Vale usar o pooler também para as migrações: a conexão direta
(`db.<ref>.supabase.co`) é só IPv6 nos projetos gratuitos.

### 4. O Supabase publica o schema `public` por HTTP

Esta é a parte que não aparece em nenhum passo a passo. O Supabase expõe as
tabelas do schema `public` pela API REST dele, com os papéis `anon` e
`authenticated`, usando uma chave que é **pública por desenho**. Sem revogar,
as reservas, os telefones e os documentos dos hóspedes ficariam legíveis por
qualquer um que soubesse a URL do projeto.

Nós não usamos o PostgREST para nada — a aplicação fala Postgres direto —,
então o acesso é retirado inteiro.

**E revogar do `anon` não basta.** O ACL do schema trazia
`=U/pg_database_owner`: grantee vazio é o pseudo-papel `PUBLIC`, e `U` é
`USAGE`. O `anon` nunca teve concessão direta — ele usava o schema por ser,
como todo papel, membro de `PUBLIC`. Então um `revoke usage on schema public
from anon` é aceito sem reclamar **e não remove nada**. Quem para aí fica
achando que fechou.

O que fecha é `revoke usage on schema public from public`, e isso não afeta
quem tem concessão própria: `villaperi_owner`, `villaperi_app`, `postgres` e
`service_role` seguem com o que lhes foi concedido.

O `db:bootstrap` faz os dois REVOKEs e **confere** com `has_schema_privilege`.
Foi essa conferência que pegou o primeiro REVOKE inútil.

O papel `service_role` fica como está: a chave dele não é pública e revogá-la
quebra o Studio. **Essa chave é acesso total ao banco; trate-a como senha** —
não a ponha na aplicação, que não precisa dela.

### 5. Daqui não sai conexão de banco — só HTTPS

A saída de rede desta sessão é um proxy HTTPS, e o README dele diz, com todas
as letras, que **banco de dados por TCP não passa**. Confirmado na prática:
qualquer host do Supabase responde `CONNECT tunnel failed, 403`.

Por isso existem os três scripts com sufixo `-via-api` / `-remoto`, que falam
com o banco pela API de consulta do Supabase (`POST
/v1/projects/{ref}/database/query`), que é HTTPS:

| Script | Para quê |
|---|---|
| `npm run db:bootstrap` | papéis e privilégios (também funciona por TCP) |
| `npm run db:migrate:api` | as migrações, com o mesmo registro que o `db:migrate` |
| `scripts/sql-via-api.ts` | um `.sql` qualquer: a semente, uma correção |

Dois detalhes que custaram uma execução cada:

- O `fetch` embutido do Node **ignora `HTTPS_PROXY`**. Sem
  `NODE_USE_ENV_PROXY=1` a falha vem como um `fetch failed` sem explicação.
- O `pg_dump` recente emite metacomandos de psql (`\restrict`,
  `\unrestrict`) em volta do despejo. Mandados ao servidor, dão
  `syntax error at or near "\"`. O `sql-via-api.ts` os filtra.

E um que o registro do migrador obrigou a entender: a API roda como
`postgres`, então tudo é precedido de `set role villaperi_owner`. Sem isso a
tabela de controle nasce do papel errado, e a migração aplica o DDL inteiro e
morre no registro com `permission denied for table __drizzle_migrations`. A
requisição é uma transação, então a migração desfaz inteira — mas repetiria
para sempre.

---

## Passo a passo

### O que você faz (uma vez)

1. Conta no Supabase, se ainda não houver: <https://supabase.com/dashboard>
2. Um token pessoal: **Account → Access Tokens → Generate new token**
   (<https://supabase.com/dashboard/account/tokens>). O valor começa com
   `sbp_`.
3. Um token da Vercel: **Account Settings → Tokens**
   (<https://vercel.com/account/tokens>), escopo da conta onde está o projeto
   `villa-peri`.

Os dois valores vão no formulário seguro de credenciais, nunca no chat e nunca
em variável de ambiente deste repositório.

> **Plano.** O gratuito pausa o projeto depois de uma semana sem acesso — para
> um site de reservas isso significa o site fora do ar sem aviso. Dá para
> começar no gratuito e subir para o Pro depois, sem migrar nada. A decisão é
> sua; o código é o mesmo.

### O que é feito daqui

```
1. POST api.supabase.com/v1/projects          cria o projeto (região sa-east-1)
2. npm run db:bootstrap                        papéis, privilégios, REVOKE do anon
3. npm run db:migrate                          as 21 migrações
4. npm run db:seed                             planos, perfis, a casa, tarifas, feriados
5. npm run usuario:criar                       o acesso master, senha sorteada
6. POST api.vercel.com/v10/projects/.../env    as variáveis, com upsert
7. redeploy                                    e a conferência de ponta a ponta
```

As variáveis que a Vercel recebe:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `villaperi_app.<ref>` pelo pooler, porta 6543 |
| `DATABASE_URL_MIGRATOR` | `villaperi_owner.<ref>` pelo mesmo pooler |
| `BETTER_AUTH_SECRET` | sorteado, 32 bytes |
| `BETTER_AUTH_URL` | `https://villa-peri.vercel.app` |
| `TZ_PROPRIEDADE` | `America/Sao_Paulo` |

`DATABASE_URL_MIGRATOR` na Vercel não é usada pela aplicação — a aplicação
nunca a lê. Fica lá para `db:migrate` rodar de um ambiente que puxe as
variáveis do projeto, em vez de alguém guardar a string num arquivo.

---

## O ensaio

O caminho inteiro foi exercitado contra um banco **que a aplicação não possui
e no qual não pode criar nada** — as mesmas condições do provedor, menos o
pooler:

```
createdb villaperi_ensaio          (dono: postgres, não villaperi_owner)
npm run db:bootstrap
npm run db:migrate
npm run db:seed
npm run test:int                   179 testes, todos passando
```

Foi esse ensaio que achou o `CREATE` faltando no banco, e um defeito meu no
próprio script — a URL impressa fixava `/postgres` como nome do banco em vez
de usar o que foi passado. Nenhum dos dois apareceria antes de produção.

---

## Conferência depois do deploy

Quatro coisas, nesta ordem. Nenhuma delas é "abrir o site e ver se carrega".

1. **A API do Supabase está fechada.** Uma chamada anônima a
   `https://<ref>.supabase.co/rest/v1/reserva?select=*` com a chave publicável
   tem de falhar. Se devolver uma lista, o REVOKE de `PUBLIC` não aconteceu.
2. **O isolamento vale.** Papel `villaperi_app` com `BYPASSRLS` falso e zero
   tabelas próprias, e nenhuma tabela de domínio sem política de RLS.
3. **O login funciona.** Entrar de verdade em `/entrar` com o usuário master.
   Não "a página abriu": a sessão criada e o painel respondendo.
4. **O preço é o mesmo nos três lugares.** Site, simulador e reserva, para as
   mesmas datas. É o primeiro critério do portão da Fase 1A, e com o banco
   novo ele precisa ser refeito.

### Estado em 24/11/2026

Projeto `VillaPeri`, ref `yzkzfncpoeasszgwmoox`, Postgres 17, região
`us-east-2`, pooler `aws-0-us-east-2.pooler.supabase.com:6543` em modo
transação.

| | |
|---|---|
| Papéis e privilégios | feito, conferido pelo `db:bootstrap` |
| 21 migrações | aplicadas, 38 tabelas, todas do `villaperi_owner` |
| Semente | carregada; contagens idênticas à fonte local, tabela por tabela |
| `anon` pela HTTP | **401 `permission denied for schema public`** nas cinco tabelas testadas |
| `villaperi_app` | `BYPASSRLS` falso, zero tabelas próprias |
| Sem política de RLS | 5 tabelas, exatamente as do Better Auth, que são globais por desenho |
| Variáveis na Vercel | pendente |
| Usuário master | pendente |

A região `us-east-2` não foi escolhida por nós — o projeto já existia. Vale
manter: a aplicação roda na Vercel em `us-east`, então as idas e vindas ao
banco (muitas por página) ficam na mesma costa, e só o salto do visitante até
a borda cruza para o Brasil. Trocar a região exigiria recriar o projeto.
