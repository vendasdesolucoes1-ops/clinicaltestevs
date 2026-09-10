DROP POLICY IF EXISTS "Authenticated users can view case photos they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view 3D models they have access to" ON storage.objects;

CREATE POLICY "Users can view photos of their cases"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'case-photos' AND public.has_case_access(public.storage_object_case_id(name)));

CREATE POLICY "Users can view 3D models of their cases"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'case-3d-models' AND public.has_case_access(public.storage_object_case_id(name)));

DROP POLICY IF EXISTS "Users can update 3D models of their cases" ON storage.objects;
CREATE POLICY "Users can update 3D models of their cases"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'case-3d-models' AND public.has_case_access(public.storage_object_case_id(name)))
WITH CHECK (bucket_id = 'case-3d-models' AND public.has_case_access(public.storage_object_case_id(name)));