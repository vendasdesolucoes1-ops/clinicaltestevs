import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FacialMeshData, FacialPoint, MeshDensity, getConnectionsByDensity } from '@/types/facialLandmarks';
import { toast } from 'sonner';

interface UseFacialAnalysisReturn {
  isAnalyzing: boolean;
  meshData: FacialMeshData | null;
  meshDensity: MeshDensity;
  setMeshDensity: (density: MeshDensity) => void;
  analyzeImage: (imageUrl: string) => Promise<FacialMeshData | null>;
  updatePoint: (pointId: string, x: number, y: number) => void;
  clearMesh: () => void;
}

export const useFacialAnalysis = (): UseFacialAnalysisReturn => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [points, setPoints] = useState<FacialPoint[] | null>(null);
  const [meshDensity, setMeshDensity] = useState<MeshDensity>('dense');

  // Compute meshData based on points and current density
  const meshData = useMemo((): FacialMeshData | null => {
    if (!points) return null;
    return {
      points,
      connections: getConnectionsByDensity(meshDensity),
    };
  }, [points, meshDensity]);

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

      const detectedPoints = data.points as FacialPoint[];
      setPoints(detectedPoints);

      const meshResult: FacialMeshData = {
        points: detectedPoints,
        connections: getConnectionsByDensity(meshDensity),
      };

      toast.success('Landmarks faciais detectados!');
      
      return meshResult;
      
    } catch (error) {
      console.error('Erro na análise facial:', error);
      toast.error('Falha ao processar análise facial');
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [meshDensity]);

  const updatePoint = useCallback((pointId: string, x: number, y: number) => {
    setPoints(prev => {
      if (!prev) return null;
      return prev.map(p => 
        p.id === pointId ? { ...p, x, y } : p
      );
    });
  }, []);

  const clearMesh = useCallback(() => {
    setPoints(null);
  }, []);

  return {
    isAnalyzing,
    meshData,
    meshDensity,
    setMeshDensity,
    analyzeImage,
    updatePoint,
    clearMesh,
  };
};
