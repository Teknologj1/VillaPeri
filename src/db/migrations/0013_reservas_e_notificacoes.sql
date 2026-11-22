CREATE TYPE "public"."canal_reserva" AS ENUM('site', 'riia', 'whatsapp', 'instagram', 'indicacao', 'balcao', 'airbnb', 'marketplace');--> statement-breakpoint
CREATE TYPE "public"."metodo_pagamento" AS ENUM('pix', 'cartao', 'dinheiro', 'transferencia', 'outro');--> statement-breakpoint
CREATE TYPE "public"."status_fnrh" AS ENUM('nao_enviada', 'link_enviado', 'preenchida', 'conferida');--> statement-breakpoint
CREATE TYPE "public"."status_reserva" AS ENUM('pre_reserva', 'aguardando_aprovacao', 'confirmada', 'hospedado', 'concluida', 'cancelada', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."status_solicitacao" AS ENUM('nova', 'respondida', 'convertida', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."tipo_pagamento" AS ENUM('sinal', 'saldo', 'extra', 'reembolso');--> statement-breakpoint
CREATE TYPE "public"."canal_notificacao" AS ENUM('email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."destinatario_notificacao" AS ENUM('hospede', 'anfitriao');--> statement-breakpoint
CREATE TYPE "public"."status_notificacao" AS ENUM('pendente', 'enviada', 'falhou');--> statement-breakpoint
CREATE TABLE "acesso_dado_pessoal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"hospede_id" uuid NOT NULL,
	"usuario_id" text,
	"motivo" text,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acesso_dado_pessoal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "acompanhante" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"reserva_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"nascimento" date
);
--> statement-breakpoint
ALTER TABLE "acompanhante" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hospede" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"nascimento" date,
	"nacionalidade" text DEFAULT 'Brasileira',
	"telefone" text,
	"email" text,
	"cidade" text,
	"uf" text,
	"motivo_viagem" text,
	"preferencias" text,
	"notas_internas" text,
	"aceite_lgpd" boolean DEFAULT false NOT NULL,
	"aceite_lgpd_em" timestamp with time zone,
	"recorrente" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hospede" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pagamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"reserva_id" uuid NOT NULL,
	"tipo" "tipo_pagamento" NOT NULL,
	"valor_centavos" integer NOT NULL,
	"metodo" "metodo_pagamento" NOT NULL,
	"data" date NOT NULL,
	"comprovante" text,
	"observacao" text
);
--> statement-breakpoint
ALTER TABLE "pagamento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reserva" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"unidade_id" uuid NOT NULL,
	"tipo_id" uuid NOT NULL,
	"entrada" date NOT NULL,
	"saida" date NOT NULL,
	"status" "status_reserva" DEFAULT 'pre_reserva' NOT NULL,
	"canal" "canal_reserva" DEFAULT 'balcao' NOT NULL,
	"hospede_id" uuid NOT NULL,
	"adultos" integer DEFAULT 2 NOT NULL,
	"criancas" integer DEFAULT 0 NOT NULL,
	"orcamento" jsonb NOT NULL,
	"total_centavos" integer NOT NULL,
	"sinal_centavos" integer DEFAULT 0 NOT NULL,
	"desconto_pontos_base" integer DEFAULT 0 NOT NULL,
	"aprovado_por" text,
	"aprovado_em" timestamp with time zone,
	"politica_cancelamento_id" uuid,
	"fnrh_status" "status_fnrh" DEFAULT 'nao_enviada' NOT NULL,
	"fnrh_token" text,
	"fnrh_expira_em" timestamp with time zone,
	"horario_chegada" text,
	"observacoes" text,
	"solicitacao_id" uuid,
	"expira_em" timestamp with time zone,
	"cancelada_em" timestamp with time zone,
	"motivo_cancelamento" text,
	CONSTRAINT "reserva_periodo_valido" CHECK (saida > entrada)
);
--> statement-breakpoint
ALTER TABLE "reserva" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reserva_extra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"reserva_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"valor_centavos" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reserva_extra" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "solicitacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"email" text,
	"tipo_id" uuid,
	"entrada" date NOT NULL,
	"saida" date NOT NULL,
	"adultos" integer DEFAULT 2 NOT NULL,
	"criancas" integer DEFAULT 0 NOT NULL,
	"total_cotado_centavos" integer,
	"origem" "canal_reserva" DEFAULT 'site' NOT NULL,
	"status" "status_solicitacao" DEFAULT 'nova' NOT NULL,
	"observacao" text,
	CONSTRAINT "solicitacao_periodo_valido" CHECK (saida > entrada)
);
--> statement-breakpoint
ALTER TABLE "solicitacao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"anfitriao_id" uuid NOT NULL,
	"canal" "canal_notificacao" NOT NULL,
	"para_quem" "destinatario_notificacao" NOT NULL,
	"destinatario" text NOT NULL,
	"nome_destinatario" text,
	"assunto" text,
	"corpo" text NOT NULL,
	"evento" text NOT NULL,
	"referencia_tipo" text NOT NULL,
	"referencia_id" uuid NOT NULL,
	"status" "status_notificacao" DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"enviada_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notificacao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "propriedade" ADD COLUMN "email_contato" text;--> statement-breakpoint
ALTER TABLE "propriedade" ADD COLUMN "whatsapp_contato" text;--> statement-breakpoint
ALTER TABLE "acesso_dado_pessoal" ADD CONSTRAINT "acesso_dado_pessoal_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acesso_dado_pessoal" ADD CONSTRAINT "acesso_dado_pessoal_hospede_id_hospede_id_fk" FOREIGN KEY ("hospede_id") REFERENCES "public"."hospede"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acompanhante" ADD CONSTRAINT "acompanhante_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acompanhante" ADD CONSTRAINT "acompanhante_reserva_id_reserva_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reserva"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospede" ADD CONSTRAINT "hospede_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_reserva_id_reserva_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reserva"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_unidade_id_unidade_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_tipo_id_tipo_acomodacao_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipo_acomodacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_hospede_id_hospede_id_fk" FOREIGN KEY ("hospede_id") REFERENCES "public"."hospede"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_politica_cancelamento_id_politica_cancelamento_id_fk" FOREIGN KEY ("politica_cancelamento_id") REFERENCES "public"."politica_cancelamento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_solicitacao_id_solicitacao_id_fk" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."solicitacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserva_extra" ADD CONSTRAINT "reserva_extra_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserva_extra" ADD CONSTRAINT "reserva_extra_reserva_id_reserva_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reserva"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacao" ADD CONSTRAINT "solicitacao_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacao" ADD CONSTRAINT "solicitacao_tipo_id_tipo_acomodacao_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipo_acomodacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_anfitriao_id_anfitriao_id_fk" FOREIGN KEY ("anfitriao_id") REFERENCES "public"."anfitriao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acesso_hospede_idx" ON "acesso_dado_pessoal" USING btree ("anfitriao_id","hospede_id");--> statement-breakpoint
CREATE INDEX "acompanhante_reserva_idx" ON "acompanhante" USING btree ("reserva_id");--> statement-breakpoint
CREATE INDEX "hospede_nome_idx" ON "hospede" USING btree ("anfitriao_id","nome");--> statement-breakpoint
CREATE INDEX "hospede_documento_idx" ON "hospede" USING btree ("anfitriao_id","documento");--> statement-breakpoint
CREATE INDEX "hospede_telefone_idx" ON "hospede" USING btree ("anfitriao_id","telefone");--> statement-breakpoint
CREATE INDEX "pagamento_reserva_idx" ON "pagamento" USING btree ("reserva_id");--> statement-breakpoint
CREATE INDEX "pagamento_data_idx" ON "pagamento" USING btree ("anfitriao_id","data");--> statement-breakpoint
CREATE UNIQUE INDEX "reserva_codigo_unico" ON "reserva" USING btree ("anfitriao_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "reserva_fnrh_token" ON "reserva" USING btree ("fnrh_token");--> statement-breakpoint
CREATE INDEX "reserva_periodo_idx" ON "reserva" USING btree ("anfitriao_id","entrada","saida");--> statement-breakpoint
CREATE INDEX "reserva_status_idx" ON "reserva" USING btree ("anfitriao_id","status");--> statement-breakpoint
CREATE INDEX "reserva_hospede_idx" ON "reserva" USING btree ("hospede_id");--> statement-breakpoint
CREATE INDEX "reserva_extra_idx" ON "reserva_extra" USING btree ("reserva_id");--> statement-breakpoint
CREATE UNIQUE INDEX "solicitacao_codigo_unico" ON "solicitacao" USING btree ("anfitriao_id","codigo");--> statement-breakpoint
CREATE INDEX "solicitacao_status_idx" ON "solicitacao" USING btree ("anfitriao_id","status");--> statement-breakpoint
CREATE INDEX "notificacao_fila_idx" ON "notificacao" USING btree ("anfitriao_id","status","criado_em");--> statement-breakpoint
CREATE INDEX "notificacao_referencia_idx" ON "notificacao" USING btree ("referencia_tipo","referencia_id");--> statement-breakpoint
CREATE POLICY "acesso_dado_pessoal_isolamento" ON "acesso_dado_pessoal" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "acompanhante_isolamento" ON "acompanhante" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hospede_isolamento" ON "hospede" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "pagamento_isolamento" ON "pagamento" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "reserva_isolamento" ON "reserva" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "reserva_extra_isolamento" ON "reserva_extra" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "solicitacao_isolamento" ON "solicitacao" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "notificacao_isolamento" ON "notificacao" AS PERMISSIVE FOR ALL TO "villaperi_app" USING (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid) WITH CHECK (anfitriao_id = nullif(current_setting('app.anfitriao_id', true), '')::uuid);