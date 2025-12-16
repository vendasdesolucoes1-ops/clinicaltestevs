import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  FacialMeshData, 
  FacialPoint, 
  FacialConnection, 
  MeshDensity, 
  FaceROI,
  getConnectionsByDensity,
  canConnect,
  isPointInROI,
  AnatomicalRegion
} from '@/types/facialLandmarks';
import { toast } from 'sonner';

export type MeshEditMode = 'move' | 'add' | 'remove' | 'connect';

interface UseFacialAnalysisReturn {
  isAnalyzing: boolean;
  meshData: FacialMeshData | null;
  faceROI: FaceROI | null;
  midlinePoints: string[];
  meshDensity: MeshDensity;
  setMeshDensity: (density: MeshDensity) => void;
  meshEditMode: MeshEditMode;
  setMeshEditMode: (mode: MeshEditMode) => void;
  connectingFrom: string | null;
  analyzeImage: (imageUrl: string) => Promise<FacialMeshData | null>;
  loadExistingAnalysis: (data: {
    points: FacialPoint[];
    faceROI?: FaceROI;
    midlinePoints?: string[];
    customConnections?: FacialConnection[];
  }) => void;
  updatePoint: (pointId: string, x: number, y: number) => void;
  addPoint: (x: number, y: number, region?: AnatomicalRegion) => void;
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
  const [faceROI, setFaceROI] = useState<FaceROI | null>(null);
  const [midlinePoints, setMidlinePoints] = useState<string[]>([]);
  const [customConnections, setCustomConnections] = useState<FacialConnection[]>([]);
  const [meshDensity, setMeshDensity] = useState<MeshDensity>('dense');
  const [meshEditMode, setMeshEditMode] = useState<MeshEditMode>('move');
  const [customPointCounter, setCustomPointCounter] = useState(1);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  // Compute meshData based on points, density and custom connections
  // RUNTIME SAFETY: Only return meshData if points is a valid non-empty array
  const meshData = useMemo((): FacialMeshData | null => {
    if (!points || !Array.isArray(points) || points.length === 0) return null;
    const safeCustomConnections = Array.isArray(customConnections) ? customConnections : [];
    const safeMidlinePoints = Array.isArray(midlinePoints) ? midlinePoints : [];
    const baseConnections = getConnectionsByDensity(meshDensity, points, safeMidlinePoints);
    return {
      points,
      connections: [...baseConnections, ...safeCustomConnections],
      faceROI: faceROI || undefined,
      midlinePoints: safeMidlinePoints,
    };
  }, [points, meshDensity, customConnections, faceROI, midlinePoints]);

  const imageToBase64 = async (imageUrl: string): Promise<string> => {
    if (imageUrl.startsWith('data:')) {
      return imageUrl;
    }
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
      toast.info('Detectando região facial e landmarks anatômicos...', { duration: 4000 });
      
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

      // Processar ROI facial
      const roi: FaceROI = data.faceROI || { x: 0, y: 0, width: 1, height: 1 };
      setFaceROI(roi);
      
      // Processar pontos da linha média
      const midline: string[] = data.midlinePoints || [];
      setMidlinePoints(midline);

      // Converter pontos garantindo que tenham região anatômica
      const detectedPoints: FacialPoint[] = data.points.map((p: any) => ({
        id: p.id,
        name: p.name || p.id,
        x: p.x,
        y: p.y,
        region: p.region || inferRegionFromId(p.id),
        adjacentRegions: p.adjacentRegions || [],
      }));
      
      setPoints(detectedPoints);

      const meshResult: FacialMeshData = {
        points: detectedPoints,
        connections: getConnectionsByDensity(meshDensity, detectedPoints, midline),
        faceROI: roi,
        midlinePoints: midline,
      };

      const regionsDetected = new Set(detectedPoints.map(p => p.region)).size;
      toast.success(`${detectedPoints.length} landmarks em ${regionsDetected} regiões anatômicas`);
      
      return meshResult;
      
    } catch (error) {
      console.error('Erro na análise facial:', error);
      toast.error('Falha ao processar análise facial');
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [meshDensity]);

  // Inferir região anatômica baseado no ID do ponto (fallback)
  const inferRegionFromId = (id: string): AnatomicalRegion => {
    if (id.includes('supercilium_left') || id.includes('eyebrow_left')) return 'eyebrow_left';
    if (id.includes('supercilium_right') || id.includes('eyebrow_right')) return 'eyebrow_right';
    if (id.includes('orbitale_left') || id.includes('palpebra') && id.includes('left') || id === 'pupil_left') return 'eye_left';
    if (id.includes('orbitale_right') || id.includes('palpebra') && id.includes('right') || id === 'pupil_right') return 'eye_right';
    if (id.includes('alar') || id.includes('columella') || id === 'pronasale' || id === 'subnasale') return 'nose_lower';
    if (id === 'nasion' || id === 'rhinion') return 'nose_upper';
    if (id.includes('cheilion') || id.includes('vermillion') || id.includes('cupid') || id.includes('philtrum')) return 'mouth_perioral';
    if (id === 'labiale_superius' || id === 'stomion') return 'mouth_upper';
    if (id === 'labiale_inferius') return 'mouth_lower';
    if (id.includes('gonion') || id.includes('mandible_left')) return 'mandible_left';
    if (id.includes('mandible_right')) return 'mandible_right';
    if (id.includes('zygion_left') || id.includes('malar_left')) return 'zygomatic_left';
    if (id.includes('zygion_right') || id.includes('malar_right')) return 'zygomatic_right';
    if (id.includes('cheek_left')) return 'cheek_left';
    if (id.includes('cheek_right')) return 'cheek_right';
    if (id === 'pogonion' || id === 'gnathion' || id === 'menton' || id === 'labiomental_crease') return 'chin';
    if (id === 'trichion' || id === 'metopion' || id.includes('temple')) return 'forehead';
    if (id === 'glabella') return 'midline';
    return 'midline';
  };

  const updatePoint = useCallback((pointId: string, x: number, y: number) => {
    // Validar que o novo ponto está dentro da ROI
    if (faceROI && !isPointInROI({ x, y }, faceROI)) {
      toast.error('Ponto deve permanecer dentro do rosto');
      return;
    }
    
    setPoints(prev => {
      if (!prev) return null;
      return prev.map(p => 
        p.id === pointId ? { ...p, x, y } : p
      );
    });
  }, [faceROI]);

  const addPoint = useCallback((x: number, y: number, region: AnatomicalRegion = 'cheek_left') => {
    // Validar que o ponto está dentro da ROI
    if (faceROI && !isPointInROI({ x, y }, faceROI)) {
      toast.error('Ponto deve estar dentro da região facial');
      return;
    }
    
    const newPoint: FacialPoint = {
      id: `custom_point_${customPointCounter}`,
      name: `Ponto Personalizado ${customPointCounter}`,
      x,
      y,
      region,
    };
    
    setCustomPointCounter(prev => prev + 1);
    setPoints(prev => prev ? [...prev, newPoint] : [newPoint]);
    toast.success(`Ponto adicionado na região ${region}`);
  }, [customPointCounter, faceROI]);

  const removePoint = useCallback((pointId: string) => {
    setPoints(prev => {
      if (!prev) return null;
      const filtered = prev.filter(p => p.id !== pointId);
      if (filtered.length === prev.length) return prev;
      toast.success('Ponto removido');
      return filtered;
    });
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
    
    // Buscar os pontos para validar conexão
    const fromPoint = points?.find(p => p.id === fromId);
    const toPoint = points?.find(p => p.id === toId);
    
    if (!fromPoint || !toPoint) {
      toast.error('Pontos não encontrados');
      setConnectingFrom(null);
      return;
    }
    
    // Validar que as regiões são adjacentes
    if (!canConnect(fromPoint, toPoint)) {
      toast.error(`Conexão inválida: ${fromPoint.region} não é adjacente a ${toPoint.region}`);
      setConnectingFrom(null);
      return;
    }
    
    // Verificar se conexão já existe
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
  }, [customConnections, points]);

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
    setFaceROI(null);
    setMidlinePoints([]);
    setCustomConnections([]);
    setCustomPointCounter(1);
    setConnectingFrom(null);
  }, []);

  // Load existing analysis from Supabase
  const loadExistingAnalysis = useCallback((data: {
    points: FacialPoint[];
    faceROI?: FaceROI;
    midlinePoints?: string[];
    customConnections?: FacialConnection[];
  }) => {
    // Validate arrays before setting state
    const validPoints = Array.isArray(data.points) ? data.points : [];
    const validMidlinePoints = Array.isArray(data.midlinePoints) ? data.midlinePoints : [];
    const validCustomConnections = Array.isArray(data.customConnections) ? data.customConnections : [];
    
    setPoints(validPoints.length > 0 ? validPoints : null);
    if (data.faceROI) setFaceROI(data.faceROI);
    setMidlinePoints(validMidlinePoints);
    setCustomConnections(validCustomConnections);
  }, []);

  return {
    isAnalyzing,
    meshData,
    faceROI,
    midlinePoints,
    meshDensity,
    setMeshDensity,
    meshEditMode,
    setMeshEditMode,
    connectingFrom,
    analyzeImage,
    loadExistingAnalysis,
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
