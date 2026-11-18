CREATE TYPE "public"."ciclo_assinatura" AS ENUM('mensal', 'anual');--> statement-breakpoint
CREATE TYPE "public"."modo_preco" AS ENUM('acomodacao', 'ocupacao');--> statement-breakpoint
CREATE TYPE "public"."modulo_sistema" AS ENUM('calendario', 'tarifas', 'reservas', 'hospedes', 'checkin', 'limpeza', 'enxoval', 'despesas', 'relatorios', 'usuarios', 'auditoria');--> statement-breakpoint
CREATE TYPE "public"."nivel_permissao" AS ENUM('nenhum', 'ver', 'lancar', 'editar');--> statement-breakpoint
CREATE TYPE "public"."status_anfitriao" AS ENUM('rascunho', 'em_revisao', 'ativa', 'suspensa');--> statement-breakpoint
CREATE TYPE "public"."status_cobranca" AS ENUM('ativa', 'atrasada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."autor_tipo" AS ENUM('usuario', 'riia', 'sistema');--> statement-breakpoint
CREATE TABLE "anfitriao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"cadastur" text,
	"status" "status_anfitriao" DEFAULT 'rascunho' NOT NULL,
	"conta_recebimento" text
);
--> statement-breakpoint
ALTER TABLE "anfitriao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assinatura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"plano_id" uuid NOT NULL,
	"inicio" date NOT NULL,
	"fim" date,
	"ciclo" "ciclo_assinatura" DEFAULT 'mensal' NOT NULL,
	"status_cobranca" "status_cobranca" DEFAULT 'ativa' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assinatura" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "idempotencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"rota" text NOT NULL,
	"hash_requisicao" text NOT NULL,
	"resposta" jsonb NOT NULL,
	"status_http" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotencia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "perfil" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"sistema" boolean DEFAULT false NOT NULL,
	"desconto_maximo_pontos_base" integer DEFAULT 0 NOT NULL,
	"exige_dois_fatores" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "perfil" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "permissao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"perfil_id" uuid NOT NULL,
	"modulo" "modulo_sistema" NOT NULL,
	"nivel" "nivel_permissao" DEFAULT 'nenhum' NOT NULL,
	"observacao" text
);
--> statement-breakpoint
ALTER TABLE "permissao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plano" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"nome" text NOT NULL,
	"comissao_pontos_base" integer NOT NULL,
	"mensalidade_centavos" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plano" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "propriedade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"endereco" text,
	"cidade" text,
	"uf" text,
	"fuso" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"moeda" text DEFAULT 'BRL' NOT NULL,
	"checkin_padrao" time DEFAULT '14:00' NOT NULL,
	"checkout_padrao" time DEFAULT '12:00' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "propriedade" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tipo_acomodacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"propriedade_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"slug" text NOT NULL,
	"descricao" text,
	"capacidade" integer NOT NULL,
	"modo_preco" "modo_preco" DEFAULT 'acomodacao' NOT NULL,
	"ocupacao_base" integer DEFAULT 2 NOT NULL,
	"idade_crianca" integer DEFAULT 5 NOT NULL,
	"comodidades" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fotos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tipo_acomodacao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "unidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"tipo_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unidade" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"acao" text NOT NULL,
	"valor_antes" jsonb,
	"valor_depois" jsonb,
	"autor_tipo" "autor_tipo" NOT NULL,
	"autor_id" text,
	"conversa_id" uuid,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assinatura" ADD CONSTRAINT "assinatura_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura" ADD CONSTRAINT "assinatura_plano_id_plano_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."plano"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotencia" ADD CONSTRAINT "idempotencia_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil" ADD CONSTRAINT "perfil_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissao" ADD CONSTRAINT "permissao_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissao" ADD CONSTRAINT "permissao_perfil_id_perfil_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfil"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propriedade" ADD CONSTRAINT "propriedade_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_acomodacao" ADD CONSTRAINT "tipo_acomodacao_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_acomodacao" ADD CONSTRAINT "tipo_acomodacao_propriedade_id_propriedade_id_fk" FOREIGN KEY ("propriedade_id") REFERENCES "public"."propriedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidade" ADD CONSTRAINT "unidade_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidade" ADD CONSTRAINT "unidade_tipo_id_tipo_acomodacao_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipo_acomodacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anfitriao_documento_unico" ON "anfitriao" USING btree ("documento");--> statement-breakpoint
CREATE INDEX "assinatura_anfitriao_idx" ON "assinatura" USING btree ("anfitriao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotencia_chave_unica" ON "idempotencia" USING btree ("anfitriao_id","chave");--> statement-breakpoint
CREATE UNIQUE INDEX "perfil_nome_unico" ON "perfil" USING btree ("anfitriao_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "permissao_unica" ON "permissao" USING btree ("perfil_id","modulo");--> statement-breakpoint
CREATE UNIQUE INDEX "plano_nome_unico" ON "plano" USING btree ("nome");--> statement-breakpoint
CREATE INDEX "propriedade_anfitriao_idx" ON "propriedade" USING btree ("anfitriao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tipo_slug_unico" ON "tipo_acomodacao" USING btree ("anfitriao_id","slug");--> statement-breakpoint
CREATE INDEX "tipo_propriedade_idx" ON "tipo_acomodacao" USING btree ("propriedade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unidade_nome_unico" ON "unidade" USING btree ("anfitriao_id","nome");--> statement-breakpoint
CREATE INDEX "unidade_tipo_idx" ON "unidade" USING btree ("tipo_id");--> statement-breakpoint
CREATE INDEX "auditoria_entidade_idx" ON "auditoria" USING btree ("anfitriao_id","entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "auditoria_quando_idx" ON "auditoria" USING btree ("anfitriao_id","quando");--> statement-breakpoint
CREATE POLICY "anfitriao_isolamento" ON "anfitriao" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assinatura_isolamento" ON "assinatura" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "idempotencia_isolamento" ON "idempotencia" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "perfil_isolamento" ON "perfil" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "permissao_isolamento" ON "permissao" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "plano_leitura" ON "plano" AS PERMISSIVE FOR SELECT TO "villaperi_app" USING (true);--> statement-breakpoint
CREATE POLICY "propriedade_isolamento" ON "propriedade" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tipo_acomodacao_isolamento" ON "tipo_acomodacao" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "unidade_isolamento" ON "unidade" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "auditoria_isolamento" ON "auditoria" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);