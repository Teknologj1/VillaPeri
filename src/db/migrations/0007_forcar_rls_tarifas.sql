-- FORCE ROW LEVEL SECURITY nas tabelas de tarifa.
--
-- Mesmo bloco da migração 0003, de novo. Não é descuido: migração roda uma
-- vez só, então cada lote de tabelas novas precisa do seu. O teste
-- cobertura-rls.int.test.ts é quem avisa que falta — e foi exatamente ele que
-- apontou estas seis (cupom, desconto_estadia_longa, extra, feriado,
-- politica_cancelamento, regra_tarifa) assim que elas entraram.
--
-- Esse é o ciclo pretendido: criar tabelas, o teste falhar nomeando as que
-- ficaram de fora, e esta migração fechar. Vale repetir o bloco em vez de
-- automatizar por gatilho no banco, porque um ALTER TABLE automático e
-- invisível é pior de depurar do que uma migração explícita.

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
