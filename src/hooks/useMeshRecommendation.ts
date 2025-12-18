import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MeshRecommendation {
  recommended2D: 'simple' | 'dense';
  recommended3D: 'rapido' | 'balanceado' | 'maximo';
  confidence: number;
  reasoning: string;
  focusAreas: string[];
}

interface UseMeshRecommendationReturn {
  recommendation: MeshRecommendation | null;
  isLoading: boolean;
  error: string | null;
  getRecommendation: (params: {
    imageUrl: string;
    caseType?: string;
    photoAngle?: string;
    notes?: string;
  }) => Promise<MeshRecommendation | null>;
  clearRecommendation: () => void;
}

export function useMeshRecommendation(): UseMeshRecommendationReturn {
  const [recommendation, setRecommendation] = useState<MeshRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRecommendation = useCallback(async (params: {
    imageUrl: string;
    caseType?: string;
    photoAngle?: string;
    notes?: string;
  }): Promise<MeshRecommendation | null> => {
    const { imageUrl, caseType, photoAngle, notes } = params;

    if (!imageUrl || imageUrl === '/placeholder.svg') {
      toast.error('Selecione uma imagem primeiro');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('recommend-mesh-density', {
        body: {
          imageUrl,
          caseType,
          photoAngle,
          notes,
        },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data.error) {
        // Use fallback if provided
        if (data.fallback) {
          setRecommendation(data.fallback);
          toast.warning('Usando recomendação padrão', {
            description: data.fallback.reasoning,
          });
          return data.fallback;
        }
        throw new Error(data.error);
      }

      setRecommendation(data);
      return data;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao obter recomendação';
      setError(message);
      toast.error('Erro na análise de IA', { description: message });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearRecommendation = useCallback(() => {
    setRecommendation(null);
    setError(null);
  }, []);

  return {
    recommendation,
    isLoading,
    error,
    getRecommendation,
    clearRecommendation,
  };
}
