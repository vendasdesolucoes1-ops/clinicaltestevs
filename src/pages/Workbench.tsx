// Workbench - Main simulation screen
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Loader2,
  FolderOpen,
  Wrench,
  Box,
  Sparkles
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { VersionPanel } from '@/components/workbench/VersionPanel';
import { ToolPanel, type ToolType } from '@/components/workbench/ToolPanel';
import { SimulationCanvas, SimulationCanvasRef } from '@/components/workbench/SimulationCanvas';
import { Viewer3D } from '@/components/workbench/Viewer3D';
import { PatientModelViewer } from '@/components/workbench/PatientModelViewer';
import FaceMesh3D from '@/components/workbench/FaceMesh3D';
import { Model3DUpload } from '@/components/workbench/Model3DUpload';
import { ComparisonView } from '@/components/workbench/ComparisonView';
import { AnalysisStatusBar } from '@/components/workbench/AnalysisStatus';
import { CollapsiblePanel } from '@/components/workbench/CollapsiblePanel';
import { CanvasContextBar } from '@/components/workbench/CanvasContextBar';
import { WorkbenchHeader } from '@/components/workbench/WorkbenchHeader';
import { MeshRecommendationModal } from '@/components/workbench/MeshRecommendationModal';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useCanvasState } from '@/hooks/useCanvasState';
import { useFacialAnalysis } from '@/hooks/useFacialAnalysis';
import { useMediaPipeMesh } from '@/hooks/useMediaPipeMesh';
import { useFaceWarp } from '@/hooks/useFaceWarp';
import { useSymmetryAnalysis } from '@/hooks/useSymmetryAnalysis';
import { useMeshAutoSave } from '@/hooks/useMeshAutoSave';
import { useCase3DScans } from '@/hooks/useCase3DScans';
import { useMeshRecommendation } from '@/hooks/useMeshRecommendation';
import { useMeshy3D } from '@/hooks/useMeshy3D';
import { supabase } from '@/integrations/supabase/client';
import { type ClinicalCase, type CaseVersion, type CasePhoto } from '@/lib/mockData';
import { resolveSignedUrl, resolveSignedUrls } from '@/lib/storageUrls';
import { toast } from 'sonner';
import { MEDIAPIPE_FACE_TESSELLATION } from '@/types/mediapipeTessellation';
import { type MeshDensity, MESH_PRESETS } from '@/types/facialLandmarks';
import { isLandmarkVisible } from '@/types/mediapipeMeshPresets';
import type { Landmark3D, TriangleFace } from '@/types/faceMesh3D';

type ViewMode = '2d' | '3d' | 'compare';

export default function Workbench() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef<SimulationCanvasRef>(null);
  
  const [caseData, setCaseData] = useState<ClinicalCase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<CaseVersion | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [isPanMode, setIsPanMode] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>('/placeholder.svg');
  const [currentPhotoId, setCurrentPhotoId] = useState<string | undefined>(undefined);
  const [showMesh, setShowMesh] = useState(true);
  const [meshOpacity, setMeshOpacity] = useState(80);
  const [analyzedPhotoIds, setAnalyzedPhotoIds] = useState<Set<string>>(new Set());
  
  // 3D Scans from Polycam/iPhone
  const {
    scans: case3DScans,
    activeScan: active3DScan,
    setActiveScan: setActive3DScan,
    isUploading: is3DUploading,
    uploadProgress: upload3DProgress,
    uploadScan: upload3DScan,
    deleteScan: delete3DScan,
  } = useCase3DScans(id);
  
  const { 
    objects,
    undoStack,
    redoStack,
    saveVersion,
  } = useCanvasState();

  // Local facial analysis (for manual/fallback use)
  const {
    isAnalyzing: isLocalAnalyzing,
    meshData: localMeshData,
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
  } = useFacialAnalysis();

  // Detecção de landmarks MediaPipe, rodando no navegador
  const {
    meshData: mediaPipeMeshData,
    visible: mediaPipeMeshVisible,
    setVisible: setMediaPipeMeshVisible,
    opacity: mediaPipeMeshOpacity,
    setOpacity: setMediaPipeMeshOpacity,
    density: mediaPipeMeshDensity,
    setDensity: setMediaPipeMeshDensity,
    visualStyle: mediaPipeMeshVisualStyle,
    setVisualStyle: setMediaPipeMeshVisualStyle,
    status: mediaPipeStatus,
    triggerAnalysis: triggerMediaPipeAnalysis,
    clearMesh: clearMediaPipeMesh,
  } = useMediaPipeMesh();

  // PR-4 nível 1: deformação geométrica da face sobre a malha detectada
  const {
    displacements: warpDisplacements,
    hasWarp,
    displacedPointCount,
    radius: warpRadius,
    setRadius: setWarpRadius,
    intensity: warpIntensity,
    setIntensity: setWarpIntensity,
    pull: pullSkin,
    reset: resetWarp,
    anchorRegions,
    toggleAnchorRegion,
    anchoredLandmarkCount,
  } = useFaceWarp();

  // Deslocamento máximo em mm, calculado no canvas (que conhece a escala da imagem e a
  // calibração). Null quando a foto não está calibrada.
  const [warpMeasureMm, setWarpMeasureMm] = useState<number | null>(null);

  // AI Mesh recommendation
  const {
    recommendation: meshRecommendation,
    isLoading: isMeshAILoading,
    getRecommendation: getMeshRecommendation,
    clearRecommendation: clearMeshRecommendation,
  } = useMeshRecommendation();
  
  const [showMeshAIModal, setShowMeshAIModal] = useState(false);

  // Fetch scans function exposed from useCase3DScans
  const fetchScans = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('case_3d_scans')
      .select('*')
      .eq('case_id', id)
      .order('created_at', { ascending: false });
    if (data && data.length > 0) {
      setActive3DScan(data[0] as any);
    }
  }, [id, setActive3DScan]);

  // Meshy AI 3D model generation
  const {
    isGenerating: is3DGenerating,
    progress: generation3DProgress,
    status: generation3DStatus,
    error: generation3DError,
    generateModel: generateMeshy3D,
  } = useMeshy3D(() => {
    // When a new scan is generated, refresh the scans list
    fetchScans();
  });

  // Mesh anatômico nomeado (edge function `analyze-face`); o mesh MediaPipe de 478
  // pontos vem do hook acima e é renderizado em paralelo.
  const meshData = localMeshData;
  const isAnalyzing = isLocalAnalyzing || mediaPipeStatus === 'processing';

  // Calcular análise de simetria
  const symmetryResult = useSymmetryAnalysis(meshData);

  // Calculate active points count based on density preset
  const activePointsCount = useMemo(() => {
    if (!mediaPipeMeshData?.points || mediaPipeMeshData.points.length === 0) return 0;
    return mediaPipeMeshData.points.filter(point => 
      isLandmarkVisible(point.id, meshDensity)
    ).length;
  }, [mediaPipeMeshData, meshDensity]);

  // Converte a malha MediaPipe para a superfície 3D, já com a deformação aplicada.
  //
  // A deformação é 2D — um arraste sobre a foto não carrega informação de profundidade —
  // então ela desloca x e y e deixa z intacto. Na prática: a manobra aparece na superfície
  // 3D, mas não altera a projeção facial. Mudar projeção exige dado volumétrico real.
  const mesh3DData = useMemo(() => {
    if (!mediaPipeMeshData?.points || mediaPipeMeshData.points.length === 0) {
      return { landmarks: [] as Landmark3D[], faces: [] as TriangleFace[] };
    }

    // Convert MediaPipe points to Landmark3D format
    // Flip Y axis and scale Z for better 3D visualization
    // Preserve original coordinates for UV mapping
    const landmarks: Landmark3D[] = mediaPipeMeshData.points.map((point, index) => {
      const displacement = warpDisplacements.get(index);
      const displacedX = point.x + (displacement?.dx ?? 0);
      const displacedY = point.y + (displacement?.dy ?? 0);

      return {
        x: (displacedX - 0.5) * 2,  // Center and scale X: 0-1 -> -1 to 1
        y: -(displacedY - 0.5) * 2, // Center, scale and flip Y
        z: (point.z ?? 0) * 0.5,    // Profundidade preservada: a manobra é 2D
        // A UV usa a coordenada ORIGINAL: assim a textura acompanha o estiramento da
        // malha, em vez de deslizar sobre ela — mesmo princípio da deformação 2D.
        originalX: point.x,
        originalY: point.y,
      };
    });

    // Filter valid tessellation triangles (indices must exist in landmarks)
    const maxIndex = landmarks.length - 1;
    const faces: TriangleFace[] = MEDIAPIPE_FACE_TESSELLATION.filter(
      ([a, b, c]) => a <= maxIndex && b <= maxIndex && c <= maxIndex
    );

    return { landmarks, faces };
  }, [mediaPipeMeshData, warpDisplacements]);

  // Auto-save mesh edits to database
  useMeshAutoSave({
    caseId: caseData?.id,
    photoId: currentPhotoId,
    meshData,
    debounceMs: 2000,
    enabled: !!meshData && !!currentPhotoId,
  });

  // Load case data from Supabase
  useEffect(() => {
    const loadCase = async () => {
      if (!id) return;
      
      setIsLoading(true);
      try {
        // Fetch case data
        const { data: caseRow, error: caseError } = await supabase
          .from('clinical_cases')
          .select(`
            id, codename, type, status, created_at, updated_at,
            tags, notes, consent_registered, consent_date,
            profiles:responsible_id(first_name, last_name)
          `)
          .eq('id', id)
          .maybeSingle();

        if (caseError || !caseRow) {
          console.error('Erro ao carregar caso:', caseError);
          toast.error('Caso não encontrado');
          navigate('/cases');
          return;
        }

        // Fetch photos
        const { data: photosData } = await supabase
          .from('case_photos')
          .select('id, angle, url, storage_path, created_at')
          .eq('case_id', id)
          .order('created_at', { ascending: true });

        // Fetch versions
        const { data: versionsData } = await supabase
          .from('case_versions')
          .select('*')
          .eq('case_id', id)
          .order('created_at', { ascending: true });

        // Fetch active simulation job
        const { data: jobData } = await supabase
          .from('simulation_jobs')
          .select('*')
          .eq('case_id', id)
          .eq('status', 'processando')
          .maybeSingle();

        // Bucket privado (S-1): a exibição usa signed URLs derivadas do storage_path.
        // A coluna `url` fica como fallback para linhas sem storage_path válido.
        const signedPhotoUrls = await resolveSignedUrls(
          'case-photos',
          (photosData || []).map(p => p.storage_path),
        );

        // Map photos to CasePhoto format
        const photos: CasePhoto[] = (photosData || []).map(p => ({
          id: p.id,
          angle: p.angle as CasePhoto['angle'],
          url: (p.storage_path && signedPhotoUrls.get(p.storage_path)) || p.url,
          capturedAt: p.created_at,
        }));

        // Map versions to CaseVersion format
        const versions: CaseVersion[] = (versionsData || []).map(v => ({
          id: v.id,
          name: v.name,
          type: v.type as CaseVersion['type'],
          description: v.description || '',
          status: v.status as CaseVersion['status'],
          createdAt: v.created_at,
          author: 'Autor', // TODO: fetch author name from profiles
          thumbnailUrl: v.thumbnail_url ?? undefined,
        }));

        // Build responsible name
        const profile = (caseRow as any).profiles as { first_name: string | null; last_name: string | null } | null;
        const responsibleName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || 'Não atribuído';

        // Build ClinicalCase object
        const clinicalCase: ClinicalCase = {
          id: caseRow.id,
          codename: caseRow.codename,
          type: caseRow.type as ClinicalCase['type'],
          status: caseRow.status as ClinicalCase['status'],
          createdAt: caseRow.created_at,
          updatedAt: caseRow.updated_at,
          responsible: responsibleName,
          tags: caseRow.tags || [],
          notes: caseRow.notes || '',
          consentRegistered: caseRow.consent_registered,
          consentDate: caseRow.consent_date ?? undefined,
          photos,
          versions,
        };

        setCaseData(clinicalCase);
        setSelectedVersion(versions[0] || null);

        // Fetch which photos have existing analyses
        const { data: analysesData } = await supabase
          .from('facial_analyses')
          .select('photo_id')
          .eq('case_id', id);
        
        if (analysesData) {
          setAnalyzedPhotoIds(new Set(analysesData.map(a => a.photo_id)));
        }

        // Set initial image (prefer front photo) and load analysis if exists
        if (photos.length > 0) {
          const frontPhoto = photos.find(p => p.angle === 'frente') || photos[0];
          setCurrentImageUrl(frontPhoto.url);
          setCurrentPhotoId(frontPhoto.id);

          // Check for existing facial analysis for front photo
          const { data: existingAnalysis } = await supabase
            .from('facial_analyses')
            .select('*')
            .eq('photo_id', frontPhoto.id)
            .maybeSingle();

          // RUNTIME SAFETY: Only load analysis if status is landmarks_ready AND points is a valid array
          if (existingAnalysis && 
              existingAnalysis.status === 'landmarks_ready' && 
              Array.isArray(existingAnalysis.points) && 
              existingAnalysis.points.length > 0) {
            // Load existing mesh data
            loadExistingAnalysis({
              points: existingAnalysis.points as any,
              faceROI: existingAnalysis.face_roi as any,
              midlinePoints: Array.isArray(existingAnalysis.midline_points) ? existingAnalysis.midline_points : [],
              customConnections: Array.isArray(existingAnalysis.custom_connections) ? existingAnalysis.custom_connections as any : [],
            });
            toast.info('Análise facial carregada');
          }
          // No automatic analysis trigger - user must click "Gerar Análise Facial" button
        }

        // A detecção roda no navegador e resolve de forma síncrona: não há job a acompanhar.

        // Create base version if none exists
        if (versions.length === 0) {
          const { data: newVersion, error: versionError } = await supabase
            .from('case_versions')
            .insert({
              case_id: id,
              name: 'Original',
              type: 'base',
              description: 'Versão base - imagens originais',
              status: 'pronto',
            })
            .select()
            .single();

          if (!versionError && newVersion) {
            const baseVersion: CaseVersion = {
              id: newVersion.id,
              name: newVersion.name,
              type: 'base',
              description: newVersion.description || '',
              status: 'pronto',
              createdAt: newVersion.created_at,
              author: responsibleName,
            };
            setCaseData(prev => prev ? { ...prev, versions: [baseVersion] } : null);
            setSelectedVersion(baseVersion);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar caso:', error);
        toast.error('Erro ao carregar caso');
      } finally {
        setIsLoading(false);
      }
    };

    loadCase();
  }, [id, navigate]);

  // Handle adding a new photo - uploads to Supabase and triggers analysis
  const handleAddPhoto = useCallback(async (file: File) => {
    if (!caseData) return;

    try {
      // Create blob URL for immediate preview
      const blobUrl = URL.createObjectURL(file);
      setCurrentImageUrl(blobUrl);

      // Generate unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${caseData.id}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('case-photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        console.error('Erro ao fazer upload:', uploadError);
        toast.error('Erro ao fazer upload da imagem');
        return;
      }

      // Bucket privado: `url` guarda a referência canônica em formato público, mas a
      // exibição precisa de uma signed URL.
      const { data: { publicUrl } } = supabase.storage
        .from('case-photos')
        .getPublicUrl(fileName);

      const displayUrl = (await resolveSignedUrl('case-photos', fileName)) ?? publicUrl;

      // Insert photo record into case_photos table
      const { data: photoRecord, error: insertError } = await supabase
        .from('case_photos')
        .insert({
          case_id: caseData.id,
          angle: 'frente',
          url: publicUrl,
          storage_path: fileName,
          captured_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('Erro ao inserir foto:', insertError);
        toast.error('Erro ao salvar registro da foto');
      }

      // Update case data with new photo
      const newPhoto = {
        id: photoRecord?.id || `ph_${Date.now()}`,
        angle: 'frente' as const,
        url: displayUrl,
        capturedAt: new Date().toISOString(),
      };

      setCaseData(prev => prev ? {
        ...prev,
        photos: [...prev.photos, newPhoto],
      } : null);

      // Update display URL and selection (o seletor de fotos identifica pelo id)
      setCurrentImageUrl(displayUrl);
      setCurrentPhotoId(newPhoto.id);

      // No automatic analysis - user must click "Gerar Análise Facial" button
      toast.success('Foto adicionada', {
        description: 'Clique em "Gerar Análise Facial" para processar.'
      });

    } catch (error) {
      console.error('Erro no upload/análise:', error);
      toast.error('Erro ao processar imagem');
    }
  }, [caseData]);

  // Handlers
  const handleUndo = useCallback(() => {
    canvasRef.current?.undo();
    toast.info('Ação desfeita', { duration: 1500 });
  }, []);

  const handleRedo = useCallback(() => {
    canvasRef.current?.redo();
    toast.info('Ação refeita', { duration: 1500 });
  }, []);

  const handleClear = useCallback(() => {
    canvasRef.current?.clear();
    toast.info('Canvas limpo');
  }, []);

  const handleEscape = useCallback(() => {
    setActiveTool('select');
    setIsPanMode(false);
  }, []);

  const handleSpaceDown = useCallback(() => {
    setIsPanMode(true);
  }, []);

  const handleSpaceUp = useCallback(() => {
    setIsPanMode(false);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onToolChange: setActiveTool,
    onEscape: handleEscape,
    onSpaceDown: handleSpaceDown,
    onSpaceUp: handleSpaceUp,
  });

  // AI Mesh recommendation handlers
  const handleTriggerMeshAI = useCallback(async () => {
    if (!currentImageUrl || currentImageUrl === '/placeholder.svg') {
      toast.error('Selecione uma foto primeiro');
      return;
    }
    setShowMeshAIModal(true);
    await getMeshRecommendation({
      imageUrl: currentImageUrl,
      caseType: caseData?.type,
      photoAngle: caseData?.photos.find(p => p.id === currentPhotoId)?.angle,
      notes: caseData?.notes,
    });
  }, [currentImageUrl, currentPhotoId, caseData, getMeshRecommendation]);

  // AI-1: análise direta pela edge function `analyze-face` (Gemini). Caminho
  // Complementa o mesh geométrico do MediaPipe com landmarks anatômicos nomeados.
  const handleAnalyzeDirect = useCallback(async () => {
    if (!currentImageUrl) {
      toast.error('Selecione uma foto primeiro');
      return;
    }
    await analyzeImage(currentImageUrl);
  }, [currentImageUrl, analyzeImage]);

  const handleApplyMeshRecommendation = useCallback((density: MeshDensity) => {
    setMeshDensity(density);
    setMediaPipeMeshDensity(density);
    const presetConfig = MESH_PRESETS[density];
    toast.success('Recomendação aplicada', {
      description: `${presetConfig.icon} ${presetConfig.label} (${presetConfig.points} pts)`,
    });
    clearMeshRecommendation();
  }, [setMeshDensity, setMediaPipeMeshDensity, clearMeshRecommendation]);

  const handleManualMeshAdjust = useCallback(() => {
    clearMeshRecommendation();
  }, [clearMeshRecommendation]);

  // Version management
  const handleCreateVersion = async (type: 'A' | 'B') => {
    if (!caseData) return;
    try {
      // Count existing versions of this type for subversioning
      const existingVersions = caseData.versions.filter(v => v.type === type);
      const subVersion = existingVersions.length > 0 ? existingVersions.length + 1 : undefined;
      const versionName = subVersion ? `Versão ${type}.${subVersion}` : `Versão ${type}`;

      const { data: newVersion, error } = await supabase
        .from('case_versions')
        .insert({
          case_id: caseData.id,
          name: versionName,
          type,
          description: `Nova versão ${type}`,
          status: 'pronto',
        })
        .select()
        .single();

      if (error) throw error;

      const version: CaseVersion = {
        id: newVersion.id,
        name: newVersion.name,
        type: newVersion.type as CaseVersion['type'],
        description: newVersion.description || '',
        status: 'pronto',
        createdAt: newVersion.created_at,
        author: caseData.responsible,
      };

      setCaseData(prev => prev ? {
        ...prev,
        versions: [...prev.versions, version],
      } : null);
      setSelectedVersion(version);
      
      // Save current canvas state to the new version
      saveVersion(version.name);
      
      toast.success(`Versão ${type} criada com estado atual do canvas`);
    } catch (error) {
      console.error('Erro ao criar versão:', error);
      toast.error('Erro ao criar versão');
    }
  };

  const handleDuplicateVersion = async (version: CaseVersion) => {
    if (!caseData) return;
    try {
      const existingVersions = caseData.versions.filter(v => v.type === version.type);
      const subVersion = existingVersions.length + 1;
      const versionName = `Versão ${version.type}.${subVersion}`;

      const { data: newVersion, error } = await supabase
        .from('case_versions')
        .insert({
          case_id: caseData.id,
          name: versionName,
          type: version.type,
          description: `${version.description} (cópia)`,
          status: 'pronto',
        })
        .select()
        .single();

      if (error) throw error;

      const duplicatedVersion: CaseVersion = {
        id: newVersion.id,
        name: newVersion.name,
        type: newVersion.type as CaseVersion['type'],
        description: newVersion.description || '',
        status: 'pronto',
        createdAt: newVersion.created_at,
        author: caseData.responsible,
      };

      setCaseData(prev => prev ? {
        ...prev,
        versions: [...prev.versions, duplicatedVersion],
      } : null);
      setSelectedVersion(duplicatedVersion);
      toast.success('Versão duplicada');
    } catch (error) {
      console.error('Erro ao duplicar versão:', error);
      toast.error('Erro ao duplicar versão');
    }
  };

  const handleRenameVersion = async (version: CaseVersion, newName: string) => {
    try {
      const { error } = await supabase
        .from('case_versions')
        .update({ name: newName })
        .eq('id', version.id);

      if (error) throw error;

      setCaseData(prev => prev ? {
        ...prev,
        versions: prev.versions.map(v => 
          v.id === version.id ? { ...v, name: newName } : v
        ),
      } : null);
    } catch (error) {
      console.error('Erro ao renomear versão:', error);
      toast.error('Erro ao renomear versão');
    }
  };

  const handleDeleteVersion = async (version: CaseVersion) => {
    try {
      const { error } = await supabase
        .from('case_versions')
        .delete()
        .eq('id', version.id);

      if (error) throw error;

      setCaseData(prev => prev ? {
        ...prev,
        versions: prev.versions.filter(v => v.id !== version.id),
      } : null);
      if (selectedVersion?.id === version.id) {
        setSelectedVersion(caseData?.versions[0] || null);
      }
      toast.success('Versão removida');
    } catch (error) {
      console.error('Erro ao deletar versão:', error);
      toast.error('Erro ao remover versão');
    }
  };

  const handleExport = () => {
    const dataUrl = canvasRef.current?.exportImage();
    if (dataUrl) {
      const link = document.createElement('a');
      link.download = `${caseData?.codename || 'simulation'}_${selectedVersion?.name || 'export'}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Imagem exportada');
    }
  };

  // Recarrega as versões do caso e seleciona a recém-criada, se informada.
  const refreshVersions = useCallback(async (caseId: string, selectVersionId?: string) => {
    const { data: versionsData } = await supabase
      .from('case_versions')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });

    if (!versionsData) return;

    const versions: CaseVersion[] = versionsData.map(v => ({
      id: v.id,
      name: v.name,
      type: v.type as CaseVersion['type'],
      description: v.description || '',
      status: v.status as CaseVersion['status'],
      createdAt: v.created_at,
      author: 'Autor',
      thumbnailUrl: v.thumbnail_url ?? undefined,
    }));

    setCaseData(prev => prev ? { ...prev, versions } : null);

    if (selectVersionId) {
      const newVersion = versions.find(v => v.id === selectVersionId);
      if (newVersion) setSelectedVersion(newVersion);
    }
  }, []);

  // PR-4: repassa o arraste ao motor de deformação, usando os landmarks já detectados.
  const handleWarpPull = useCallback((pointIndex: number, dx: number, dy: number) => {
    if (!mediaPipeMeshData?.points?.length) return;
    pullSkin(mediaPipeMeshData.points, pointIndex, dx, dy);
  }, [mediaPipeMeshData, pullSkin]);

  // Reexecuta a detecção sobre a foto atual, sem criar uma nova versão.
  const handleRetryAnalysis = useCallback(async () => {
    if (!caseData || !currentImageUrl || currentImageUrl === '/placeholder.svg') return;
    await triggerMediaPipeAnalysis(caseData.id, currentImageUrl, currentPhotoId);
  }, [caseData, currentImageUrl, currentPhotoId, triggerMediaPipeAnalysis]);

  // Roda a detecção de landmarks na foto atual e registra o resultado como uma nova
  // versão do caso. A detecção acontece no navegador, sem serviço externo.
  const handleTriggerSimulation = useCallback(async (targetVersion: 'A' | 'B') => {
    if (!caseData || !currentImageUrl || currentImageUrl === '/placeholder.svg') {
      toast.error('Selecione uma foto antes de rodar a simulação');
      return;
    }

    const mesh = await triggerMediaPipeAnalysis(caseData.id, currentImageUrl, currentPhotoId);

    // Sem mesh não há o que registrar: criar a versão assim mesmo encheria o histórico
    // do caso de análises vazias. O erro já foi comunicado pelo hook.
    if (!mesh) return;

    const versionName = `Análise Facial ${new Date().toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })}`;

    const { data: newVersion, error: versionError } = await supabase
      .from('case_versions')
      .insert({
        case_id: caseData.id,
        name: versionName,
        type: targetVersion,
        status: 'pronto',
        description: 'Versão criada automaticamente após a análise facial',
      })
      .select()
      .single();

    if (versionError || !newVersion) {
      console.error('Erro ao criar versão:', versionError);
      toast.error('Não foi possível criar a versão para esta análise');
      return;
    }

    await refreshVersions(caseData.id, newVersion.id);
    toast.success(`Versão "${versionName}" criada`);

    if (currentPhotoId) {
      setAnalyzedPhotoIds(prev => new Set(prev).add(currentPhotoId));
    }
  }, [caseData, currentImageUrl, currentPhotoId, triggerMediaPipeAnalysis, refreshVersions]);

  // Handle photo selection from header - must be before conditional returns
  const handlePhotoSelect = useCallback(async (url: string, photo: CasePhoto) => {
    setCurrentImageUrl(url);
    clearMesh();
    setCurrentPhotoId(photo.id);
    
    if (analyzedPhotoIds.has(photo.id)) {
      const { data: existingAnalysis } = await supabase
        .from('facial_analyses')
        .select('*')
        .eq('photo_id', photo.id)
        .maybeSingle();
      
      if (existingAnalysis && 
          existingAnalysis.status === 'landmarks_ready' && 
          Array.isArray(existingAnalysis.points) && 
          existingAnalysis.points.length > 0) {
        loadExistingAnalysis({
          points: existingAnalysis.points as any,
          faceROI: existingAnalysis.face_roi as any,
          midlinePoints: Array.isArray(existingAnalysis.midline_points) ? existingAnalysis.midline_points : [],
          customConnections: Array.isArray(existingAnalysis.custom_connections) ? existingAnalysis.custom_connections as any : [],
        });
        toast.info('Análise facial carregada');
      }
    }
  }, [analyzedPhotoIds, clearMesh, loadExistingAnalysis]);

  // Handle 3D model generation with Meshy AI
  const handleGenerate3D = useCallback(() => {
    if (!id || !currentImageUrl || currentImageUrl === '/placeholder.svg') {
      toast.error('Selecione uma foto antes de gerar o modelo 3D');
      return;
    }
    generateMeshy3D(currentImageUrl, id);
  }, [id, currentImageUrl, generateMeshy3D]);

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex">
        <div className="w-64 border-r border-border p-4 space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="flex-1 flex items-center justify-center bg-canvas-bg">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
        <div className="w-72 border-l border-border p-4 space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <p className="text-muted-foreground">Caso não encontrado</p>
      </div>
    );
  }

  const versionsA = caseData.versions.filter(v => v.type === 'A');
  const versionsB = caseData.versions.filter(v => v.type === 'B');

  return (
    <div className="h-[calc(100vh-3.5rem)] flex overflow-hidden">
      {/* Left Panel - Case & Versions */}
      <CollapsiblePanel
        side="left"
        title="Caso & Versões"
        description="Gerencie versões de simulação e compare técnicas"
        icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />}
        width="w-64"
        defaultOpen={true}
      >
        <VersionPanel
          caseData={caseData}
          selectedVersion={selectedVersion}
          onSelectVersion={setSelectedVersion}
          onCreateVersion={handleCreateVersion}
          onDuplicateVersion={handleDuplicateVersion}
          onRenameVersion={handleRenameVersion}
          onDeleteVersion={handleDeleteVersion}
          onExport={handleExport}
          onAddPhoto={handleAddPhoto}
        />
      </CollapsiblePanel>

      {/* Center - Canvas */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <WorkbenchHeader
          caseData={caseData}
          selectedVersion={selectedVersion}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          currentPhotoId={currentPhotoId}
          onPhotoSelect={handlePhotoSelect}
          analyzedPhotoIds={analyzedPhotoIds}
          canCompare={versionsA.length > 0 || versionsB.length > 0}
        />

        {/* Canvas Area */}
        <div className="flex-1 min-h-0 relative">
          {viewMode === '2d' && (
            <>
              <SimulationCanvas
                ref={canvasRef}
                warpDisplacements={warpDisplacements}
                onWarpPull={handleWarpPull}
                onWarpMeasureChange={setWarpMeasureMm}
                imageUrl={currentImageUrl}
                activeTool={activeTool}
                isPanMode={isPanMode}
                meshData={meshData}
                mediaPipeMeshData={mediaPipeMeshData}
                showMesh={showMesh && (mediaPipeMeshVisible || !mediaPipeMeshData)}
                meshOpacity={mediaPipeMeshData ? mediaPipeMeshOpacity : meshOpacity}
                meshDensity={meshDensity}
                meshVisualStyle={mediaPipeMeshVisualStyle}
                meshEditMode={meshEditMode}
                connectingFrom={connectingFrom}
                onMeshPointMove={updatePoint}
                onMeshPointAdd={addPoint}
                onMeshPointRemove={removePoint}
                onMeshStartConnection={startConnection}
                onMeshAddConnection={addConnection}
                onMeshRemoveConnection={removeConnection}
              />
              
              {/* Context Bar */}
              <CanvasContextBar
                activeTool={activeTool}
                isPanMode={isPanMode}
                zoom={100}
              />
            </>
          )}
          
          {/* Analyzing indicator */}
          {isAnalyzing && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-50">
              <div className="flex flex-col items-center gap-3 p-6 rounded-lg bg-card border border-border shadow-xl">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-foreground font-medium">Analisando landmarks faciais...</span>
                <p className="text-xs text-muted-foreground">Detecção rodando no navegador...</p>
              </div>
            </div>
          )}
          
          {viewMode === '3d' && (
            <>
              {active3DScan ? (
                <PatientModelViewer
                  modelUrl={active3DScan.file_url}
                  landmarks2D={mediaPipeMeshData?.points?.map(p => ({ x: p.x, y: p.y, z: p.z }))}
                  connections={mediaPipeMeshData?.connections}
                  landmarkVisualStyle={mediaPipeMeshVisualStyle}
                />
              ) : mesh3DData.landmarks.length > 0 ? (
                // Superfície reconstruída dos landmarks detectados, texturizada com a
                // própria foto. Não exige gerar modelo: existe assim que há análise, e
                // acompanha a deformação aplicada no 2D.
                <FaceMesh3D
                  landmarks={mesh3DData.landmarks}
                  faces={mesh3DData.faces}
                  imageUrl={currentImageUrl !== '/placeholder.svg' ? currentImageUrl : undefined}
                />
              ) : (
                <Viewer3D 
                  modelUrl={selectedVersion?.status === 'pronto' ? '#' : undefined}
                  imageUrl={currentImageUrl !== '/placeholder.svg' ? currentImageUrl : undefined}
                  isProcessing={mediaPipeStatus === 'processing' || is3DGenerating}
                />
              )}
              
              {/* 3D Generation CTA Overlay */}
              {!active3DScan && mesh3DData.landmarks.length === 0 && !is3DGenerating && currentImageUrl !== '/placeholder.svg' && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10">
                  <div className="text-center space-y-4 p-8 rounded-xl bg-card border border-border shadow-2xl max-w-sm">
                    <Box className="h-12 w-12 mx-auto text-muted-foreground" />
                    <h3 className="text-lg font-semibold text-foreground">Nenhum Modelo 3D</h3>
                    <p className="text-sm text-muted-foreground">
                      Gere um modelo 3D realista a partir da foto do paciente usando inteligência artificial
                    </p>
                    <Button onClick={handleGenerate3D} size="lg" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      Gerar Modelo 3D com IA
                    </Button>
                  </div>
                </div>
              )}
              
              {/* 3D Generation Progress Overlay */}
              {is3DGenerating && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10">
                  <div className="text-center space-y-4 p-8 rounded-xl bg-card border border-border shadow-2xl max-w-sm">
                    <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
                    <h3 className="text-lg font-semibold text-foreground">Gerando Modelo 3D...</h3>
                    <p className="text-sm text-muted-foreground">
                      {generation3DStatus === 'creating' && 'Enviando para processamento...'}
                      {generation3DStatus === 'processing' && `Progresso: ${generation3DProgress}%`}
                      {generation3DStatus === 'finalizing' && 'Finalizando...'}
                      {generation3DStatus === 'completed' && 'Concluído!'}
                    </p>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300 ease-out"
                        style={{ width: `${generation3DProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          
          {viewMode === 'compare' && (
            <ComparisonView
              imageA={currentImageUrl}
              imageB={currentImageUrl}
              labelA={versionsA[0]?.name || 'Original'}
              labelB={versionsB[0]?.name || 'Versão B'}
            />
          )}
        </div>

        {/* Status da detecção de landmarks */}
        {mediaPipeStatus !== 'idle' && (
          <AnalysisStatusBar
            status={mediaPipeStatus}
            onRetry={handleRetryAnalysis}
            onCancel={clearMediaPipeMesh}
          />
        )}
      </div>

      {/* Right Panel - Tools */}
      <CollapsiblePanel
        side="right"
        title="Ferramentas"
        description="Ferramentas de simulação e análise facial"
        icon={<Wrench className="h-4 w-4 text-muted-foreground" />}
        width="w-72"
        defaultOpen={true}
      >
        <div className="h-full flex-1 min-h-0 flex flex-col overflow-hidden">
          <ToolPanel
            activeTool={activeTool}
            onToolChange={setActiveTool}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClear}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            isSimulating={mediaPipeStatus === 'processing'}
            onTriggerSimulation={handleTriggerSimulation}
            showMesh={showMesh}
            onShowMeshChange={setShowMesh}
            meshOpacity={meshOpacity}
            onMeshOpacityChange={setMeshOpacity}
            meshDensity={meshDensity}
            onMeshDensityChange={setMeshDensity}
            meshVisualStyle={mediaPipeMeshVisualStyle}
            onMeshVisualStyleChange={setMediaPipeMeshVisualStyle}
            meshEditMode={meshEditMode}
            onMeshEditModeChange={setMeshEditMode}
            isConnecting={!!connectingFrom}
            onCancelConnection={cancelConnection}
            isAnalyzingFace={isAnalyzing}
            symmetryResult={symmetryResult}
            caseId={caseData?.id}
            onRetryAnalysis={handleRetryAnalysis}
            onCancelAnalysis={clearMediaPipeMesh}
            onLoadAnalysis={loadExistingAnalysis}
            onAnalysisDeleted={async () => {
              if (!caseData) return;
              const { data: analysesData } = await supabase
                .from('facial_analyses')
                .select('photo_id')
                .eq('case_id', caseData.id);

              if (analysesData) {
                setAnalyzedPhotoIds(new Set(analysesData.map((a) => a.photo_id)));
              }
            }}
            onGetCanvasImage={() => canvasRef.current?.getCanvasDataUrl() ?? null}
            caseName={caseData?.codename}
            currentPhotoAngle={caseData?.photos.find((p) => p.id === currentPhotoId)?.angle}
            onTriggerMeshAI={handleTriggerMeshAI}
            onAnalyzeDirect={handleAnalyzeDirect}
            warpRadius={warpRadius}
            onWarpRadiusChange={setWarpRadius}
            warpIntensity={warpIntensity}
            onWarpIntensityChange={setWarpIntensity}
            hasWarp={hasWarp}
            warpPointCount={displacedPointCount}
            onResetWarp={resetWarp}
            anchorRegions={anchorRegions}
            onToggleAnchorRegion={toggleAnchorRegion}
            anchoredLandmarkCount={anchoredLandmarkCount}
            warpMeasureMm={warpMeasureMm}
            isMeshAILoading={isMeshAILoading}
            activePointsCount={activePointsCount}
            // 3D Model generation (Meshy AI)
            onGenerate3D={handleGenerate3D}
            is3DGenerating={is3DGenerating}
            generation3DProgress={generation3DProgress}
            generation3DStatus={generation3DStatus}
            generation3DError={generation3DError}
            hasExisting3DScan={!!active3DScan}
            hasImage={currentImageUrl !== '/placeholder.svg'}
          />
        </div>
      </CollapsiblePanel>

      {/* AI Mesh Recommendation Modal */}
      <MeshRecommendationModal
        open={showMeshAIModal}
        onOpenChange={setShowMeshAIModal}
        recommendation={meshRecommendation}
        isLoading={isMeshAILoading}
        onApply={handleApplyMeshRecommendation}
        onManualAdjust={handleManualMeshAdjust}
      />
    </div>
  );
}
