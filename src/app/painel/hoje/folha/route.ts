import { NextResponse } from "next/server";

import { withTenant } from "@/db/tenant";
import { env } from "@/env";
import { formatarNoite, hojeNaPropriedade } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { Folha, nomeDeArquivo } from "@/lib/pdf";
import { formatarTelefone } from "@/lib/telefone";
import { sessaoAtual } from "@/lib/sessao";
import { buscarPropriedade } from "@/modules/anfitriao";
import { podeNoModulo } from "@/modules/autenticacao";
import {
  ROTULO_STATUS,
  type ReservaDaLista,
  type StatusReserva,
  hojeNaCasa,
} from "@/modules/reservas";

/**
 * A folha da portaria, em PDF.
 *
 * Em PDF e não em página para imprimir porque o uso real é mandar no WhatsApp
 * do grupo da casa: um arquivo chega a quem está na portaria sem senha, sem
 * login e sem depender de alguém lembrar de apertar "imprimir".
 *
 * O que entra é o que serve para trabalhar: quem chega, quem sai, quem fica,
 * o telefone, quantas pessoas e o que falta receber na chegada. Documento não
 * entra — o papel circula, fica no balcão, e dado de documento em papel solto
 * é vazamento esperando acontecer. Quem precisa dele abre a ficha, e essa
 * abertura fica registrada.
 */
export async function GET() {
  const sessao = await sessaoAtual();
  if (!sessao) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }
  if (!podeNoModulo(sessao, "reservas", "ver")) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }

  // Quem não vê dado pessoal recebe a folha sem os telefones. A folha existe
  // para a portaria funcionar, e sem telefone ela ainda funciona.
  const verContato = podeNoModulo(sessao, "hospedes", "ver");
  const hoje = hojeNaPropriedade(env.TZ_PROPRIEDADE);

  const { dia, propriedade } = await withTenant(
    sessao.anfitriaoId,
    async (tx) => ({
      dia: await hojeNaCasa(tx, hoje),
      propriedade: await buscarPropriedade(tx),
    }),
  );

  const folha = await Folha.criar(
    `${propriedade.nome} — ${formatarNoite(hoje)}`,
    `Check-in a partir das ${propriedade.checkinPadrao.slice(0, 5)} · ` +
      `check-out até as ${propriedade.checkoutPadrao.slice(0, 5)}`,
  );

  const linhaDe = (r: ReservaDaLista, comSaldo: boolean) => {
    const pessoas = r.adultos + r.criancas;
    const partes = [
      `${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}`,
      `${formatarNoite(r.entrada, false)} a ${formatarNoite(r.saida, false)}`,
      ROTULO_STATUS[r.status as StatusReserva],
    ];
    if (r.horarioChegada) partes.push(`chega às ${r.horarioChegada}`);
    if (verContato && r.hospedeTelefone) {
      partes.push(formatarTelefone(r.hospedeTelefone)!);
    }

    folha.parDeColunas(r.hospedeNome, r.codigo, "destaque");
    folha.texto(partes.join(" · "), "suave");

    if (comSaldo) {
      const falta = r.totalCentavos - r.pagoCentavos;
      folha.texto(
        falta > 0
          ? `A receber no check-in: ${formatarReais(falta)}`
          : "Já quitada.",
        falta > 0 ? "destaque" : "suave",
      );
    }
    folha.espaco(6);
  };

  const grupo = (
    titulo: string,
    reservas: ReservaDaLista[],
    comSaldo = false,
  ) => {
    folha.secao(`${titulo} (${reservas.length})`);
    if (reservas.length === 0) {
      folha.texto("Ninguém.", "suave");
      return;
    }
    for (const r of reservas) linhaDe(r, comSaldo);
  };

  grupo("Chegam hoje", dia.chegadas, true);
  grupo("Saem hoje", dia.saidas);
  grupo("Continuam na casa", dia.naCasa);

  folha.espaco(14);
  folha.texto(
    "Esta folha foi gerada pelo sistema e não substitui a ficha de cada " +
      "reserva. Documento e e-mail do hóspede ficam só no sistema, onde cada " +
      "consulta é registrada.",
    "suave",
  );

  const bytes = await folha.bytes();
  const nome = nomeDeArquivo(`portaria ${propriedade.nome} ${hoje}`);

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}.pdf"`,
      // Nunca em cache: a folha muda a cada pagamento lançado e a cada
      // check-in feito, e uma folha velha manda a portaria cobrar de quem já
      // pagou.
      "Cache-Control": "no-store",
    },
  });
}
