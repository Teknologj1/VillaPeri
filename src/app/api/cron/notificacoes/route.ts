import { NextResponse, type NextRequest } from "next/server";

import { anfitrioesAtivos } from "@/lib/anfitriao-publico";
import { drenarFila } from "@/modules/notificacoes";

/**
 * A varredura diária da fila de notificações.
 *
 * NÃO é o caminho normal. A mensagem sai logo depois do fato que a origina
 * (`entregarEmSeguida`, em `src/lib/entregar.ts`), porque quem acabou de
 * reservar não pode esperar um horário para receber a confirmação.
 *
 * Esta rota é a rede embaixo: recolhe o que falhou — provedor fora do ar,
 * variável de ambiente que faltava, invocação que morreu no meio. Uma vez
 * por dia basta para isso, e é o que o plano Hobby da Vercel permite: cron
 * mais frequente que diário exige o plano Pro, e o build falha ao tentar.
 *
 * Protegida por segredo porque é rota pública que faz trabalho e gasta cota
 * de provedor. A Vercel manda `Authorization: Bearer <CRON_SECRET>` sozinha
 * quando a variável existe.
 */
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return NextResponse.json(
      { erro: "CRON_SECRET não configurada; a rota fica fechada." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  // Sem sessão aqui, logo sem contexto de anfitrião: ler a tabela direto
  // devolveria zero linhas e a fila nunca sairia. A lista vem pela mesma
  // porta estreita que o site público usa.
  const contas = await anfitrioesAtivos();

  const porConta = [];
  for (const conta of contas) {
    const r = await drenarFila(conta.id);
    porConta.push({ anfitriao: conta.nome, ...r });
  }

  return NextResponse.json({ contas: porConta });
}
