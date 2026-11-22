CREATE TYPE "public"."quem_atende" AS ENUM('riia', 'pessoa');--> statement-breakpoint
CREATE TYPE "public"."tema_conhecimento" AS ENUM('politica', 'passeio', 'como_chegar', 'pergunta_frequente', 'a_casa');--> statement-breakpoint
CREATE TABLE "acao_riia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"chave_api_id" uuid,
	"conversa_id" uuid,
	"ferramenta" text NOT NULL,
	"chave_idempotencia" text,
	"parametros" jsonb,
	"resultado" jsonb,
	"status_http" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acao_riia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "base_conhecimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"tema" "tema_conhecimento" NOT NULL,
	"titulo" text NOT NULL,
	"texto" text NOT NULL,
	"idioma" text DEFAULT 'pt-BR' NOT NULL,
	"termos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"publicado" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "base_conhecimento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chave_api" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"prefixo" text NOT NULL,
	"hash" text NOT NULL,
	"escopos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nivel_autonomia" integer DEFAULT 1 NOT NULL,
	"limite_por_minuto" integer DEFAULT 60 NOT NULL,
	"valida_ate" timestamp with time zone,
	"revogada_em" timestamp with time zone,
	"ultimo_uso_em" timestamp with time zone,
	CONSTRAINT "chave_api_nivel_valido" CHECK (nivel_autonomia between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "chave_api" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"telefone" text NOT NULL,
	"nome" text,
	"hospede_id" uuid,
	"reserva_id" uuid,
	"resumo" text,
	"atendida_por" "quem_atende" DEFAULT 'riia' NOT NULL,
	"ultima_mensagem_em" timestamp with time zone,
	"transferida_em" timestamp with time zone,
	"motivo_transferencia" text,
	"assumida_por" text,
	"assumida_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conversa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_saida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"url" text NOT NULL,
	"eventos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"segredo" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ultima_entrega_em" timestamp with time zone,
	"ultimo_erro" text
);
--> statement-breakpoint
ALTER TABLE "webhook_saida" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "acao_riia" ADD CONSTRAINT "acao_riia_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acao_riia" ADD CONSTRAINT "acao_riia_chave_api_id_chave_api_id_fk" FOREIGN KEY ("chave_api_id") REFERENCES "public"."chave_api"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acao_riia" ADD CONSTRAINT "acao_riia_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_conhecimento" ADD CONSTRAINT "base_conhecimento_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chave_api" ADD CONSTRAINT "chave_api_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_hospede_id_hospede_id_fk" FOREIGN KEY ("hospede_id") REFERENCES "public"."hospede"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_reserva_id_reserva_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reserva"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_saida" ADD CONSTRAINT "webhook_saida_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acao_riia_conversa_idx" ON "acao_riia" USING btree ("conversa_id","criado_em");--> statement-breakpoint
CREATE INDEX "acao_riia_ferramenta_idx" ON "acao_riia" USING btree ("anfitriao_id","ferramenta");--> statement-breakpoint
CREATE INDEX "base_conhecimento_tema_idx" ON "base_conhecimento" USING btree ("anfitriao_id","tema");--> statement-breakpoint
CREATE UNIQUE INDEX "base_conhecimento_titulo_unico" ON "base_conhecimento" USING btree ("anfitriao_id","idioma","titulo");--> statement-breakpoint
CREATE UNIQUE INDEX "chave_api_prefixo_unico" ON "chave_api" USING btree ("prefixo");--> statement-breakpoint
CREATE INDEX "chave_api_anfitriao_idx" ON "chave_api" USING btree ("anfitriao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversa_telefone_unica" ON "conversa" USING btree ("anfitriao_id","telefone");--> statement-breakpoint
CREATE INDEX "conversa_transferida_idx" ON "conversa" USING btree ("anfitriao_id","transferida_em");--> statement-breakpoint
CREATE INDEX "webhook_saida_anfitriao_idx" ON "webhook_saida" USING btree ("anfitriao_id");--> statement-breakpoint
CREATE POLICY "acao_riia_isolamento" ON "acao_riia" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "base_conhecimento_isolamento" ON "base_conhecimento" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "chave_api_isolamento" ON "chave_api" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "conversa_isolamento" ON "conversa" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "webhook_saida_isolamento" ON "webhook_saida" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);