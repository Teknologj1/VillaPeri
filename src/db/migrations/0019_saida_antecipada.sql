-- Quanto se devolve das noites não usadas numa saída antecipada.
--
-- A especificação diz que "a cobrança segue a política configurada", sem
-- dizer qual é. O proprietário definiu: cobra-se a estadia inteira.
--
-- O raciocínio é o dele, e é sólido: cancelamento tem PRAZO para reembolso —
-- uma semana de antecedência, salvo força maior. Quem vai embora antes já
-- está hospedado, já pagou, e avisou com zero dias. Devolver aqui seria dar
-- em cima da hora o que a política nega a quem avisa na véspera.
--
-- Fica como coluna, e não como constante no código, por duas razões: é
-- decisão de negócio, que muda sem programador; e feriado pode ter política
-- própria, que a tabela já prevê em `para_periodo_especial`.
--
-- 0 = não devolve nada (o padrão). 10000 = devolve tudo.

ALTER TABLE "politica_cancelamento"
  ADD COLUMN "saida_antecipada_pontos_base" integer DEFAULT 0 NOT NULL;
