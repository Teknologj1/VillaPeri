import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    // Fronteira de módulo, imposta por lint e não por disciplina.
    //
    // A especificação define: "Cada módulo tem suas tabelas e seu serviço; os
    // módulos conversam por serviços e eventos internos, nunca lendo a tabela
    // do vizinho." Em código isso quer dizer que `@/modules/reservas/schema`
    // é proibido de fora do módulo; só `@/modules/reservas` (o índice) vale.
    //
    // Dentro do próprio módulo usa-se import relativo ("./repo"), que esta
    // regra não alcança — de propósito.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*"],
              message:
                "Importe o índice do módulo (@/modules/x), nunca um arquivo interno dele. Precisa de algo que o índice não exporta? Exporte pelo serviço.",
            },
            {
              group: ["@/db/client"],
              message:
                "Não use `db` direto: todo acesso passa por withTenant() (@/db/tenant), que define o contexto do anfitrião que o RLS lê.",
            },
          ],
        },
      ],
    },
  },

  {
    // O próprio withTenant precisa do cliente, e as migrações/seed rodam com o
    // papel de owner, fora do contexto de anfitrião.
    files: ["src/db/**/*.ts", "scripts/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    // Um schema pode referenciar o schema de outro módulo, porque é assim que
    // se declara chave estrangeira — `noite_ocupada.unidade_id` tem de apontar
    // para `unidade` de verdade, não para um uuid solto.
    //
    // Isso não afrouxa a fronteira: o que ela impede é código de negócio ler a
    // tabela do vizinho em vez de perguntar ao serviço dele. Integridade
    // referencial é do banco, não do módulo.
    files: ["src/modules/*/schema*.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    // O Better Auth precisa do cliente cru, sem contexto de anfitrião: as
    // tabelas dele são globais e o login acontece antes de existir anfitrião
    // para definir. É a única porta legítima — veja a explicação no arquivo.
    files: ["src/lib/auth.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    // O site público não tem sessão, logo não há anfitrião para definir: é
    // justamente este arquivo que descobre qual é. Ele não lê tabela nenhuma
    // — chama a função `anfitriao_publico()`, que devolve só id e nome das
    // contas ativas (migração 0015).
    files: ["src/lib/anfitriao-publico.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    // Testes de integração montam cenário por fora do caminho normal: criam
    // dois anfitriões com a conexão de owner para depois provar, pela conexão
    // da aplicação, que um não enxerga o outro. Precisam alcançar as tabelas
    // e o cliente direto — é justamente esse acesso privilegiado que torna a
    // prova válida.
    //
    // A exceção é estreita de propósito: só `*.int.test.ts`, nunca código de
    // produção nem teste de unidade.
    files: ["src/**/*.int.test.ts", "tests/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
