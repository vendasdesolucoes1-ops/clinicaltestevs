// Signed URLs para os buckets privados de mídia clínica.
//
// `case-photos` e `case-3d-models` são privados (S-1): os objetos não são mais acessíveis
// por URL pública. A exibição usa signed URLs de curta duração derivadas do `storage_path`
// salvo no banco. A coluna `url` continua guardando a URL em formato público — ela não
// resolve mais sozinha, mas segue sendo a referência canônica do objeto.

import { supabase } from '@/integrations/supabase/client';

export type ClinicalBucket = 'case-photos' | 'case-3d-models';

// 1 hora. Ao recarregar a página as URLs são re-assinadas.
export const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Assina vários caminhos do mesmo bucket em uma única chamada.
 * Caminhos que falharem simplesmente não entram no Map — o chamador decide o fallback.
 */
export async function resolveSignedUrls(
  bucket: ClinicalBucket,
  paths: (string | null | undefined)[],
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const uniquePaths = [...new Set(paths.filter((p): p is string => !!p))];

  if (uniquePaths.length === 0) return resolved;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(uniquePaths, expiresIn);

  if (error) {
    console.error(`[storage] Falha ao assinar URLs de ${bucket}:`, error);
    return resolved;
  }

  data?.forEach(entry => {
    if (entry.path && entry.signedUrl) {
      resolved.set(entry.path, entry.signedUrl);
    }
  });

  return resolved;
}

/** Assina um único caminho. Retorna null se não for possível assinar. */
export async function resolveSignedUrl(
  bucket: ClinicalBucket,
  path: string | null | undefined,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error(`[storage] Falha ao assinar ${bucket}/${path}:`, error);
    return null;
  }

  return data?.signedUrl ?? null;
}
