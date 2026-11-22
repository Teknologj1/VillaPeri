-- FORCE RLS nas tabelas da RIIA, e a porta de autenticação.
--
-- O drizzle-kit emite ENABLE, nunca FORCE. A diferença importa: com ENABLE
-- apenas, o DONO da tabela passa por fora da política sem erro nenhum. Como
-- as migrações rodam com o papel dono, esquecer o FORCE deixa o isolamento
-- parecendo funcionar enquanto não funciona.

ALTER TABLE "chave_api" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversa" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "acao_riia" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_saida" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "base_conhecimento" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Como a API autentica uma chave antes de saber de quem ela é.
--
-- O problema é o mesmo do site público e do link da FNRH, numa ordem
-- invertida: aqui o anfitrião é justamente o que se está tentando descobrir.
-- A requisição chega com um segredo e nada mais; só depois de achar a linha
-- é que existe um `anfitriao_id` para pôr no contexto do RLS.
--
-- A função recebe o PREFIXO (a parte legível da chave, guardada em claro) e
-- devolve o que a autenticação precisa para decidir — inclusive o hash, que a
-- rota compara em tempo constante com o segredo recebido. Não devolve nada
-- mais: nome da chave, datas de uso e o resto ficam atrás do RLS normal,
-- lidos depois, já com o contexto definido.
--
-- Devolver o hash não é vazamento: ele é a forma guardada do segredo, não o
-- segredo, e só sai para quem já acertou o prefixo. Guardar o segredo em
-- claro, esse sim, seria o problema.

CREATE OR REPLACE FUNCTION public.chave_api_por_prefixo(p_prefixo text)
RETURNS TABLE (
  id uuid,
  anfitriao_id uuid,
  hash text,
  escopos jsonb,
  nivel_autonomia integer,
  limite_por_minuto integer,
  valida_ate timestamptz,
  revogada_em timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.anfitriao_id, c.hash, c.escopos, c.nivel_autonomia,
         c.limite_por_minuto, c.valida_ate, c.revogada_em
  FROM public.chave_api c
  JOIN public.anfitriao a ON a.id = c.anfitriao_id
  WHERE c.prefixo = p_prefixo
    AND a.status = 'ativa'
  LIMIT 1
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.chave_api_por_prefixo(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.chave_api_por_prefixo(text) TO "villaperi_app";--> statement-breakpoint

-- Marcar o último uso também acontece fora do contexto, no mesmo instante em
-- que a chave é reconhecida. Função própria, que só escreve esta coluna.
CREATE OR REPLACE FUNCTION public.marcar_uso_da_chave(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.chave_api SET ultimo_uso_em = now() WHERE id = p_id
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.marcar_uso_da_chave(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.marcar_uso_da_chave(uuid) TO "villaperi_app";
