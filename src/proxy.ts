import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Redireciona para o login quem chega ao painel sem cookie de sessão.
 *
 * Em Next 16 isto se chama `proxy` — `middleware.ts` foi renomeado — e roda
 * no runtime Node, não no edge.
 *
 * Confere apenas a PRESENÇA do cookie, não a validade. É de propósito: a
 * verificação de verdade acontece em `exigirSessao()`, junto do dado, onde
 * também se resolve de qual anfitrião a pessoa é e o que ela pode. Isto aqui
 * só evita a página piscar antes de redirecionar.
 *
 * Um cookie forjado passa por esta porta e não passa pela próxima.
 */
export function proxy(request: NextRequest) {
  const temCookie = getSessionCookie(request);
  if (temCookie) return NextResponse.next();

  const destino = new URL("/entrar", request.url);
  // Para devolver a pessoa à página que ela tentou abrir, depois do login.
  destino.searchParams.set("voltarPara", request.nextUrl.pathname);
  return NextResponse.redirect(destino);
}

export const config = {
  matcher: ["/painel/:path*"],
};
