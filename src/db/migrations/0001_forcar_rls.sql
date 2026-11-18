-- FORCE ROW LEVEL SECURITY em toda tabela de domínio.
--
-- O drizzle-kit emite ENABLE, que aplica as políticas a todo mundo EXCETO o
-- dono da tabela. FORCE sujeita o dono também.
--
-- Hoje isso é redundante, porque `villaperi_owner` tem BYPASSRLS (sem ele,
-- nenhum seed conseguiria inserir a primeira linha de `anfitriao`, que é
-- justamente quem define o contexto que as políticas leem). O atributo
-- BYPASSRLS vence o FORCE.
--
-- Vale mesmo assim: no dia em que alguém revogar o BYPASSRLS do owner, ou
-- apontar a aplicação para a conexão de migração por engano — as duas strings
-- ficam lado a lado no .env —, o FORCE é a única coisa entre esse engano e um
-- anfitrião enxergando os dados de outro. A proteção que de fato pega esse
-- caso é a verificação de boot em src/db/isolamento.ts; esta aqui é a segunda
-- camada, e não custa nada.

ALTER TABLE "anfitriao"       FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assinatura"      FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "idempotencia"    FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "perfil"          FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "permissao"       FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "propriedade"     FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tipo_acomodacao" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "unidade"         FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auditoria"       FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- `plano` fica de fora de propósito: é dado de referência compartilhado entre
-- anfitriões, com política de leitura para todos e escrita só pelo owner.

-- Garante o acesso do papel da aplicação às tabelas recém-criadas, para o caso
-- de o banco de destino não ter ALTER DEFAULT PRIVILEGES configurado (provedor
-- gerenciado, banco restaurado de backup, ambiente novo).
GRANT USAGE ON SCHEMA public TO "villaperi_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "villaperi_app";--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "villaperi_app";
