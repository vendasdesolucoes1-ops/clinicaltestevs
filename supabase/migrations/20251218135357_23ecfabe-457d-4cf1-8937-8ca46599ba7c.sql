-- Create storage bucket for 3D models
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'case-3d-models', 
  'case-3d-models', 
  true,
  104857600, -- 100MB limit for detailed scans
  ARRAY['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']
);

-- Create storage policies for 3D models bucket
CREATE POLICY "Users can upload 3D models to their cases"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'case-3d-models' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view 3D models"
ON storage.objects
FOR SELECT
USING (bucket_id = 'case-3d-models');

CREATE POLICY "Users can delete their 3D models"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'case-3d-models' 
  AND auth.uid() IS NOT NULL
);

-- Create table for 3D scans
CREATE TABLE public.case_3d_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.clinical_cases(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  storage_path TEXT,
  scan_source TEXT DEFAULT 'polycam',
  scan_type TEXT DEFAULT 'face',
  notes TEXT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.case_3d_scans ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view 3D scans of their cases"
ON public.case_3d_scans
FOR SELECT
USING (has_case_access(case_id));

CREATE POLICY "Users can upload 3D scans to their cases"
ON public.case_3d_scans
FOR INSERT
WITH CHECK (has_case_access(case_id));

CREATE POLICY "Users can update 3D scans of their cases"
ON public.case_3d_scans
FOR UPDATE
USING (has_case_access(case_id));

CREATE POLICY "Users can delete 3D scans of their cases"
ON public.case_3d_scans
FOR DELETE
USING (has_case_access(case_id));

-- Create trigger for updated_at
CREATE TRIGGER update_case_3d_scans_updated_at
BEFORE UPDATE ON public.case_3d_scans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_case_3d_scans_case_id ON public.case_3d_scans(case_id);