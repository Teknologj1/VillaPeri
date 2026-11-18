CREATE TYPE "public"."ambito_feriado" AS ENUM('nacional', 'estadual', 'municipal', 'evento');--> statement-breakpoint
CREATE TYPE "public"."cobranca_extra" AS ENUM('estadia', 'noite', 'pessoa', 'pessoa_noite');--> statement-breakpoint
CREATE TYPE "public"."nivel_tarifa" AS ENUM('especial', 'feriado', 'temporada', 'padrao');--> statement-breakpoint
CREATE TYPE "public"."tipo_desconto" AS ENUM('percentual', 'valor');--> statement-breakpoint
CREATE TABLE "cupom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"tipo" "tipo_desconto" NOT NULL,
	"valor" integer NOT NULL,
	"vigencia_inicio" date,
	"vigencia_fim" date,
	"minimo_noites" integer,
	"uso_maximo" integer,
	"usos" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cupom" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "desconto_estadia_longa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"tipo_id" uuid,
	"noites_minimas" integer NOT NULL,
	"percentual_pontos_base" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "desconto_estadia_longa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "extra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"tipo_id" uuid,
	"nome" text NOT NULL,
	"descricao" text,
	"valor_centavos" integer NOT NULL,
	"cobranca" "cobranca_extra" NOT NULL,
	"obrigatorio" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extra" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feriado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"data" date NOT NULL,
	"nome" text NOT NULL,
	"ambito" "ambito_feriado" DEFAULT 'nacional' NOT NULL,
	"vale_na_vespera" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feriado" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "politica_cancelamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"faixas" jsonb NOT NULL,
	"para_periodo_especial" boolean DEFAULT false NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "politica_cancelamento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "regra_tarifa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"propriedade_id" uuid,
	"tipo_id" uuid,
	"unidade_id" uuid,
	"nome" text NOT NULL,
	"nivel" "nivel_tarifa" NOT NULL,
	"vigencia_inicio" date,
	"vigencia_fim" date,
	"preco_semana_centavos" integer,
	"preco_fim_de_semana_centavos" integer,
	"preco_fixo_centavos" integer,
	"ajuste_pontos_base" integer,
	"valor_pessoa_extra_centavos" integer,
	"valor_crianca_centavos" integer,
	"aplica_na_vespera" boolean DEFAULT false NOT NULL,
	"prioridade" integer DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "regra_tarifa_escopo_unico" CHECK (num_nonnulls(propriedade_id, tipo_id, unidade_id) = 1),
	CONSTRAINT "regra_tarifa_preco_ou_ajuste" CHECK (not (preco_fixo_centavos is not null and ajuste_pontos_base is not null))
);
--> statement-breakpoint
ALTER TABLE "regra_tarifa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "desconto_estadia_longa" ADD CONSTRAINT "desconto_estadia_longa_tipo_id_tipo_acomodacao_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipo_acomodacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra" ADD CONSTRAINT "extra_tipo_id_tipo_acomodacao_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipo_acomodacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_tarifa" ADD CONSTRAINT "regra_tarifa_propriedade_id_propriedade_id_fk" FOREIGN KEY ("propriedade_id") REFERENCES "public"."propriedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_tarifa" ADD CONSTRAINT "regra_tarifa_tipo_id_tipo_acomodacao_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipo_acomodacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_tarifa" ADD CONSTRAINT "regra_tarifa_unidade_id_unidade_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cupom_codigo_unico" ON "cupom" USING btree ("anfitriao_id","codigo");--> statement-breakpoint
CREATE INDEX "desconto_longa_idx" ON "desconto_estadia_longa" USING btree ("anfitriao_id","noites_minimas");--> statement-breakpoint
CREATE INDEX "extra_anfitriao_idx" ON "extra" USING btree ("anfitriao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feriado_unico" ON "feriado" USING btree ("anfitriao_id","data","nome");--> statement-breakpoint
CREATE INDEX "feriado_data_idx" ON "feriado" USING btree ("anfitriao_id","data");--> statement-breakpoint
CREATE UNIQUE INDEX "politica_nome_unico" ON "politica_cancelamento" USING btree ("anfitriao_id","nome");--> statement-breakpoint
CREATE INDEX "regra_tarifa_busca_idx" ON "regra_tarifa" USING btree ("anfitriao_id","nivel","vigencia_inicio");--> statement-breakpoint
CREATE POLICY "cupom_isolamento" ON "cupom" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "desconto_estadia_longa_isolamento" ON "desconto_estadia_longa" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "extra_isolamento" ON "extra" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "feriado_isolamento" ON "feriado" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "politica_cancelamento_isolamento" ON "politica_cancelamento" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "regra_tarifa_isolamento" ON "regra_tarifa" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);