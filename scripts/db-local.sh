#!/usr/bin/env bash
# Sobe o PostgreSQL local de desenvolvimento e cria os dois papéis do sistema.
#
# Por que dois papéis: o dono das tabelas IGNORA as políticas de RLS no Postgres.
# Se a aplicação conectasse como dono, tudo funcionaria e o isolamento por
# anfitrião simplesmente não existiria — sem erro nenhum. Por isso:
#
#   villaperi_owner  dono das tabelas, usado SÓ pelas migrações (drizzle-kit)
#   villaperi_app    usado pela aplicação; não é dono e tem NOBYPASSRLS
#
# O owner recebe BYPASSRLS porque as tabelas usam FORCE ROW LEVEL SECURITY, que
# sujeita o próprio dono às políticas. Sem BYPASSRLS, nenhuma migração com dados
# e nenhum seed conseguiria inserir — nem a primeira linha de `anfitriao`,
# que é o que cria o contexto que as políticas leem.
#
# Uso:  ./scripts/db-local.sh
set -euo pipefail

DB="${VILLAPERI_DB:-villaperi}"
OWNER="villaperi_owner"
APP="villaperi_app"
OWNER_PW="${VILLAPERI_OWNER_PW:-dev_owner}"
APP_PW="${VILLAPERI_APP_PW:-dev_app}"

psql_postgres() { su postgres -c "psql -v ON_ERROR_STOP=1 -q $*"; }

echo "==> Subindo o cluster PostgreSQL 16"
if ! pg_isready -q 2>/dev/null; then
  pg_ctlcluster 16 main start
  for _ in $(seq 1 30); do pg_isready -q && break; sleep 1; done
fi
pg_isready

echo "==> Criando os papéis"
psql_postgres -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${OWNER}') THEN
    CREATE ROLE ${OWNER} LOGIN PASSWORD '${OWNER_PW}';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP}') THEN
    CREATE ROLE ${APP} LOGIN PASSWORD '${APP_PW}';
  END IF;
  -- Idempotente e explícito: o que separa os dois papéis é exatamente isto.
  ALTER ROLE ${OWNER} BYPASSRLS;
  ALTER ROLE ${APP} NOBYPASSRLS;
END
\$\$;
SQL

echo "==> Criando o banco ${DB}"
if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB}'\"" | grep -q 1; then
  su postgres -c "createdb -O ${OWNER} ${DB}"
fi

echo "==> Concedendo privilégios a ${APP}"
psql_postgres -d "${DB}" <<SQL
ALTER SCHEMA public OWNER TO ${OWNER};
GRANT USAGE ON SCHEMA public TO ${APP};

-- O app nunca cria tabela; só lê e escreve nas que o owner criar.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP};

-- Tabelas que o owner criar daqui em diante já nascem acessíveis ao app.
ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER} IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP};
ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER} IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${APP};
SQL

cat <<EOF

Pronto. Coloque no .env.local:

  DATABASE_URL=postgresql://${APP}:${APP_PW}@localhost:5432/${DB}
  DATABASE_URL_MIGRATOR=postgresql://${OWNER}:${OWNER_PW}@localhost:5432/${DB}

Em seguida:  npm run db:migrate
EOF
