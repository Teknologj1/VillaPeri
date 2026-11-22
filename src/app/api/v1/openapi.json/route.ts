import { NextResponse } from "next/server";
import { z } from "zod";

import { FERRAMENTAS, NIVEIS, TODAS_AS_FERRAMENTAS } from "@/modules/riia";

import {
  buscaNaBase,
  consultaDeReserva,
  pedidoDeCancelamento,
  periodo,
  preReserva,
  sugestao,
  transferencia,
} from "../_esquemas";

/**
 * A especificação OpenAPI, gerada dos MESMOS esquemas Zod que as rotas usam
 * para validar.
 *
 * Não há um arquivo de documentação escrito à mão em lugar nenhum. Uma
 * especificação separada fica velha na primeira mudança que alguém esquece
 * de copiar — e a RIIA, que lê esta especificação para saber chamar as
 * ferramentas, passaria a mandar um corpo que a rota recusa.
 *
 * A rota é aberta: a especificação descreve o formato, não os dados, e uma
 * API cuja documentação é segredo é uma API que ninguém integra direito. O
 * que protege é a chave, não a obscuridade.
 */

type Caminho = {
  rota: string;
  metodo: "get" | "post";
  ferramenta: keyof typeof FERRAMENTAS;
  esquema: z.ZodType;
  parametrosDeUrl?: string[];
  idempotente?: boolean;
  status?: number;
};

const CAMINHOS: Caminho[] = [
  {
    rota: "/api/v1/disponibilidade",
    metodo: "post",
    ferramenta: "buscar_disponibilidade",
    esquema: periodo,
  },
  {
    rota: "/api/v1/sugerir-datas",
    metodo: "post",
    ferramenta: "sugerir_datas",
    esquema: sugestao,
  },
  {
    rota: "/api/v1/acomodacoes",
    metodo: "get",
    ferramenta: "obter_acomodacoes",
    esquema: z.object({}),
  },
  {
    rota: "/api/v1/politicas",
    metodo: "get",
    ferramenta: "obter_politicas",
    esquema: z.object({}),
  },
  {
    rota: "/api/v1/base",
    metodo: "get",
    ferramenta: "consultar_base_local",
    esquema: buscaNaBase,
  },
  {
    rota: "/api/v1/transferir",
    metodo: "post",
    ferramenta: "transferir_para_humano",
    esquema: transferencia,
  },
  {
    rota: "/api/v1/pre-reservas",
    metodo: "post",
    ferramenta: "criar_pre_reserva",
    esquema: preReserva,
    idempotente: true,
    status: 201,
  },
  {
    rota: "/api/v1/reservas/{codigo}",
    metodo: "get",
    ferramenta: "consultar_reserva",
    esquema: consultaDeReserva,
    parametrosDeUrl: ["codigo"],
  },
  {
    rota: "/api/v1/reservas/{codigo}/fnrh",
    metodo: "post",
    ferramenta: "enviar_link_fnrh",
    esquema: consultaDeReserva,
    parametrosDeUrl: ["codigo"],
    idempotente: true,
  },
  {
    rota: "/api/v1/reservas/{codigo}/cancelamento",
    metodo: "post",
    ferramenta: "solicitar_cancelamento",
    esquema: pedidoDeCancelamento,
    parametrosDeUrl: ["codigo"],
    idempotente: true,
  },
];

/** O corpo de erro, igual em todas as rotas. */
const ERRO = {
  type: "object",
  properties: {
    erro: {
      type: "object",
      properties: {
        codigo: {
          type: "string",
          description: "Código estável, para a RIIA decidir o que fazer.",
        },
        mensagem: {
          type: "string",
          description: "Texto em português, pronto para repassar ao hóspede.",
        },
        dados: {
          type: "object",
          description: "Dados estruturados do motivo, para montar a frase.",
        },
      },
      required: ["codigo", "mensagem"],
    },
  },
} as const;

const RESPOSTAS_DE_ERRO = {
  "401": { description: "Chave ausente, desconhecida, revogada ou vencida." },
  "403": { description: "A chave não tem o escopo, ou o nível da conta não alcança a ferramenta." },
  "422": { description: "Parâmetros inválidos." },
  "429": { description: "Limite de requisições por minuto excedido." },
};

export function GET() {
  const caminhos: Record<string, unknown> = {};

  for (const c of CAMINHOS) {
    const json = z.toJSONSchema(c.esquema, { io: "input" }) as Record<
      string,
      unknown
    >;

    const parametros: unknown[] = (c.parametrosDeUrl ?? []).map((nome) => ({
      name: nome,
      in: "path",
      required: true,
      schema: { type: "string" },
    }));

    // GET leva os campos na query; POST leva no corpo. O mesmo esquema Zod
    // serve aos dois — é a rota que diz de onde ler.
    if (c.metodo === "get") {
      const props = (json.properties ?? {}) as Record<string, unknown>;
      const obrigatorios = (json.required ?? []) as string[];
      for (const [nome, esquema] of Object.entries(props)) {
        parametros.push({
          name: nome,
          in: "query",
          required: obrigatorios.includes(nome),
          schema: esquema,
        });
      }
    }

    if (c.idempotente) {
      parametros.push({
        name: "Idempotency-Key",
        in: "header",
        required: false,
        schema: { type: "string" },
        description:
          "Repetir a chamada com a mesma chave devolve a resposta guardada; " +
          "a mesma chave com corpo diferente devolve 409.",
      });
    }

    const operacao: Record<string, unknown> = {
      operationId: c.ferramenta,
      summary: FERRAMENTAS[c.ferramenta].resumo,
      description:
        `Nível ${FERRAMENTAS[c.ferramenta].nivel} ` +
        `(${NIVEIS[FERRAMENTAS[c.ferramenta].nivel]}). ` +
        `Exige o escopo "${c.ferramenta}" na chave.`,
      tags: [`Nível ${FERRAMENTAS[c.ferramenta].nivel}`],
      security: [{ chaveDaApi: [] }],
      parameters: parametros,
      responses: {
        [String(c.status ?? 200)]: { description: "Tudo certo." },
        ...RESPOSTAS_DE_ERRO,
        ...(c.idempotente
          ? { "409": { description: "Conflito: data ocupada, ou chave de idempotência reusada com outro corpo." } }
          : {}),
      },
    };

    if (c.metodo === "post") {
      operacao.requestBody = {
        required: true,
        content: { "application/json": { schema: json } },
      };
    }

    caminhos[c.rota] = {
      ...((caminhos[c.rota] as object) ?? {}),
      [c.metodo]: operacao,
    };
  }

  const base = (process.env.NEXT_PUBLIC_URL_SITE ?? "").replace(/\/$/, "");

  return NextResponse.json(
    {
      openapi: "3.1.0",
      info: {
        title: "API da Villa Peri para a RIIA",
        version: "1.0.0",
        description: [
          "A regra que organiza tudo: **a RIIA propõe, o sistema decide.**",
          "",
          "Preço, disponibilidade, mínimo de diárias, desconto e cancelamento são",
          "calculados aqui. A RIIA leva o resultado ao hóspede e age só dentro do",
          "nível que a conta permite.",
          "",
          "Mensagens de hóspedes são texto não confiável. Nenhuma regra de negócio",
          "vive na RIIA, então pedir a ela um desconto ou uma exceção ao mínimo não",
          "muda o que esta API aceita — para isso existe `transferir_para_humano`.",
          "",
          "Quando não há oferta, a resposta traz o MOTIVO estruturado em vez de um",
          "\"não\" seco: é com ele que se monta a contraproposta.",
          "",
          "O documento do hóspede nunca sai desta API.",
        ].join("\n"),
      },
      servers: base ? [{ url: base }] : [],
      tags: Object.entries(NIVEIS).map(([n, nome]) => ({
        name: `Nível ${n}`,
        description: nome,
      })),
      components: {
        securitySchemes: {
          chaveDaApi: {
            type: "http",
            scheme: "bearer",
            description:
              "Chave no formato `vp_<prefixo>_<segredo>`, no cabeçalho " +
              "`Authorization: Bearer`. Uma por anfitrião, com escopo por " +
              "ferramenta, limite por minuto e revogação imediata.",
          },
        },
        schemas: { Erro: ERRO },
      },
      paths: caminhos,
      "x-ferramentas": TODAS_AS_FERRAMENTAS.map((f) => ({
        nome: f,
        nivel: FERRAMENTAS[f].nivel,
        resumo: FERRAMENTAS[f].resumo,
        implementada: CAMINHOS.some((c) => c.ferramenta === f),
      })),
    },
    {
      headers: {
        // Muda só quando o código muda, então o cache de uma hora não
        // atrapalha e poupa a função de rodar a cada leitura.
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
