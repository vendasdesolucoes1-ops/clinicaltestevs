-- =============================================
-- Migração: Adicionar colunas faltantes ao esquema
-- =============================================

-- 1. CLINICAL_CASES: Renomear user_id para responsible_id
ALTER TABLE public.clinical_cases 
  RENAME COLUMN user_id TO responsible_id;

-- 2. CASE_VERSIONS: Adicionar colunas faltantes
ALTER TABLE public.case_versions 
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pronto',
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. CASE_3D_SCANS: Adicionar uploaded_by e renomear url para file_url
ALTER TABLE public.case_3d_scans 
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.case_3d_scans 
  RENAME COLUMN url TO file_url;

-- 4. ATUALIZAR POLÍTICAS RLS DE CLINICAL_CASES
DROP POLICY IF EXISTS "Users can create their own cases" ON public.clinical_cases;
DROP POLICY IF EXISTS "Users can view their own cases" ON public.clinical_cases;
DROP POLICY IF EXISTS "Users can update their own cases" ON public.clinical_cases;
DROP POLICY IF EXISTS "Users can delete their own cases" ON public.clinical_cases;

CREATE POLICY "Users can create their own cases" 
ON public.clinical_cases FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = responsible_id);

CREATE POLICY "Users can view their own cases" 
ON public.clinical_cases FOR SELECT 
TO authenticated 
USING (auth.uid() = responsible_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own cases" 
ON public.clinical_cases FOR UPDATE 
TO authenticated 
USING (auth.uid() = responsible_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete their own cases" 
ON public.clinical_cases FOR DELETE 
TO authenticated 
USING (auth.uid() = responsible_id OR public.has_role(auth.uid(), 'admin'));

-- 5. ATUALIZAR FUNÇÃO has_case_access
CREATE OR REPLACE FUNCTION public.has_case_access(_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinical_cases
    WHERE id = _case_id
      AND (responsible_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
$$;

-- 6. ATUALIZAR FUNÇÃO notify_analysis_complete
CREATE OR REPLACE FUNCTION public.notify_analysis_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  case_owner_id uuid;
  case_codename text;
BEGIN
  IF NEW.status IN ('success', 'failed') AND (OLD.status IS NULL OR OLD.status NOT IN ('success', 'failed')) THEN
    SELECT cc.responsible_id, cc.codename INTO case_owner_id, case_codename
    FROM public.clinical_cases cc
    WHERE cc.id = NEW.case_id;

    IF case_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, case_id)
      VALUES (
        case_owner_id,
        CASE WHEN NEW.status = 'success' THEN 'success' ELSE 'error' END,
        CASE WHEN NEW.status = 'success' THEN 'Análise Concluída' ELSE 'Análise Falhou' END,
        CASE WHEN NEW.status = 'success' 
          THEN 'A análise facial do caso ' || COALESCE(case_codename, 'desconhecido') || ' foi concluída.'
          ELSE 'A análise facial do caso ' || COALESCE(case_codename, 'desconhecido') || ' falhou: ' || COALESCE(NEW.error_message, 'Erro desconhecido')
        END,
        NEW.case_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. ÍNDICES PARA NOVAS COLUNAS
CREATE INDEX IF NOT EXISTS idx_clinical_cases_responsible_id ON public.clinical_cases(responsible_id);
CREATE INDEX IF NOT EXISTS idx_case_versions_author_id ON public.case_versions(author_id);
CREATE INDEX IF NOT EXISTS idx_case_3d_scans_uploaded_by ON public.case_3d_scans(uploaded_by);