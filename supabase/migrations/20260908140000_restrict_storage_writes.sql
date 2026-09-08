-- S-1 (continuação): fecha o lado da ESCRITA nos buckets de mídia clínica.
--
-- A migration anterior restringiu a leitura, mas as policies de INSERT/UPDATE/DELETE
-- checavam apenas `bucket_id` e `auth.uid() IS NOT NULL` — ou seja, qualquer usuário
-- autenticado podia sobrescrever ou apagar a foto e o modelo 3D de qualquer paciente,
-- inclusive de casos que não são dele. É o espelho exato do furo de leitura.
--
-- POR QUE O CRITÉRIO DE ESCRITA É DIFERENTE DO DE LEITURA:
-- a policy de SELECT faz join com `case_photos` / `case_3d_scans`, o que também deixa
-- arquivos órfãos inacessíveis (desejado). Isso não serve para escrita: o upload no
-- storage acontece ANTES do insert da linha no banco, então exigir a linha bloquearia
-- todo upload. A escrita usa o caminho do objeto, que sempre começa com o id do caso
-- (`${caseId}/...` em CaseForm, Workbench, useCase3DScans e na edge function do Meshy).

-- ---------------------------------------------------------------------------
-- 1. Extração segura do case_id a partir do caminho do objeto
-- ---------------------------------------------------------------------------
-- Um caminho fora do padrão faria o cast para uuid estourar e derrubar a consulta.
-- Aqui ele devolve NULL, e `has_case_access(NULL)` resulta em false — nega o acesso
-- em vez de gerar erro.

CREATE OR REPLACE FUNCTION public.storage_object_case_id(object_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  first_segment text;
BEGIN
  first_segment := (storage.foldername(object_name))[1];
  RETURN first_segment::uuid;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Remoção das policies de escrita permissivas
-- ---------------------------------------------------------------------------
-- Nomes conferidos contra `pg_policies` em produção. Os DROPs cobrem também os nomes
-- que só existem nas migrations do repositório, para funcionar num banco reconstruído.

-- case-photos
DROP POLICY IF EXISTS "Users can upload case photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update case photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete case photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload case photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their case photos" ON storage.objects;

-- Comparava auth.uid() com a primeira pasta do caminho, mas a pasta é o case_id e não
-- o user_id: nunca casou com nenhum objeto. Removida por ser proteção apenas aparente.
DROP POLICY IF EXISTS "Users can delete their uploaded photos" ON storage.objects;

-- case-3d-models
DROP POLICY IF EXISTS "Users can upload 3D models to their cases" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their 3D models" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload 3D models" ON storage.objects;

-- ---------------------------------------------------------------------------
-- 3. Escrita restrita a quem tem acesso ao caso
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can upload photos to their cases"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-photos'
  AND public.has_case_access(public.storage_object_case_id(name))
);

-- O app envia fotos com upsert: true, então a sobrescrita precisa continuar possível
-- para o dono do caso.
CREATE POLICY "Users can update photos of their cases"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'case-photos'
  AND public.has_case_access(public.storage_object_case_id(name))
)
WITH CHECK (
  bucket_id = 'case-photos'
  AND public.has_case_access(public.storage_object_case_id(name))
);

CREATE POLICY "Users can delete photos of their cases"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-photos'
  AND public.has_case_access(public.storage_object_case_id(name))
);

CREATE POLICY "Users can upload 3D models to their cases"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-3d-models'
  AND public.has_case_access(public.storage_object_case_id(name))
);

CREATE POLICY "Users can delete 3D models of their cases"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-3d-models'
  AND public.has_case_access(public.storage_object_case_id(name))
);
