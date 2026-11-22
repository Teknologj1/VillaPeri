-- Como a página pública da FNRH descobre de qual anfitrião é o link.
--
-- Mesmo problema da migração 0015, com uma diferença: aqui o chamador traz um
-- parâmetro. O hóspede abre /fnrh/<token> sem sessão nenhuma, e para ler a
-- reserva é preciso primeiro saber o anfitrião que define o contexto do RLS.
--
-- A alternativa seria percorrer os anfitriões ativos tentando o token em cada
-- um. Funciona com uma conta e vira N consultas com N contas — e, pior,
-- espalha a lógica do token por fora do banco.
--
-- A função devolve SÓ o anfitriao_id, e só quando o token existe, está dentro
-- da validade e a reserva ainda está num estado em que preencher a ficha faz
-- sentido. Nenhum dado do hóspede sai daqui: quem recebe o id ainda precisa
-- entrar no contexto e passar pelas políticas normais para ler qualquer coisa.
--
-- O token é comparado inteiro, sem LIKE e sem prefixo: são 24 bytes
-- aleatórios, e a única maneira de acertar é tendo recebido o link.

CREATE OR REPLACE FUNCTION public.anfitriao_por_token_fnrh(p_token text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT r.anfitriao_id
  FROM public.reserva r
  WHERE r.fnrh_token = p_token
    AND r.fnrh_expira_em > now()
    AND r.status IN ('confirmada', 'hospedado')
  LIMIT 1
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.anfitriao_por_token_fnrh(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.anfitriao_por_token_fnrh(text) TO "villaperi_app";
