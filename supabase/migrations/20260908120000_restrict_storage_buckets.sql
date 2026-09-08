-- S-1: os buckets de mídia clínica estavam públicos.
--
-- `case-photos` (foto facial do paciente) e `case-3d-models` (malha facial 3D) eram
-- legíveis por qualquer pessoa que tivesse a URL, sem autenticação. Esta migration
-- fecha os dois e passa a exigir acesso ao caso correspondente.
--
-- Os nomes das policies foram conferidos contra `pg_policies` em produção (08/09/2026):
-- o banco real divergiu das migrations do repositório (policies criadas fora do controle
-- de versão). Os DROPs abaixo cobrem os dois conjuntos de nomes — o que existe em
-- produção e o que existe apenas nas migrations — para que esta migration funcione tanto
-- no banco atual quanto num banco reconstruído do zero.

-- ---------------------------------------------------------------------------
-- 1. Backfill de case_photos.storage_path
-- ---------------------------------------------------------------------------
-- O CaseForm gravava o storage_path recalculando Date.now() e sem a extensão do arquivo,
-- então o valor no banco nunca correspondeu ao objeto realmente enviado (6/6 linhas
-- divergentes na verificação). A URL pública salva na coluna `url` foi gerada a partir do
-- nome real do arquivo, então é a fonte confiável para reconstruir o caminho.
--
-- Sem este backfill a policy de leitura criada adiante negaria acesso a todas as fotos.
-- Nenhuma linha é apagada: as que não casarem com um objeto continuam como estão.

UPDATE public.case_photos
SET storage_path = substring(url from '/case-photos/([^?]+)')
WHERE url LIKE '%/case-photos/%'
  AND storage_path IS DISTINCT FROM substring(url from '/case-photos/([^?]+)');

-- ---------------------------------------------------------------------------
-- 2. Buckets passam a privados
-- ---------------------------------------------------------------------------

UPDATE storage.buckets SET public = false WHERE id IN ('case-photos', 'case-3d-models');

-- ---------------------------------------------------------------------------
-- 3. Remoção da leitura pública
-- ---------------------------------------------------------------------------

-- Existentes em produção:
DROP POLICY IF EXISTS "Anyone can view case photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view 3D models" ON storage.objects;

-- Existentes apenas nas migrations do repositório (defensivo):
DROP POLICY IF EXISTS "Public read access for case photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view 3D models" ON storage.objects;

-- ---------------------------------------------------------------------------
-- 4. Leitura restrita a quem tem acesso ao caso
-- ---------------------------------------------------------------------------
-- `has_case_access` é SECURITY DEFINER e já resolve dono do caso + admin.

CREATE POLICY "Authenticated users can view case photos they have access to"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-photos'
  AND EXISTS (
    SELECT 1
    FROM public.case_photos cp
    WHERE cp.storage_path = storage.objects.name
      AND public.has_case_access(cp.case_id)
  )
);

CREATE POLICY "Authenticated users can view 3D models they have access to"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-3d-models'
  AND EXISTS (
    SELECT 1
    FROM public.case_3d_scans s
    WHERE s.storage_path = storage.objects.name
      AND public.has_case_access(s.case_id)
  )
);
