-- Primeiro, remover políticas existentes para evitar conflitos
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete photos" ON storage.objects;

-- Criar políticas permissivas para o bucket case-photos
-- Permitir que qualquer usuário autenticado faça upload
CREATE POLICY "Users can upload case photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'case-photos');

-- Permitir visualização pública das fotos (bucket já é público)
CREATE POLICY "Anyone can view case photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'case-photos');

-- Permitir que usuários autenticados atualizem fotos
CREATE POLICY "Users can update case photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'case-photos');

-- Permitir que usuários autenticados deletem fotos
CREATE POLICY "Users can delete case photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'case-photos');