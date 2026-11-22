import { z } from "zod";

/**
 * Os contratos de entrada de cada ferramenta.
 *
 * Uma fonte só: a rota valida com eles e o OpenAPI é gerado deles
 * (`z.toJSONSchema`). Documentação e código não divergem porque são a mesma
 * coisa escrita uma vez — uma especificação escrita à mão fica velha na
 * primeira mudança que alguém esquece de copiar.
 */

const noite = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "A data tem o formato AAAA-MM-DD.")
  .describe("Data da noite, AAAA-MM-DD");

const telefone = z
  .string()
  .trim()
  .min(10, "Telefone muito curto.")
  .max(20)
  .describe("Telefone do hóspede no WhatsApp, com código do país");

export const periodo = z
  .object({
    entrada: noite,
    saida: noite,
    adultos: z.coerce.number().int().min(1).max(30).default(2),
    criancas: z.coerce
      .number()
      .int()
      .min(0)
      .max(30)
      .default(0)
      .describe("Crianças que pagam meia (5 a 9 anos)"),
    telefone: telefone.optional(),
    nome: z.string().trim().max(120).optional(),
  })
  .refine((d) => d.saida > d.entrada, {
    message: "A saída tem de ser depois da entrada.",
    path: ["saida"],
  });

export const sugestao = z
  .object({
    entrada: noite.describe("Data de referência para procurar perto"),
    noites: z.coerce.number().int().min(1).max(30).default(2),
    adultos: z.coerce.number().int().min(1).max(30).default(2),
    criancas: z.coerce.number().int().min(0).max(30).default(0),
    janelaDias: z.coerce
      .number()
      .int()
      .min(1)
      .max(60)
      .default(21)
      .describe("Quantos dias procurar para frente e para trás"),
    telefone: telefone.optional(),
  })
  .describe("Procura datas próximas que cabem nas regras");

export const semParametros = z.object({}).describe("Não recebe parâmetros");

export const buscaNaBase = z.object({
  busca: z.string().trim().max(120).optional(),
  tema: z
    .enum(["politica", "passeio", "como_chegar", "pergunta_frequente", "a_casa"])
    .optional(),
});

export const preReserva = z
  .object({
    entrada: noite,
    saida: noite,
    adultos: z.coerce.number().int().min(1).max(30),
    criancas: z.coerce.number().int().min(0).max(30).default(0),
    nome: z.string().trim().min(2, "Informe o nome do hóspede.").max(120),
    telefone,
    email: z.union([z.email(), z.literal("")]).optional(),
    observacao: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.saida > d.entrada, {
    message: "A saída tem de ser depois da entrada.",
    path: ["saida"],
  });

export const consultaDeReserva = z.object({
  codigo: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .describe("Código da reserva, como R-4K7P"),
  telefone: telefone.describe(
    "Telefone de quem está perguntando. Só responde ao titular.",
  ),
});

export const pedidoDeCancelamento = consultaDeReserva.extend({
  motivo: z.string().trim().max(500).optional(),
});

export const transferencia = z.object({
  telefone,
  nome: z.string().trim().max(120).optional(),
  motivo: z
    .string()
    .trim()
    .min(3, "Diga por que está transferindo.")
    .max(300),
  resumo: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .describe("Resumo da conversa, para a recepção assumir sem reler tudo"),
});
