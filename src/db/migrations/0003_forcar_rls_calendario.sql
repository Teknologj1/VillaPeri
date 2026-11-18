-- FORCE ROW LEVEL SECURITY em toda tabela que tem dono (coluna anfitriao_id).
--
-- Dinâmico em vez de uma lista à mão: a lista estava certa na migração 0001 e
-- já ficou incompleta na migração seguinte, quando entraram noite_ocupada,
-- bloqueio e regra_estadia. Escrito assim, a migração acerta as tabelas que
-- existirem quando ela rodar.
--
-- Isso ainda não resolve as tabelas de AMANHÃ, porque migração roda uma vez
-- só. Quem resolve é o teste em src/db/cobertura-rls.int.test.ts, que falha o
-- CI se alguma tabela com anfitriao_id subir sem RLS, sem FORCE ou sem
-- política. Esta migração conserta o presente; o teste protege o futuro.

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname AS nome
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'anfitriao_id'
          AND NOT a.attisdropped
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.nome);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.nome);
  END LOOP;
END
$$;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "villaperi_app";--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "villaperi_app";
