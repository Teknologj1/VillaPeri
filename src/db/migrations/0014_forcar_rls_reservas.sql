-- FORCE ROW LEVEL SECURITY nas tabelas de reservas e notificações.
--
-- Mesmo bloco dinâmico das migrações 0003, 0007 e 0011. Cada lote de tabelas
-- novas precisa do seu, porque migração roda uma vez só — e quem avisa que
-- falta é o teste cobertura-rls.int.test.ts, que apontou estas oito assim que
-- elas entraram: acesso_dado_pessoal, acompanhante, hospede, notificacao,
-- pagamento, reserva, reserva_extra e solicitacao.
--
-- Vale notar o peso disso aqui: `hospede` guarda documento e contato, e
-- `notificacao` guarda o texto de tudo que foi enviado, com telefone e
-- e-mail. São as tabelas mais sensíveis do sistema.

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
