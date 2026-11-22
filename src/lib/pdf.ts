import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Montagem de PDF, no mínimo necessário.
 *
 * Existe porque dois documentos saem daqui em papel ou em anexo de WhatsApp —
 * a folha da portaria e o recibo de pagamento — e os dois precisam de texto
 * posicionado, quebra de linha e página nova. Não é um motor de layout: é uma
 * régua com caneta.
 *
 * As fontes são as padrão do PDF (Helvetica), que usam codificação WinAnsi e
 * cobrem o português inteiro: á, ã, ç, ê, õ, ú. Incorporar uma fonte própria
 * acrescentaria megabytes ao pacote para ganhar nada.
 */

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 48;

const TINTA = rgb(0.16, 0.14, 0.13);
const SUAVE = rgb(0.45, 0.42, 0.4);
const VINHO = rgb(0.44, 0.11, 0.18);
const LINHA = rgb(0.85, 0.82, 0.78);

export type Estilo = "titulo" | "secao" | "corpo" | "suave" | "destaque";

const TAMANHO: Record<Estilo, number> = {
  titulo: 20,
  secao: 13,
  corpo: 10.5,
  suave: 9,
  destaque: 10.5,
};

export class Folha {
  private doc!: PDFDocument;
  private regular!: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  private negrito!: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  private pagina!: ReturnType<PDFDocument["addPage"]>;
  private y = 0;

  static async criar(titulo: string, subtitulo?: string): Promise<Folha> {
    const f = new Folha();
    f.doc = await PDFDocument.create();
    f.doc.setTitle(titulo);
    f.regular = await f.doc.embedFont(StandardFonts.Helvetica);
    f.negrito = await f.doc.embedFont(StandardFonts.HelveticaBold);
    f.novaPagina();
    f.texto(titulo, "titulo");
    if (subtitulo) f.texto(subtitulo, "suave");
    f.espaco(6);
    return f;
  }

  private novaPagina() {
    this.pagina = this.doc.addPage([A4.largura, A4.altura]);
    this.y = A4.altura - MARGEM;
  }

  /** Garante espaço vertical; vira a página quando não cabe. */
  private reservar(altura: number) {
    if (this.y - altura < MARGEM) this.novaPagina();
  }

  private fonte(estilo: Estilo) {
    return estilo === "titulo" || estilo === "secao" || estilo === "destaque"
      ? this.negrito
      : this.regular;
  }

  private cor(estilo: Estilo) {
    if (estilo === "suave") return SUAVE;
    if (estilo === "titulo" || estilo === "secao") return VINHO;
    return TINTA;
  }

  /** Largura útil da página, descontadas as margens. */
  get largura(): number {
    return A4.largura - MARGEM * 2;
  }

  espaco(altura = 12) {
    this.y -= altura;
  }

  /**
   * Escreve um parágrafo, quebrando por palavra na largura disponível.
   *
   * A quebra é medida com a própria fonte, não contando caracteres: "Ilhéus"
   * e "WWWWWW" têm o mesmo número de letras e larguras muito diferentes, e
   * contar caracteres cortaria o nome de um hóspede no meio.
   */
  texto(conteudo: string, estilo: Estilo = "corpo", recuo = 0) {
    const tamanho = TAMANHO[estilo];
    const fonte = this.fonte(estilo);
    const alturaLinha = tamanho * 1.45;
    const largura = this.largura - recuo;

    for (const linha of this.quebrar(conteudo, fonte, tamanho, largura)) {
      this.reservar(alturaLinha);
      this.y -= alturaLinha;
      this.pagina.drawText(linha, {
        x: MARGEM + recuo,
        y: this.y,
        size: tamanho,
        font: fonte,
        color: this.cor(estilo),
      });
    }
  }

  /**
   * Duas colunas na mesma linha: rótulo à esquerda, valor à direita.
   * É o formato de toda tabela de valores em recibo.
   */
  parDeColunas(esquerda: string, direita: string, estilo: Estilo = "corpo") {
    const tamanho = TAMANHO[estilo];
    const alturaLinha = tamanho * 1.6;
    this.reservar(alturaLinha);
    this.y -= alturaLinha;

    this.pagina.drawText(esquerda, {
      x: MARGEM,
      y: this.y,
      size: tamanho,
      font: this.regular,
      color: estilo === "suave" ? SUAVE : TINTA,
    });

    const fonte = this.fonte(estilo);
    const l = fonte.widthOfTextAtSize(direita, tamanho);
    this.pagina.drawText(direita, {
      x: A4.largura - MARGEM - l,
      y: this.y,
      size: tamanho,
      font: fonte,
      color: estilo === "suave" ? SUAVE : TINTA,
    });
  }

  /** Um fio horizontal, para separar blocos. */
  risco() {
    this.reservar(14);
    this.y -= 10;
    this.pagina.drawLine({
      start: { x: MARGEM, y: this.y },
      end: { x: A4.largura - MARGEM, y: this.y },
      thickness: 0.7,
      color: LINHA,
    });
    this.y -= 4;
  }

  /** Um título de seção com o fio embaixo. */
  secao(titulo: string) {
    this.espaco(10);
    this.texto(titulo, "secao");
    this.risco();
  }

  /** Espaço para assinar, quando o documento vai a papel. */
  assinatura(rotulo: string) {
    this.espaco(34);
    this.reservar(26);
    this.pagina.drawLine({
      start: { x: MARGEM, y: this.y },
      end: { x: MARGEM + 230, y: this.y },
      thickness: 0.7,
      color: TINTA,
    });
    this.y -= 12;
    this.pagina.drawText(rotulo, {
      x: MARGEM,
      y: this.y,
      size: TAMANHO.suave,
      font: this.regular,
      color: SUAVE,
    });
  }

  async bytes(): Promise<Uint8Array> {
    return this.doc.save();
  }

  private quebrar(
    conteudo: string,
    fonte: { widthOfTextAtSize(t: string, s: number): number },
    tamanho: number,
    largura: number,
  ): string[] {
    const linhas: string[] = [];
    for (const paragrafo of conteudo.split("\n")) {
      let atual = "";
      for (const palavra of paragrafo.split(/\s+/)) {
        const tentativa = atual ? `${atual} ${palavra}` : palavra;
        if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) {
          atual = tentativa;
        } else {
          if (atual) linhas.push(atual);
          atual = palavra;
        }
      }
      linhas.push(atual);
    }
    return linhas;
  }
}

/**
 * Nome de arquivo seguro para o cabeçalho `Content-Disposition`.
 *
 * Acento e espaço no nome quebram o cabeçalho em alguns clientes, e o
 * navegador salva com um nome ilegível. Tira o acento, troca o resto por
 * hífen e deixa o arquivo achável na pasta de downloads.
 */
export function nomeDeArquivo(base: string): string {
  return base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
