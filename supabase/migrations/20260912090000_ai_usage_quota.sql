-- S-2: teto de uso das funções de IA.
--
-- `analyze-face` e `recommend-mesh-density` chamam um modelo de visão com uma imagem por
-- requisição, e nenhuma das duas contabilizava nada. A chave anônima está no bundle do
-- frontend — como é o padrão do Supabase — e é um JWT válido, então qualquer visitante
-- podia disparar chamadas pagas em laço. As próprias funções já tratavam o 402 de
-- "créditos insuficientes", o que confirma que o cenário era esperado.
--
-- Esta tabela é o contador. As funções passam a exigir usuário autenticado e a registrar
-- cada chamada ANTES de acionar o modelo — registrar depois faria com que falhas do
-- fornecedor não contassem, e quem estivesse martelando com retry nunca atingiria o teto.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A consulta de cota é sempre "as chamadas deste usuário, nesta função, nas últimas 24h",
-- com a ordenação por data decrescente. O índice cobre exatamente essa forma.
CREATE INDEX IF NOT EXISTS idx_ai_usage_window
  ON public.ai_usage (user_id, function_name, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Cada um enxerga e grava apenas o próprio consumo.
DROP POLICY IF EXISTS "Users can view their own AI usage" ON public.ai_usage;
CREATE POLICY "Users can view their own AI usage"
ON public.ai_usage
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can record their own AI usage" ON public.ai_usage;
CREATE POLICY "Users can record their own AI usage"
ON public.ai_usage
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- NÃO EXISTE POLICY DE UPDATE NEM DE DELETE, de propósito: sem elas ninguém zera o
-- próprio contador. É o que faz a cota valer alguma coisa.
