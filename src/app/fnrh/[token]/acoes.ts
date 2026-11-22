"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { withTenant } from "@/db/tenant";
import { anfitriaoPorTokenFnrh } from "@/lib/anfitriao-publico";
import { comoNoite } from "@/lib/data";
import { preencherFnrh } from "@/modules/reservas";

export type EstadoDaFnrh = { erro: string } | null;

/** Até quantos acompanhantes o formulário aceita. */
const MAXIMO_ACOMPANHANTES = 14;

const UF = /^[A-Za-z]{2}$/;

const esquema = z.object({
  documento: z
    .string()
    .trim()
    .min(5, "Informe o número do documento.")
    .max(30),
  nascimento: z.string().min(1, "Informe a data de nascimento."),
  nacionalidade: z.string().trim().min(2).max(60),
  cidade: z.string().trim().min(2, "Informe a cidade onde mora.").max(80),
  uf: z
    .string()
    .trim()
    .refine((v) => UF.test(v), "O estado tem duas letras: GO, SP, MG…"),
  motivoViagem: z.string().trim().max(120).optional(),
});

/**
 * Grava a ficha preenchida pelo hóspede.
 *
 * Sem sessão: quem chega aqui tem um link e mais nada. A autorização é o
 * token, revalidado no serviço na hora de gravar — e não só quando a página
 * foi exibida, porque entre abrir o formulário e enviá-lo a reserva pode ter
 * sido cancelada e o prazo pode ter vencido.
 */
export async function enviarFnrh(
  _estado: EstadoDaFnrh,
  dados: FormData,
): Promise<EstadoDaFnrh> {
  const token = String(dados.get("token") ?? "");
  if (!token) return { erro: "Link inválido." };

  const analise = esquema.safeParse(Object.fromEntries(dados));
  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? "Confira os dados." };
  }
  const d = analise.data;

  let nascimento: string;
  try {
    nascimento = comoNoite(d.nascimento);
  } catch {
    return { erro: "Data de nascimento inválida." };
  }
  if (nascimento >= new Date().toISOString().slice(0, 10)) {
    return { erro: "A data de nascimento tem de estar no passado." };
  }

  // Os acompanhantes vêm como listas paralelas de campos repetidos. Juntar
  // por índice é o que o navegador entrega sem JavaScript — e a ficha precisa
  // funcionar no celular de quem está com sinal ruim na estrada.
  const nomes = dados.getAll("acompanhante_nome").map(String);
  const documentos = dados.getAll("acompanhante_documento").map(String);
  const nascimentos = dados.getAll("acompanhante_nascimento").map(String);

  const acompanhantes = nomes
    .slice(0, MAXIMO_ACOMPANHANTES)
    .map((nome, i) => ({
      nome,
      documento: documentos[i] ?? null,
      nascimento: nascimentos[i] || null,
    }))
    .filter((a) => a.nome.trim().length > 1);

  for (const a of acompanhantes) {
    if (a.nascimento) {
      try {
        comoNoite(a.nascimento);
      } catch {
        return { erro: `Data de nascimento inválida para ${a.nome}.` };
      }
    }
  }

  const anfitriaoId = await anfitriaoPorTokenFnrh(token);
  if (!anfitriaoId) {
    return {
      erro:
        "Este link não vale mais. Fale com a gente no WhatsApp para receber outro.",
    };
  }

  const resultado = await withTenant(anfitriaoId, (tx) =>
    preencherFnrh(tx, anfitriaoId, token, {
      documento: d.documento,
      nascimento,
      nacionalidade: d.nacionalidade,
      cidade: d.cidade,
      uf: d.uf,
      motivoViagem: d.motivoViagem,
      acompanhantes,
    }),
  );

  if (!resultado) {
    return {
      erro:
        "Este link não vale mais. Fale com a gente no WhatsApp para receber outro.",
    };
  }

  redirect("/fnrh/pronto");
}
