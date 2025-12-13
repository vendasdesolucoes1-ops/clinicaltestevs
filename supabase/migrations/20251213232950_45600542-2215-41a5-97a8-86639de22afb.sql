-- ===========================================
-- FASE 1: ENUMS E FUNÇÕES DE SEGURANÇA
-- ===========================================

-- Enum para roles de usuário
CREATE TYPE public.app_role AS ENUM ('cirurgiao', 'residente', 'admin');

-- Enum para tipo de caso
CREATE TYPE public.case_type AS ENUM ('queimadura', 'trauma');

-- Enum para status do caso
CREATE TYPE public.case_status AS ENUM ('ativo', 'arquivado', 'em_processamento');

-- Enum para ângulo da foto
CREATE TYPE public.photo_angle AS ENUM ('frente', 'perfil_d', 'perfil_e', 'tres_quartos');

-- Enum para tipo de versão
CREATE TYPE public.version_type AS ENUM ('base', 'A', 'B');

-- Enum para status de simulação
CREATE TYPE public.simulation_status AS ENUM ('processando', 'pronto', 'falhou');

-- Enum para formato de exportação
CREATE TYPE public.export_format AS ENUM ('png', 'jpg', 'pdf');

-- ===========================================
-- FASE 2: TABELA DE ROLES (SEGURANÇA)
-- ===========================================

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função security definer para verificar role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Policy para user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- ===========================================
-- FASE 3: TABELA DE PROFILES
-- ===========================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies para profiles
CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Trigger para criar profile automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name'
  );
  
  -- Atribuir role padrão (cirurgiao)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'cirurgiao');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- FASE 4: TABELA DE CASOS CLÍNICOS
-- ===========================================

CREATE TABLE public.clinical_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codename TEXT NOT NULL,
  type case_type NOT NULL,
  status case_status NOT NULL DEFAULT 'ativo',
  responsible_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  consent_registered BOOLEAN NOT NULL DEFAULT false,
  consent_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clinical_cases ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_clinical_cases_responsible ON public.clinical_cases(responsible_id);
CREATE INDEX idx_clinical_cases_status ON public.clinical_cases(status);
CREATE INDEX idx_clinical_cases_type ON public.clinical_cases(type);

-- Policies para clinical_cases
CREATE POLICY "Users can view cases they are responsible for"
ON public.clinical_cases
FOR SELECT
TO authenticated
USING (
  responsible_id = auth.uid() 
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can create cases"
ON public.clinical_cases
FOR INSERT
TO authenticated
WITH CHECK (responsible_id = auth.uid());

CREATE POLICY "Users can update their own cases"
ON public.clinical_cases
FOR UPDATE
TO authenticated
USING (
  responsible_id = auth.uid() 
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete cases"
ON public.clinical_cases
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_clinical_cases_updated_at
  BEFORE UPDATE ON public.clinical_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- FASE 5: TABELA DE FOTOS
-- ===========================================

CREATE TABLE public.case_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  angle photo_angle NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.case_photos ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_case_photos_case_id ON public.case_photos(case_id);

-- Função para verificar acesso ao caso
CREATE OR REPLACE FUNCTION public.has_case_access(_case_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinical_cases
    WHERE id = _case_id
      AND (
        responsible_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  )
$$;

-- Policies para case_photos
CREATE POLICY "Users can view photos of their cases"
ON public.case_photos
FOR SELECT
TO authenticated
USING (public.has_case_access(case_id));

CREATE POLICY "Users can add photos to their cases"
ON public.case_photos
FOR INSERT
TO authenticated
WITH CHECK (public.has_case_access(case_id));

CREATE POLICY "Users can delete photos from their cases"
ON public.case_photos
FOR DELETE
TO authenticated
USING (public.has_case_access(case_id));

-- ===========================================
-- FASE 6: TABELA DE VERSÕES
-- ===========================================

CREATE TABLE public.case_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type version_type NOT NULL DEFAULT 'base',
  sub_version INTEGER,
  description TEXT,
  status simulation_status NOT NULL DEFAULT 'pronto',
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  thumbnail_url TEXT,
  canvas_state JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.case_versions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_case_versions_case_id ON public.case_versions(case_id);

-- Policies para case_versions
CREATE POLICY "Users can view versions of their cases"
ON public.case_versions
FOR SELECT
TO authenticated
USING (public.has_case_access(case_id));

CREATE POLICY "Users can create versions for their cases"
ON public.case_versions
FOR INSERT
TO authenticated
WITH CHECK (public.has_case_access(case_id));

CREATE POLICY "Users can update versions of their cases"
ON public.case_versions
FOR UPDATE
TO authenticated
USING (public.has_case_access(case_id));

CREATE POLICY "Users can delete versions of their cases"
ON public.case_versions
FOR DELETE
TO authenticated
USING (public.has_case_access(case_id));

CREATE TRIGGER update_case_versions_updated_at
  BEFORE UPDATE ON public.case_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- FASE 7: TABELA DE JOBS DE SIMULAÇÃO
-- ===========================================

CREATE TABLE public.simulation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  version_id UUID REFERENCES public.case_versions(id) ON DELETE CASCADE NOT NULL,
  status simulation_status NOT NULL DEFAULT 'processando',
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  parameters JSONB,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.simulation_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_simulation_jobs_case_id ON public.simulation_jobs(case_id);
CREATE INDEX idx_simulation_jobs_status ON public.simulation_jobs(status);

-- Policies para simulation_jobs
CREATE POLICY "Users can view jobs of their cases"
ON public.simulation_jobs
FOR SELECT
TO authenticated
USING (public.has_case_access(case_id));

CREATE POLICY "Users can create jobs for their cases"
ON public.simulation_jobs
FOR INSERT
TO authenticated
WITH CHECK (public.has_case_access(case_id));

CREATE POLICY "Users can update jobs of their cases"
ON public.simulation_jobs
FOR UPDATE
TO authenticated
USING (public.has_case_access(case_id));

-- ===========================================
-- FASE 8: TABELA DE EXPORTAÇÕES
-- ===========================================

CREATE TABLE public.case_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  version_id UUID REFERENCES public.case_versions(id) ON DELETE SET NULL,
  format export_format NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.case_exports ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_case_exports_case_id ON public.case_exports(case_id);

-- Policies para case_exports
CREATE POLICY "Users can view exports of their cases"
ON public.case_exports
FOR SELECT
TO authenticated
USING (public.has_case_access(case_id));

CREATE POLICY "Users can create exports for their cases"
ON public.case_exports
FOR INSERT
TO authenticated
WITH CHECK (public.has_case_access(case_id));

CREATE POLICY "Users can delete exports of their cases"
ON public.case_exports
FOR DELETE
TO authenticated
USING (public.has_case_access(case_id));

-- ===========================================
-- FASE 9: TABELA DE ANÁLISES FACIAIS
-- ===========================================

CREATE TABLE public.facial_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  photo_id UUID REFERENCES public.case_photos(id) ON DELETE CASCADE NOT NULL,
  face_roi JSONB,
  midline_points TEXT[],
  points JSONB,
  connections JSONB,
  custom_points JSONB,
  custom_connections JSONB,
  symmetry_score NUMERIC(5,2),
  regional_scores JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.facial_analyses ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_facial_analyses_case_id ON public.facial_analyses(case_id);
CREATE INDEX idx_facial_analyses_photo_id ON public.facial_analyses(photo_id);

-- Policies para facial_analyses
CREATE POLICY "Users can view analyses of their cases"
ON public.facial_analyses
FOR SELECT
TO authenticated
USING (public.has_case_access(case_id));

CREATE POLICY "Users can create analyses for their cases"
ON public.facial_analyses
FOR INSERT
TO authenticated
WITH CHECK (public.has_case_access(case_id));

CREATE POLICY "Users can update analyses of their cases"
ON public.facial_analyses
FOR UPDATE
TO authenticated
USING (public.has_case_access(case_id));

CREATE POLICY "Users can delete analyses of their cases"
ON public.facial_analyses
FOR DELETE
TO authenticated
USING (public.has_case_access(case_id));

CREATE TRIGGER update_facial_analyses_updated_at
  BEFORE UPDATE ON public.facial_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- FASE 10: TABELA DE AUDITORIA
-- ===========================================

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.clinical_cases(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_logs_case_id ON public.audit_logs(case_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- Policies para audit_logs (somente leitura)
CREATE POLICY "Users can view audit logs of their cases"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  public.has_case_access(case_id)
  OR user_id = auth.uid()
);

CREATE POLICY "System can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- ===========================================
-- FASE 11: STORAGE BUCKET PARA FOTOS
-- ===========================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('case-photos', 'case-photos', true);

-- Policies para storage
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'case-photos');

CREATE POLICY "Authenticated users can view photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'case-photos');

CREATE POLICY "Users can delete their uploaded photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'case-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ===========================================
-- FASE 12: FUNÇÃO HELPER PARA AUDITORIA
-- ===========================================

CREATE OR REPLACE FUNCTION public.log_audit(
  _case_id UUID,
  _action TEXT,
  _description TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (case_id, user_id, action, description, metadata)
  VALUES (_case_id, auth.uid(), _action, _description, _metadata)
  RETURNING id INTO _log_id;
  
  RETURN _log_id;
END;
$$;