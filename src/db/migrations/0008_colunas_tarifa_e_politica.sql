ALTER TABLE "propriedade" ADD COLUMN "sinal_pontos_base" integer DEFAULT 3000 NOT NULL;--> statement-breakpoint
ALTER TABLE "propriedade" ADD COLUMN "aceita_pets" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tipo_acomodacao" ADD COLUMN "idade_minima_crianca" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "tipo_acomodacao" ADD COLUMN "idade_maxima_crianca" integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE "regra_estadia" ADD COLUMN "somente_em_feriado" boolean DEFAULT false NOT NULL;