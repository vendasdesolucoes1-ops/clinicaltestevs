
-- =============================================
-- MIGRAÇÃO COMPLETA - PARTE 1: ENUMS E TABELAS
-- =============================================

-- 1. ENUMS
CREATE TYPE public.app_role AS ENUM ('cirurgiao', 'residente', 'admin');
CREATE TYPE public.case_type AS ENUM ('queimadura', 'trauma');
CREATE TYPE public.case_status AS ENUM ('ativo', 'arquivado', 'em_processamento');
CREATE TYPE public.photo_angle AS ENUM ('frente', 'perfil_d', 'perfil_e', 'tres_quartos');
CREATE TYPE public.version_type AS ENUM ('base', 'A', 'B');
CREATE TYPE public.simulation_status AS ENUM ('processando', 'pronto', 'falhou');
CREATE TYPE public.export_format AS ENUM ('png', 'jpg', 'pdf');
CREATE TYPE public.job_status AS ENUM ('pending', 'processing', 'success', 'failed', 'landmarks_ready', 'mesh_generated', 'symmetry_calculated');

-- 2. TABELAS (ordem de dependência)

-- User Roles Table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Profiles Table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  specialty text,
  crm text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Clinical Cases Table
CREATE TABLE public.clinical_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  codename text NOT NULL,
  type case_type NOT NULL DEFAULT 'trauma',
  status case_status NOT NULL DEFAULT 'ativo',
  notes text,
  tags text[] DEFAULT '{}',
  consent_registered boolean DEFAULT false,
  consent_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Case Photos Table
CREATE TABLE public.case_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  angle photo_angle NOT NULL,
  storage_path text NOT NULL,
  url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Case Versions Table
CREATE TABLE public.case_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type version_type NOT NULL DEFAULT 'base',
  canvas_state jsonb,
  thumbnail_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Simulation Jobs Table
CREATE TABLE public.simulation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  version_id uuid REFERENCES public.case_versions(id) ON DELETE CASCADE,
  status simulation_status NOT NULL DEFAULT 'processando',
  progress integer DEFAULT 0,
  result_url text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Case Exports Table
CREATE TABLE public.case_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  format export_format NOT NULL,
  storage_path text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Facial Analyses Table
CREATE TABLE public.facial_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  photo_id uuid REFERENCES public.case_photos(id) ON DELETE SET NULL,
  points jsonb,
  face_roi jsonb,
  midline_points text[],
  mesh jsonb,
  custom_connections jsonb,
  symmetry_score numeric,
  regional_scores jsonb,
  status text DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Facial Analysis Jobs Table
CREATE TABLE public.facial_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  case_id uuid REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  photo_id uuid REFERENCES public.case_photos(id) ON DELETE SET NULL,
  status job_status NOT NULL DEFAULT 'pending',
  image_url text,
  error_message text,
  error_stage text,
  timestamp_start timestamp with time zone NOT NULL DEFAULT now(),
  timestamp_end timestamp with time zone
);

-- Audit Logs Table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  case_id uuid REFERENCES public.clinical_cases(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Notifications Table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  case_id uuid REFERENCES public.clinical_cases(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Case 3D Scans Table
CREATE TABLE public.case_3d_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.clinical_cases(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  storage_path text NOT NULL,
  url text NOT NULL,
  scan_source text,
  scan_type text,
  notes text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. FUNÇÕES (após tabelas existirem)

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
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

CREATE OR REPLACE FUNCTION public.has_case_access(_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinical_cases
    WHERE id = _case_id
      AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_analysis_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  case_owner_id uuid;
  case_codename text;
BEGIN
  IF NEW.status IN ('success', 'failed') AND (OLD.status IS NULL OR OLD.status NOT IN ('success', 'failed')) THEN
    SELECT cc.user_id, cc.codename INTO case_owner_id, case_codename
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

-- 4. RLS

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facial_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facial_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_3d_scans ENABLE ROW LEVEL SECURITY;

-- 5. POLÍTICAS RLS

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view their own cases" ON public.clinical_cases FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can create their own cases" ON public.clinical_cases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cases" ON public.clinical_cases FOR UPDATE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can delete their own cases" ON public.clinical_cases FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view photos of their cases" ON public.case_photos FOR SELECT USING (public.has_case_access(case_id));
CREATE POLICY "Users can add photos to their cases" ON public.case_photos FOR INSERT WITH CHECK (public.has_case_access(case_id));
CREATE POLICY "Users can delete photos from their cases" ON public.case_photos FOR DELETE USING (public.has_case_access(case_id));

CREATE POLICY "Users can view versions of their cases" ON public.case_versions FOR SELECT USING (public.has_case_access(case_id));
CREATE POLICY "Users can create versions for their cases" ON public.case_versions FOR INSERT WITH CHECK (public.has_case_access(case_id));
CREATE POLICY "Users can update versions of their cases" ON public.case_versions FOR UPDATE USING (public.has_case_access(case_id));
CREATE POLICY "Users can delete versions of their cases" ON public.case_versions FOR DELETE USING (public.has_case_access(case_id));

CREATE POLICY "Users can view jobs of their cases" ON public.simulation_jobs FOR SELECT USING (public.has_case_access(case_id));
CREATE POLICY "Users can create jobs for their cases" ON public.simulation_jobs FOR INSERT WITH CHECK (public.has_case_access(case_id));
CREATE POLICY "Users can update jobs of their cases" ON public.simulation_jobs FOR UPDATE USING (public.has_case_access(case_id));

CREATE POLICY "Users can view their exports" ON public.case_exports FOR SELECT USING (auth.uid() = user_id OR public.has_case_access(case_id));
CREATE POLICY "Users can create exports" ON public.case_exports FOR INSERT WITH CHECK (public.has_case_access(case_id));

CREATE POLICY "Users can view analyses of their cases" ON public.facial_analyses FOR SELECT USING (public.has_case_access(case_id));
CREATE POLICY "Users can create analyses for their cases" ON public.facial_analyses FOR INSERT WITH CHECK (public.has_case_access(case_id));
CREATE POLICY "Users can update analyses of their cases" ON public.facial_analyses FOR UPDATE USING (public.has_case_access(case_id));
CREATE POLICY "Users can delete analyses of their cases" ON public.facial_analyses FOR DELETE USING (public.has_case_access(case_id));

CREATE POLICY "Users can view analysis jobs of their cases" ON public.facial_analysis_jobs FOR SELECT USING (public.has_case_access(case_id));
CREATE POLICY "Users can create analysis jobs for their cases" ON public.facial_analysis_jobs FOR INSERT WITH CHECK (public.has_case_access(case_id));
CREATE POLICY "Users can update analysis jobs of their cases" ON public.facial_analysis_jobs FOR UPDATE USING (public.has_case_access(case_id));

CREATE POLICY "Users can view logs of their cases" ON public.audit_logs FOR SELECT USING (auth.uid() = user_id OR public.has_case_access(case_id));
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view their notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view 3D scans of their cases" ON public.case_3d_scans FOR SELECT USING (public.has_case_access(case_id));
CREATE POLICY "Users can add 3D scans to their cases" ON public.case_3d_scans FOR INSERT WITH CHECK (public.has_case_access(case_id));
CREATE POLICY "Users can delete 3D scans from their cases" ON public.case_3d_scans FOR DELETE USING (public.has_case_access(case_id));

-- 6. TRIGGERS

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clinical_cases_updated_at
  BEFORE UPDATE ON public.clinical_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_case_versions_updated_at
  BEFORE UPDATE ON public.case_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_simulation_jobs_updated_at
  BEFORE UPDATE ON public.simulation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_facial_analyses_updated_at
  BEFORE UPDATE ON public.facial_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER on_analysis_job_status_change
  AFTER INSERT OR UPDATE OF status ON public.facial_analysis_jobs
  FOR EACH ROW EXECUTE FUNCTION public.notify_analysis_complete();

-- 7. INDEXES

CREATE INDEX idx_clinical_cases_user_id ON public.clinical_cases(user_id);
CREATE INDEX idx_clinical_cases_status ON public.clinical_cases(status);
CREATE INDEX idx_case_photos_case_id ON public.case_photos(case_id);
CREATE INDEX idx_case_versions_case_id ON public.case_versions(case_id);
CREATE INDEX idx_facial_analyses_case_id ON public.facial_analyses(case_id);
CREATE INDEX idx_facial_analysis_jobs_case_id ON public.facial_analysis_jobs(case_id);
CREATE INDEX idx_facial_analysis_jobs_status ON public.facial_analysis_jobs(status);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(read);
CREATE INDEX idx_audit_logs_case_id ON public.audit_logs(case_id);

-- 8. STORAGE BUCKETS

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('case-photos', 'case-photos', true, 10485760);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('case-3d-models', 'case-3d-models', false, 104857600);

CREATE POLICY "Public read access for case photos" ON storage.objects FOR SELECT USING (bucket_id = 'case-photos');
CREATE POLICY "Authenticated users can upload case photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'case-photos');
CREATE POLICY "Users can delete their case photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'case-photos');
CREATE POLICY "Authenticated users can view 3D models" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'case-3d-models');
CREATE POLICY "Authenticated users can upload 3D models" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'case-3d-models');
CREATE POLICY "Users can delete their 3D models" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'case-3d-models');

-- 9. REALTIME

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.facial_analysis_jobs;
