import { formatarReais } from "@/lib/dinheiro";
import type { Noite } from "@/lib/data";

/**
 * Os textos das mensagens, num lugar só.
 *
 * Em texto puro de propósito: serve igual para e-mail e para WhatsApp, e o
 * WhatsApp não renderiza HTML. Ganha-se também poder ler a mensagem inteira
 * aqui, sem montar a página, na hora de ajustar o tom.
 */

function porExtenso(noite: Noite): string {
  const [ano, mes, dia] = noite.split("-");
  return `${dia}/${mes}/${ano}`;
}

export type DadosDaSolicitacao = {
  codigo: string;
  nome: string;
  entrada: Noite;
  saida: Noite;
  noites: number;
  adultos: number;
  criancas: number;
  totalCotadoCentavos: number | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  nomeDaCasa: string;
};

function pessoas(d: DadosDaSolicitacao): string {
  const partes = [`${d.adultos} ${d.adultos === 1 ? "adulto" : "adultos"}`];
  if (d.criancas > 0) {
    partes.push(`${d.criancas} ${d.criancas === 1 ? "criança" : "crianças"}`);
  }
  return partes.join(" e ");
}

function periodo(d: DadosDaSolicitacao): string {
  return `${porExtenso(d.entrada)} a ${porExtenso(d.saida)} (${d.noites} ${
    d.noites === 1 ? "noite" : "noites"
  })`;
}

/**
 * Para o hóspede: confirma que o pedido chegou, sem prometer a data.
 *
 * O texto evita dizer "reserva" porque a solicitação NÃO segura as noites —
 * dizer que está reservado e depois a data não estar livre é pior que não
 * mandar mensagem nenhuma.
 */
export function solicitacaoParaHospede(d: DadosDaSolicitacao) {
  const valor = d.totalCotadoCentavos
    ? `\nValor consultado no site: ${formatarReais(d.totalCotadoCentavos)}`
    : "";

  return {
    assunto: `Recebemos seu pedido · ${d.nomeDaCasa} · ${d.codigo}`,
    corpo: `Olá, ${d.nome}!

Recebemos seu pedido de reserva na ${d.nomeDaCasa}.

Código: ${d.codigo}
Datas: ${periodo(d)}
Pessoas: ${pessoas(d)}${valor}

Vamos conferir a disponibilidade e retornar em seguida com a confirmação e as
instruções de pagamento. Este pedido ainda não garante as datas — elas só
ficam reservadas depois da nossa confirmação e do sinal.

Qualquer dúvida, é só responder esta mensagem.

${d.nomeDaCasa}`,
  };
}

/** Para o anfitrião: o que precisa para decidir, sem abrir o sistema. */
export function solicitacaoParaAnfitriao(d: DadosDaSolicitacao) {
  const contato = [d.telefone, d.email].filter(Boolean).join(" · ") || "não informado";
  const valor = d.totalCotadoCentavos
    ? `\nCotado no site: ${formatarReais(d.totalCotadoCentavos)}`
    : "";
  const obs = d.observacao ? `\nObservação: ${d.observacao}` : "";

  return {
    assunto: `Novo pedido de reserva · ${d.codigo} · ${porExtenso(d.entrada)}`,
    corpo: `Novo pedido de reserva.

Código: ${d.codigo}
Hóspede: ${d.nome}
Contato: ${contato}
Datas: ${periodo(d)}
Pessoas: ${pessoas(d)}${valor}${obs}

O pedido NÃO segura as noites. Confira a disponibilidade no painel e converta
em pré-reserva para segurar as datas.`,
  };
}

export type DadosDaReserva = {
  codigo: string;
  nomeHospede: string;
  entrada: Noite;
  saida: Noite;
  noites: number;
  totalCentavos: number;
  sinalCentavos: number;
  checkin: string;
  checkout: string;
  nomeDaCasa: string;
};

export function reservaConfirmadaParaHospede(d: DadosDaReserva) {
  const saldo = d.totalCentavos - d.sinalCentavos;
  return {
    assunto: `Reserva confirmada · ${d.nomeDaCasa} · ${d.codigo}`,
    corpo: `Olá, ${d.nomeHospede}!

Sua reserva na ${d.nomeDaCasa} está confirmada.

Código: ${d.codigo}
Entrada: ${porExtenso(d.entrada)} a partir das ${d.checkin}
Saída: ${porExtenso(d.saida)} até as ${d.checkout}
Total: ${formatarReais(d.totalCentavos)}
Sinal pago: ${formatarReais(d.sinalCentavos)}
Saldo no check-in: ${formatarReais(saldo)}

Antes da chegada enviaremos o endereço, as instruções e o link da ficha de
registro de hóspedes, que é obrigatória e pode ser preenchida pelo celular.

Até logo!
${d.nomeDaCasa}`,
  };
}

export function reservaConfirmadaParaAnfitriao(d: DadosDaReserva) {
  return {
    assunto: `Reserva confirmada · ${d.codigo} · ${porExtenso(d.entrada)}`,
    corpo: `Reserva confirmada.

Código: ${d.codigo}
Hóspede: ${d.nomeHospede}
Datas: ${porExtenso(d.entrada)} a ${porExtenso(d.saida)} (${d.noites} ${
      d.noites === 1 ? "noite" : "noites"
    })
Total: ${formatarReais(d.totalCentavos)}
Sinal: ${formatarReais(d.sinalCentavos)}

As noites já estão marcadas no calendário.`,
  };
}

// ---------------------------------------------------------------------------
// Ficha de registro de hóspedes
// ---------------------------------------------------------------------------

export type DadosDaFnrh = {
  nomeHospede: string;
  nomeDaCasa: string;
  entrada: Noite;
  token: string;
};

/**
 * O link da ficha, para o hóspede preencher pelo celular.
 *
 * O endereço é montado a partir de `NEXT_PUBLIC_URL_SITE`. Sem ela, o link
 * sai relativo e não funciona em lugar nenhum — então a função devolve o
 * endereço junto, e quem chama mostra o mesmo texto na tela para a recepção
 * poder copiar e mandar à mão enquanto a variável não existir.
 *
 * A mensagem diz POR QUE a ficha é obrigatória. "Preencha este formulário"
 * sem motivo, vindo por WhatsApp e com um link, é exatamente o formato de um
 * golpe — e o hóspede desconfiar é a reação certa dele.
 */
export function linkDaFnrh(d: DadosDaFnrh) {
  const base = process.env.NEXT_PUBLIC_URL_SITE ?? "";
  const url = `${base.replace(/\/$/, "")}/fnrh/${d.token}`;

  return {
    url,
    assunto: `Ficha de registro · ${d.nomeDaCasa}`,
    corpo: `Olá, ${d.nomeHospede}!

Antes da sua chegada em ${porExtenso(d.entrada)}, precisamos da ficha de
registro de hóspedes. Ela é exigida por lei de todo meio de hospedagem no
Brasil e, desde abril de 2026, é feita em formato digital.

Leva dois minutos e dá para preencher pelo celular:
${url}

Pedimos documento, data de nascimento e cidade de origem — do titular e de
quem vem junto. Nada além disso.

Qualquer dúvida, é só responder esta mensagem.
${d.nomeDaCasa}`,
  };
}
