import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FacialMeshData, FacialPoint, DEFAULT_CONNECTIONS } from '@/types/facialLandmarks';
import { toast } from 'sonner';

interface UseFacialAnalysisReturn {
  isAnalyzing: boolean;
  meshData: FacialMeshData | null;
  analyzeImage: (imageUrl: string) => Promise<FacialMeshData | null>;
  updatePoint: (pointId: string, x: number, y: number) => void;
  clearMesh: () => void;
}

export const useFacialAnalysis = (): UseFacialAnalysisReturn => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [meshData, setMeshData] = useState<FacialMeshData | null>(null);

  const imageToBase64 = async (imageUrl: string): Promise<string> => {
    // Se já for base64, retorna diretamente
    if (imageUrl.startsWith('data:')) {
      return imageUrl;
    }

    // Converte URL para base64
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const analyzeImage = useCallback(async (imageUrl: string): Promise<FacialMeshData | null> => {
    setIsAnalyzing(true);
    
    try {
      toast.info('Analisando landmarks faciais...', { duration: 3000 });
      
      const imageBase64 = await imageToBase64(imageUrl);
      
      const { data, error } = await supabase.functions.invoke('analyze-face', {
        body: { imageBase64 }
      });

      if (error) {
        console.error('Erro ao chamar edge function:', error);
        toast.error('Erro ao analisar imagem facial');
        return null;
      }

      if (!data?.points || !Array.isArray(data.points)) {
        console.error('Resposta inválida:', data);
        toast.error('Formato de resposta inválido');
        return null;
      }

      const meshResult: FacialMeshData = {
        points: data.points as FacialPoint[],
        connections: DEFAULT_CONNECTIONS,
      };

      setMeshData(meshResult);
      toast.success('Landmarks faciais detectados!');
      
      return meshResult;
      
    } catch (error) {
      console.error('Erro na análise facial:', error);
      toast.error('Falha ao processar análise facial');
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const updatePoint = useCallback((pointId: string, x: number, y: number) => {
    setMeshData(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        points: prev.points.map(p => 
          p.id === pointId ? { ...p, x, y } : p
        ),
      };
    });
  }, []);

  const clearMesh = useCallback(() => {
    setMeshData(null);
  }, []);

  return {
    isAnalyzing,
    meshData,
    analyzeImage,
    updatePoint,
    clearMesh,
  };
};
