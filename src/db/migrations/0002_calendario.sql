CREATE TYPE "public"."motivo_bloqueio" AS ENUM('reforma', 'uso_proprietario', 'fechamento', 'evento_privado', 'outro');--> statement-breakpoint
CREATE TYPE "public"."origem_bloqueio" AS ENUM('manual', 'canal');--> statement-breakpoint
CREATE TYPE "public"."origem_noite" AS ENUM('reserva', 'bloqueio', 'limpeza', 'canal');--> statement-breakpoint
CREATE TABLE "bloqueio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"propriedade_id" uuid,
	"tipo_id" uuid,
	"unidade_id" uuid,
	"primeira_noite" date NOT NULL,
	"ultima_noite" date NOT NULL,
	"motivo" "motivo_bloqueio" NOT NULL,
	"observacao" text,
	"repeticao" jsonb,
	"origem" "origem_bloqueio" DEFAULT 'manual' NOT NULL,
	"id_externo" text,
	CONSTRAINT "bloqueio_escopo_unico" CHECK (num_nonnulls(propriedade_id, tipo_id, unidade_id) = 1),
	CONSTRAINT "bloqueio_periodo_valido" CHECK (ultima_noite >= primeira_noite)
);
--> statement-breakpoint
ALTER TABLE "bloqueio" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "noite_ocupada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"unidade_id" uuid NOT NULL,
	"noite" date NOT NULL,
	"origem" "origem_noite" NOT NULL,
	"origem_id" uuid NOT NULL,
	"preco_centavos" integer,
	"regra_tarifa_id" uuid,
	CONSTRAINT "noite_ocupada_preco_so_de_reserva" CHECK ((origem = 'reserva') or (preco_centavos is null))
);
--> statement-breakpoint
ALTER TABLE "noite_ocupada" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "regra_estadia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"propriedade_id" uuid,
	"tipo_id" uuid,
	"unidade_id" uuid,
	"nome" text NOT NULL,
	"vigencia_inicio" date,
	"vigencia_fim" date,
	"dias_da_semana" jsonb,
	"minimo_diarias" integer,
	"maximo_diarias" integer,
	"dias_de_entrada" jsonb,
	"antecedencia_minima_horas" integer,
	"janela_maxima_dias" integer,
	"intervalo_limpeza_noites" integer,
	"lacuna_curta_permitida" boolean,
	"prioridade" integer DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "regra_estadia_escopo_unico" CHECK (num_nonnulls(propriedade_id, tipo_id, unidade_id) = 1),
	CONSTRAINT "regra_estadia_vigencia_valida" CHECK (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio)
);
--> statement-breakpoint
ALTER TABLE "regra_estadia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bloqueio" ADD CONSTRAINT "bloqueio_propriedade_id_propriedade_id_fk" FOREIGN KEY ("propriedade_id") REFERENCES "public"."propriedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueio" ADD CONSTRAINT "bloqueio_tipo_id_tipo_acomodacao_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipo_acomodacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueio" ADD CONSTRAINT "bloqueio_unidade_id_unidade_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noite_ocupada" ADD CONSTRAINT "noite_ocupada_unidade_id_unidade_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_estadia" ADD CONSTRAINT "regra_estadia_propriedade_id_propriedade_id_fk" FOREIGN KEY ("propriedade_id") REFERENCES "public"."propriedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_estadia" ADD CONSTRAINT "regra_estadia_tipo_id_tipo_acomodacao_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipo_acomodacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_estadia" ADD CONSTRAINT "regra_estadia_unidade_id_unidade_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloqueio_periodo_idx" ON "bloqueio" USING btree ("anfitriao_id","primeira_noite","ultima_noite");--> statement-breakpoint
CREATE UNIQUE INDEX "noite_ocupada_unidade_noite" ON "noite_ocupada" USING btree ("unidade_id","noite");--> statement-breakpoint
CREATE INDEX "noite_ocupada_origem_idx" ON "noite_ocupada" USING btree ("origem","origem_id");--> statement-breakpoint
CREATE INDEX "noite_ocupada_busca_idx" ON "noite_ocupada" USING btree ("anfitriao_id","noite");--> statement-breakpoint
CREATE INDEX "regra_estadia_busca_idx" ON "regra_estadia" USING btree ("anfitriao_id","vigencia_inicio");--> statement-breakpoint
CREATE POLICY "bloqueio_isolamento" ON "bloqueio" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "noite_ocupada_isolamento" ON "noite_ocupada" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "regra_estadia_isolamento" ON "regra_estadia" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);