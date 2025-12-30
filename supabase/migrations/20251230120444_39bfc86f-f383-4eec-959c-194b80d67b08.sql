-- Adicionar FK de responsible_id para profiles para permitir JOINs no Supabase
ALTER TABLE public.clinical_cases 
  DROP CONSTRAINT IF EXISTS clinical_cases_responsible_id_fkey;

ALTER TABLE public.clinical_cases 
  ADD CONSTRAINT clinical_cases_responsible_id_fkey 
  FOREIGN KEY (responsible_id) REFERENCES public.profiles(id) ON DELETE SET NULL;