import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FacialMeshData, FacialPoint, FacialConnection, MeshDensity, getConnectionsByDensity } from '@/types/facialLandmarks';
import { toast } from 'sonner';

export type MeshEditMode = 'move' | 'add' | 'remove' | 'connect';

interface UseFacialAnalysisReturn {
  isAnalyzing: boolean;
  meshData: FacialMeshData | null;
  meshDensity: MeshDensity;
  setMeshDensity: (density: MeshDensity) => void;
  meshEditMode: MeshEditMode;
  setMeshEditMode: (mode: MeshEditMode) => void;
  connectingFrom: string | null;
  analyzeImage: (imageUrl: string) => Promise<FacialMeshData | null>;
  updatePoint: (pointId: string, x: number, y: number) => void;
  addPoint: (x: number, y: number) => void;
  removePoint: (pointId: string) => void;
  addConnection: (fromId: string, toId: string) => void;
  removeConnection: (fromId: string, toId: string) => void;
  startConnection: (fromId: string) => void;
  cancelConnection: () => void;
  clearMesh: () => void;
}

export const useFacialAnalysis = (): UseFacialAnalysisReturn => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [points, setPoints] = useState<FacialPoint[] | null>(null);
  const [customConnections, setCustomConnections] = useState<FacialConnection[]>([]);
  const [meshDensity, setMeshDensity] = useState<MeshDensity>('dense');
  const [meshEditMode, setMeshEditMode] = useState<MeshEditMode>('move');
  const [customPointCounter, setCustomPointCounter] = useState(1);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  // Compute meshData based on points, density and custom connections
  const meshData = useMemo((): FacialMeshData | null => {
    if (!points) return null;
    const baseConnections = getConnectionsByDensity(meshDensity);
    return {
      points,
      connections: [...baseConnections, ...customConnections],
    };
  }, [points, meshDensity, customConnections]);

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

  const addPoint = useCallback((x: number, y: number) => {
    const newPoint: FacialPoint = {
      id: `custom_point_${customPointCounter}`,
      name: `Ponto ${customPointCounter}`,
      x,
      y,
      category: 'contour',
    };
    
    setCustomPointCounter(prev => prev + 1);
    setPoints(prev => prev ? [...prev, newPoint] : [newPoint]);
    toast.success(`Ponto adicionado`);
  }, [customPointCounter]);

  const removePoint = useCallback((pointId: string) => {
    setPoints(prev => {
      if (!prev) return null;
      const filtered = prev.filter(p => p.id !== pointId);
      if (filtered.length === prev.length) return prev;
      toast.success('Ponto removido');
      return filtered;
    });
    // Also remove any connections involving this point
    setCustomConnections(prev => 
      prev.filter(c => c.from !== pointId && c.to !== pointId)
    );
  }, []);

  const startConnection = useCallback((fromId: string) => {
    setConnectingFrom(fromId);
    toast.info('Clique em outro ponto para conectar');
  }, []);

  const cancelConnection = useCallback(() => {
    setConnectingFrom(null);
  }, []);

  const addConnection = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) {
      toast.error('Não é possível conectar um ponto a si mesmo');
      return;
    }
    
    // Check if connection already exists
    const exists = customConnections.some(
      c => (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)
    );
    
    if (exists) {
      toast.error('Conexão já existe');
      setConnectingFrom(null);
      return;
    }

    const newConnection: FacialConnection = {
      from: fromId,
      to: toId,
      type: 'custom',
      isCustom: true,
    };
    
    setCustomConnections(prev => [...prev, newConnection]);
    setConnectingFrom(null);
    toast.success('Conexão criada');
  }, [customConnections]);

  const removeConnection = useCallback((fromId: string, toId: string) => {
    setCustomConnections(prev => {
      const filtered = prev.filter(
        c => !((c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId))
      );
      if (filtered.length < prev.length) {
        toast.success('Conexão removida');
      }
      return filtered;
    });
  }, []);

  const clearMesh = useCallback(() => {
    setPoints(null);
    setCustomConnections([]);
    setCustomPointCounter(1);
    setConnectingFrom(null);
  }, []);

  return {
    isAnalyzing,
    meshData,
    meshDensity,
    setMeshDensity,
    meshEditMode,
    setMeshEditMode,
    connectingFrom,
    analyzeImage,
    updatePoint,
    addPoint,
    removePoint,
    addConnection,
    removeConnection,
    startConnection,
    cancelConnection,
    clearMesh,
  };
};
