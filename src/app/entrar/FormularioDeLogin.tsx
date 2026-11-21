"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { authCliente } from "@/lib/auth-cliente";

export function FormularioDeLogin() {
  const router = useRouter();
  const parametros = useSearchParams();
  const voltarPara = parametros.get("voltarPara") ?? "/painel";

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [pedindoCodigo, setPedindoCodigo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      if (pedindoCodigo) {
        const r = await authCliente.twoFactor.verifyTotp({ code: codigo });
        if (r.error) {
          setErro("Código inválido. Confira o aplicativo e tente de novo.");
          return;
        }
        router.push(voltarPara);
        return;
      }

      const r = await authCliente.signIn.email({ email, password: senha });
      if (r.error) {
        // Mensagem única para e-mail errado e senha errada: dizer qual dos
        // dois falhou revela quais e-mails têm conta no sistema.
        setErro("E-mail ou senha incorretos.");
        return;
      }
      if (r.data && "twoFactorRedirect" in r.data && r.data.twoFactorRedirect) {
        setPedindoCodigo(true);
        return;
      }
      router.push(voltarPara);
    } catch {
      setErro("Não foi possível entrar agora. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="mt-8 space-y-5">
      {pedindoCodigo ? (
        <div>
          <label htmlFor="codigo" className="block text-sm font-medium text-tinta">
            Código de verificação
          </label>
          <p className="mt-1 text-sm text-tinta-suave">
            Digite o código de seis dígitos do seu aplicativo de autenticação.
          </p>
          <input
            id="codigo"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-3 font-mono text-lg tracking-[0.3em]"
          />
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-tinta">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-3"
            />
          </div>
          <div>
            <label htmlFor="senha" className="block text-sm font-medium text-tinta">
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-2 w-full rounded-lg border border-borda bg-creme px-4 py-3"
            />
          </div>
        </>
      )}

      {erro && (
        <p
          role="alert"
          className="rounded-lg border border-vinho/30 bg-vinho/5 px-4 py-3 text-sm text-vinho"
        >
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-full bg-vinho px-6 py-3.5 font-medium text-creme transition-colors hover:bg-vinho-escuro disabled:opacity-60"
      >
        {enviando ? "Entrando…" : pedindoCodigo ? "Confirmar código" : "Entrar"}
      </button>
    </form>
  );
}
