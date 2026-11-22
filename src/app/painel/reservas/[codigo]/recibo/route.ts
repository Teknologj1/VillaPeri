import { NextResponse } from "next/server";

import { withTenant } from "@/db/tenant";
import { env } from "@/env";
import { formatarNoite, formatarPeriodo, hojeNaPropriedade } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { Folha, nomeDeArquivo } from "@/lib/pdf";
import { sessaoAtual } from "@/lib/sessao";
import { buscarAnfitriao, buscarPropriedade } from "@/modules/anfitriao";
import { podeNoModulo } from "@/modules/autenticacao";
import { buscarReservaPorCodigo } from "@/modules/reservas";

const ROTULO_TIPO: Record<string, string> = {
  sinal: "Sinal",
  saldo: "Saldo",
  extra: "Extra",
  reembolso: "Reembolso",
};

const ROTULO_METODO: Record<string, string> = {
  pix: "Pix",
  cartao: "cartão",
  dinheiro: "dinheiro",
  transferencia: "transferência",
  outro: "outro",
};

/**
 * Recibo dos pagamentos de uma reserva, em PDF.
 *
 * Um recibo por RESERVA e não por lançamento: é o que o hóspede pede ("me
 * manda o recibo") e o que a empresa dele aceita para reembolso — um papel
 * com a estadia, o que foi pago, como e quando, e o que ainda falta.
 *
 * Os reembolsos aparecem como linha negativa em vez de sumirem. Um recibo que
 * esconde a devolução conta uma história em que o hóspede pagou mais do que
 * pagou, e é justamente o documento que ele guarda para provar o contrário.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/painel/reservas/[codigo]/recibo">,
) {
  const sessao = await sessaoAtual();
  if (!sessao) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }
  if (!podeNoModulo(sessao, "reservas", "ver")) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }

  const { codigo } = await ctx.params;

  const dados = await withTenant(sessao.anfitriaoId, async (tx) => {
    const ficha = await buscarReservaPorCodigo(tx, codigo);
    if (!ficha) return null;
    return {
      ficha,
      propriedade: await buscarPropriedade(tx),
      conta: await buscarAnfitriao(tx),
    };
  });

  if (!dados) {
    return NextResponse.json({ erro: "reserva não encontrada" }, { status: 404 });
  }

  const { ficha, propriedade, conta } = dados;
  const r = ficha.reserva;

  if (ficha.pagamentos.length === 0) {
    return NextResponse.json(
      { erro: "Esta reserva ainda não tem pagamento lançado." },
      { status: 409 },
    );
  }

  const hoje = hojeNaPropriedade(env.TZ_PROPRIEDADE);
  const falta = r.totalCentavos - ficha.pagoCentavos;

  const folha = await Folha.criar(
    "Recibo",
    `${propriedade.nome} · reserva ${r.codigo} · emitido em ${formatarNoite(hoje)}`,
  );

  folha.secao("Quem recebeu");
  folha.texto(conta.nome);
  if (conta.documento) folha.texto(`CNPJ/CPF ${conta.documento}`, "suave");
  if (propriedade.endereco) {
    folha.texto(
      [propriedade.endereco, propriedade.cidade, propriedade.uf]
        .filter(Boolean)
        .join(" · "),
      "suave",
    );
  }
  if (conta.cadastur) folha.texto(`Cadastur ${conta.cadastur}`, "suave");

  folha.secao("Quem pagou");
  folha.texto(ficha.hospede.nome);
  if (ficha.hospede.documento) {
    folha.texto(`Documento ${ficha.hospede.documento}`, "suave");
  }

  folha.secao("Referente a");
  folha.texto(`Hospedagem em ${propriedade.nome}`);
  folha.texto(formatarPeriodo(r.entrada, r.saida), "suave");
  folha.texto(
    `${r.adultos} ${r.adultos === 1 ? "adulto" : "adultos"}` +
      (r.criancas > 0
        ? ` e ${r.criancas} ${r.criancas === 1 ? "criança" : "crianças"}`
        : ""),
    "suave",
  );

  folha.secao("Pagamentos");
  for (const p of ficha.pagamentos) {
    folha.parDeColunas(
      `${formatarNoite(p.data)} · ${ROTULO_TIPO[p.tipo] ?? p.tipo} em ${
        ROTULO_METODO[p.metodo] ?? p.metodo
      }`,
      formatarReais(p.valorCentavos),
    );
    if (p.observacao) folha.texto(p.observacao, "suave", 12);
  }

  folha.risco();
  folha.parDeColunas("Total recebido", formatarReais(ficha.pagoCentavos), "destaque");
  folha.parDeColunas("Valor da hospedagem", formatarReais(r.totalCentavos), "suave");
  folha.parDeColunas(
    falta > 0 ? "Saldo a pagar" : falta < 0 ? "A devolver" : "Saldo",
    falta === 0 ? "quitado" : formatarReais(Math.abs(falta)),
    "suave",
  );

  folha.espaco(16);
  folha.texto(
    `Recebemos de ${ficha.hospede.nome} a importância de ` +
      `${formatarReais(ficha.pagoCentavos)} referente à hospedagem acima, ` +
      `dando plena quitação do que foi pago até esta data.`,
  );

  folha.assinatura(conta.nome);

  folha.espaco(20);
  folha.texto(
    "Documento gerado eletronicamente pelo sistema de gestão da casa. " +
      "Não é documento fiscal.",
    "suave",
  );

  const bytes = await folha.bytes();
  const nome = nomeDeArquivo(`recibo ${r.codigo} ${propriedade.nome}`);

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}.pdf"`,
      // O recibo muda a cada lançamento: servir uma versão guardada mandaria
      // ao hóspede um papel que não bate com o que ele acabou de pagar.
      "Cache-Control": "no-store",
    },
  });
}
