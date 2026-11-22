-- Como o site público descobre de qual anfitrião ele é.
--
-- O problema: o visitante não tem sessão, logo não há contexto de anfitrião
-- para o RLS. Mas o site precisa do `anfitriao_id` para registrar o pedido de
-- reserva. Ler a tabela `anfitriao` sem contexto devolve zero linhas, que é
-- justamente o que a política deve fazer.
--
-- Três saídas foram consideradas:
--
--   1. Guardar o id numa variável de ambiente. Frágil: um UUID no painel da
--      Vercel que ninguém sabe de onde veio, e que quebra ao recriar o banco.
--   2. Abrir uma política de leitura em `anfitriao` para linhas ativas. Abre
--      demais: RLS é por linha, não por coluna, e a mesma linha carrega
--      documento, Cadastur e conta de recebimento.
--   3. Esta: uma função que devolve SÓ id e nome das contas ativas.
--
-- SECURITY DEFINER faz a função rodar com os privilégios do dono, que passa
-- por fora do RLS — por isso ela é mínima: duas colunas, nenhum parâmetro,
-- nada que o chamador possa influenciar. É uma porta estreita e visível, em
-- vez de uma política larga e fácil de esquecer.

CREATE OR REPLACE FUNCTION public.anfitriao_publico()
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.nome
  FROM public.anfitriao a
  WHERE a.status = 'ativa'
  ORDER BY a.criado_em
$$;--> statement-breakpoint

-- Ninguém além da aplicação precisa dela.
REVOKE ALL ON FUNCTION public.anfitriao_publico() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.anfitriao_publico() TO "villaperi_app";
