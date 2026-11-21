-- FORCE ROW LEVEL SECURITY na tabela `membro`, e permissões para as tabelas
-- do Better Auth.
--
-- `membro` tem dono e entra na regra geral: mesmo bloco dinâmico das
-- migrações 0003 e 0007.
--
-- As tabelas do Better Auth (user, session, account, verification,
-- two_factor) ficam DE FORA do isolamento, de propósito. O login precisa
-- encontrar a pessoa pelo e-mail antes de existir qualquer contexto de
-- anfitrião — não há de quem isolar ainda. O isolamento começa em `membro`,
-- que diz de qual anfitrião aquele usuário é e com qual perfil.
--
-- Isso é seguro enquanto nenhuma rota devolver linha dessas tabelas sem antes
-- resolver o membro. O ponto único de entrada é `sessaoAtual()`, em
-- src/lib/sessao.ts, e o teste de cobertura em cobertura-rls.int.test.ts
-- mantém a lista de exceções explícita, para uma tabela nova sem dono não
-- passar despercebida.

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
      AND NOT c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.nome);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.nome);
  END LOOP;
END
$$;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "villaperi_app";--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "villaperi_app";
