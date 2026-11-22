-- A fila de notificações passa a suportar mais de um drenador ao mesmo tempo.
--
-- Até agora só a tarefa agendada drenava, uma de cada vez, e o desenho
-- "seleciona pendentes, envia, marca como enviada" bastava. A partir de
-- agora a fila também é drenada logo depois do fato que a origina — o
-- hóspede não pode esperar a próxima passada do cron para receber a
-- confirmação da reserva.
--
-- Com dois drenadores, aquele desenho manda a mesma mensagem duas vezes:
-- ambos selecionam a mesma linha pendente antes de qualquer um marcá-la.
--
-- A solução é RESERVAR a linha numa única instrução atômica, antes de
-- enviar: quem conseguir mudar o status para `enviando` é o dono do envio.
-- `reservada_em` existe para o caso de o drenador morrer no meio — passado o
-- prazo, a linha volta a ser elegível, em vez de ficar presa para sempre.

ALTER TYPE "status_notificacao" ADD VALUE IF NOT EXISTS 'enviando';--> statement-breakpoint

ALTER TABLE "notificacao"
  ADD COLUMN "reservada_em" timestamp with time zone;
