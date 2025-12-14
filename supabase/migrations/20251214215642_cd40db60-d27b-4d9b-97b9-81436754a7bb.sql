-- Add policy for authenticated users to insert analysis jobs
CREATE POLICY "Authenticated users can insert analysis jobs"
ON public.facial_analysis_jobs
FOR INSERT
TO authenticated
WITH CHECK (true);