-- Adicionar política SELECT para facial_analysis_jobs
CREATE POLICY "Users can view analysis jobs"
ON public.facial_analysis_jobs
FOR SELECT
TO authenticated
USING (true);

-- Adicionar política UPDATE para facial_analysis_jobs (para o webhook atualizar)
CREATE POLICY "Service role can update analysis jobs"
ON public.facial_analysis_jobs
FOR UPDATE
TO authenticated
USING (true);