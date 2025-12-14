// Workbench - Main simulation screen
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Layers, 
  Box, 
  GitCompare,
  ChevronRight,
  Loader2,
  Scan,
  Image,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { VersionPanel } from '@/components/workbench/VersionPanel';
import { ToolPanel, type ToolType } from '@/components/workbench/ToolPanel';
import { SimulationCanvas, SimulationCanvasRef } from '@/components/workbench/SimulationCanvas';
import { Viewer3D } from '@/components/workbench/Viewer3D';
import { ComparisonView } from '@/components/workbench/ComparisonView';
import { AnalysisStatusBar } from '@/components/workbench/AnalysisStatus';
import { AnalysisHistory } from '@/components/workbench/AnalysisHistory';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useCanvasState } from '@/hooks/useCanvasState';
import { useFacialAnalysis } from '@/hooks/useFacialAnalysis';
import { useN8nFacialAnalysis } from '@/hooks/useN8nFacialAnalysis';
import { useSymmetryAnalysis } from '@/hooks/useSymmetryAnalysis';
import { useMeshAutoSave } from '@/hooks/useMeshAutoSave';
import { supabase } from '@/integrations/supabase/client';
import { type ClinicalCase, type CaseVersion, type CasePhoto } from '@/lib/mockData';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  
  const { 
    objects, 
    undo: stateUndo, 
    redo: stateRedo,
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

  // n8n async facial analysis
  const {
    analysisJob,
    isProcessing: isN8nProcessing,
    meshData: n8nMeshData,
    triggerAnalysis,
    triggerSimulation,
    retryAnalysis,
    createdVersion,
    clearCreatedVersion,
  } = useN8nFacialAnalysis();

  // Use n8n mesh data if available, otherwise use local
  const meshData = n8nMeshData || localMeshData;
  const isAnalyzing = isLocalAnalyzing || isN8nProcessing;

  // Calcular análise de simetria
  const symmetryResult = useSymmetryAnalysis(meshData);

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
          .select('id, angle, url, storage_path, captured_at')
          .eq('case_id', id)
          .order('captured_at', { ascending: true });

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

        // Map photos to CasePhoto format
        const photos: CasePhoto[] = (photosData || []).map(p => ({
          id: p.id,
          angle: p.angle as CasePhoto['angle'],
          url: p.url,
          capturedAt: p.captured_at,
        }));

        // Map versions to CaseVersion format
        const versions: CaseVersion[] = (versionsData || []).map(v => ({
          id: v.id,
          name: v.name,
          type: v.type as CaseVersion['type'],
          subVersion: v.sub_version ?? undefined,
          description: v.description || '',
          status: v.status as CaseVersion['status'],
          createdAt: v.created_at,
          author: 'Autor', // TODO: fetch author name from profiles
          thumbnailUrl: v.thumbnail_url ?? undefined,
        }));

        // Build responsible name
        const profile = caseRow.profiles as { first_name: string | null; last_name: string | null } | null;
        const responsibleName = profile 
          ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Não atribuído'
          : 'Não atribuído';

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

          if (existingAnalysis && existingAnalysis.points) {
            // Load existing mesh data
            loadExistingAnalysis({
              points: existingAnalysis.points as any,
              faceROI: existingAnalysis.face_roi as any,
              midlinePoints: existingAnalysis.midline_points || [],
              customConnections: existingAnalysis.custom_connections as any,
            });
            toast.info('Análise facial carregada');
          }
          // No automatic analysis trigger - user must click "Gerar Análise Facial" button
        }

        // Note: processing jobs are now handled via n8n polling, no need to set here

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

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('case-photos')
        .getPublicUrl(fileName);

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
        url: publicUrl,
        capturedAt: new Date().toISOString(),
      };
      
      setCaseData(prev => prev ? {
        ...prev,
        photos: [...prev.photos, newPhoto],
      } : null);

      // Update display URL to the public one
      setCurrentImageUrl(publicUrl);

      // No automatic analysis - user must click "Gerar Análise Facial" button
      toast.success('Foto adicionada', {
        description: 'Clique em "Gerar Análise Facial" para processar.'
      });

    } catch (error) {
      console.error('Erro no upload/análise:', error);
      toast.error('Erro ao processar imagem');
    }
  }, [caseData, triggerAnalysis]);

  // Handlers
  const handleUndo = useCallback(() => {
    canvasRef.current?.undo();
    stateUndo();
    toast.info('Ação desfeita', { duration: 1500 });
  }, [stateUndo]);

  const handleRedo = useCallback(() => {
    canvasRef.current?.redo();
    stateRedo();
    toast.info('Ação refeita', { duration: 1500 });
  }, [stateRedo]);

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
          sub_version: subVersion,
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
        subVersion: newVersion.sub_version ?? undefined,
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
          sub_version: subVersion,
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
        subVersion: newVersion.sub_version ?? undefined,
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

  // Trigger real n8n simulation
  const handleTriggerSimulation = useCallback(async (targetVersion: 'A' | 'B') => {
    if (!caseData || !currentImageUrl || currentImageUrl === '/placeholder.svg') {
      toast.error('Selecione uma foto antes de rodar a simulação');
      return;
    }
    
    await triggerSimulation(caseData.id, currentImageUrl, targetVersion);
  }, [caseData, currentImageUrl, triggerSimulation]);

  // Handle created version from simulation
  useEffect(() => {
    if (createdVersion && caseData) {
      // Refresh versions list to include the new one
      const refreshVersions = async () => {
        const { data: versionsData } = await supabase
          .from('case_versions')
          .select('*')
          .eq('case_id', caseData.id)
          .order('created_at', { ascending: true });
        
        if (versionsData) {
          const versions: CaseVersion[] = versionsData.map(v => ({
            id: v.id,
            name: v.name,
            type: v.type as CaseVersion['type'],
            subVersion: v.sub_version ?? undefined,
            description: v.description || '',
            status: v.status as CaseVersion['status'],
            createdAt: v.created_at,
            author: 'Autor',
            thumbnailUrl: v.thumbnail_url ?? undefined,
          }));
          
          setCaseData(prev => prev ? { ...prev, versions } : null);
          
          // Auto-select the newly created version
          const newVersion = versions.find(v => v.id === createdVersion.id);
          if (newVersion) {
            setSelectedVersion(newVersion);
          }
        }
        
        clearCreatedVersion();
      };
      
      refreshVersions();
    }
  }, [createdVersion, caseData, clearCreatedVersion]);

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
      {/* Left Panel - Versions */}
      <div className="w-64 shrink-0">
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
      </div>

      {/* Center - Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-12 border-b border-border px-4 flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <Link to="/cases" className="text-muted-foreground hover:text-foreground transition-colors">
              Casos
            </Link>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground font-medium">{caseData.codename}</span>
            {selectedVersion && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className={cn(
                  "font-medium",
                  selectedVersion.type === 'A' ? "text-version-a" :
                  selectedVersion.type === 'B' ? "text-version-b" :
                  "text-foreground"
                )}>
                  {selectedVersion.name}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Photo Selector */}
            {caseData.photos.length > 0 && (
              <Select
                value={currentImageUrl}
                onValueChange={async (url) => {
                  setCurrentImageUrl(url);
                  clearMesh(); // Clear existing mesh when switching photos
                  
                  // Find the selected photo and update photoId
                  const selectedPhoto = caseData.photos.find(p => p.url === url);
                  if (selectedPhoto) {
                    setCurrentPhotoId(selectedPhoto.id);
                    
                    // Check for existing analysis
                    if (analyzedPhotoIds.has(selectedPhoto.id)) {
                      // Load existing analysis for this photo
                      const { data: existingAnalysis } = await supabase
                        .from('facial_analyses')
                        .select('*')
                        .eq('photo_id', selectedPhoto.id)
                        .maybeSingle();
                      
                      if (existingAnalysis && existingAnalysis.points) {
                        loadExistingAnalysis({
                          points: existingAnalysis.points as any,
                          faceROI: existingAnalysis.face_roi as any,
                          midlinePoints: existingAnalysis.midline_points || [],
                          customConnections: existingAnalysis.custom_connections as any,
                        });
                        toast.info('Análise facial carregada');
                      }
                    }
                  }
                }}
              >
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <Image className="h-3.5 w-3.5 mr-2" />
                  <SelectValue placeholder="Selecionar foto" />
                </SelectTrigger>
                <SelectContent className="z-50">
                  {caseData.photos.map((photo) => (
                    <SelectItem key={photo.id} value={photo.url} className="text-xs">
                      <span className="flex items-center gap-2">
                        {photo.angle === 'frente' ? 'Frente' :
                         photo.angle === 'perfil_d' ? 'Perfil Direito' :
                         photo.angle === 'perfil_e' ? 'Perfil Esquerdo' :
                         photo.angle === 'tres_quartos' ? '3/4' : photo.angle}
                        {analyzedPhotoIds.has(photo.id) && (
                          <CheckCircle2 className="h-3 w-3 text-success" />
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Gerar Análise Facial Button */}
            <Button
              variant="default"
              size="sm"
              className="gap-2"
              disabled={!currentImageUrl || currentImageUrl === '/placeholder.svg' || isAnalyzing}
              onClick={() => caseData && triggerAnalysis(caseData.id, currentImageUrl)}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Scan className="h-4 w-4" />
                  Gerar Análise Facial
                </>
              )}
            </Button>

            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="2d" className="text-xs gap-1.5 px-3">
                  <Layers className="h-3.5 w-3.5" />
                  2D
                </TabsTrigger>
                <TabsTrigger value="3d" className="text-xs gap-1.5 px-3">
                  <Box className="h-3.5 w-3.5" />
                  3D
                </TabsTrigger>
                <TabsTrigger 
                  value="compare" 
                  className="text-xs gap-1.5 px-3"
                  disabled={versionsA.length === 0 && versionsB.length === 0}
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  Comparar
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 min-h-0">
          {viewMode === '2d' && (
            <SimulationCanvas
              ref={canvasRef}
              imageUrl={currentImageUrl}
              activeTool={activeTool}
              isPanMode={isPanMode}
              meshData={meshData}
              showMesh={showMesh}
              meshOpacity={meshOpacity}
              meshEditMode={meshEditMode}
              connectingFrom={connectingFrom}
              onMeshPointMove={updatePoint}
              onMeshPointAdd={addPoint}
              onMeshPointRemove={removePoint}
              onMeshStartConnection={startConnection}
              onMeshAddConnection={addConnection}
              onMeshRemoveConnection={removeConnection}
            />
          )}
          
          {/* Analyzing indicator */}
          {isAnalyzing && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-50">
              <div className="flex flex-col items-center gap-3 p-6 rounded-lg bg-card border border-border shadow-xl">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-foreground font-medium">Analisando landmarks faciais...</span>
              </div>
            </div>
          )}
          {viewMode === '3d' && (
            <Viewer3D 
              modelUrl={selectedVersion?.status === 'pronto' ? '#' : undefined}
              imageUrl={currentImageUrl !== '/placeholder.svg' ? currentImageUrl : undefined}
              isProcessing={isN8nProcessing}
            />
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

        {/* n8n Analysis Status Bar */}
        {analysisJob && (
          <AnalysisStatusBar 
            status={analysisJob.status} 
            onRetry={retryAnalysis}
          />
        )}

        {/* Processing indicator now shown via ToolPanel and AnalysisStatusBar */}
      </div>

      {/* Right Panel - Tools */}
      <div className="w-72 shrink-0 flex flex-col">
        <ToolPanel
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
          canUndo={objects.length > 0}
          canRedo={false}
          isSimulating={isN8nProcessing}
          onTriggerSimulation={handleTriggerSimulation}
          showMesh={showMesh}
          onShowMeshChange={setShowMesh}
          meshOpacity={meshOpacity}
          onMeshOpacityChange={setMeshOpacity}
          meshDensity={meshDensity}
          onMeshDensityChange={setMeshDensity}
          meshEditMode={meshEditMode}
          onMeshEditModeChange={setMeshEditMode}
          isConnecting={!!connectingFrom}
          onCancelConnection={cancelConnection}
          isAnalyzingFace={isAnalyzing}
          symmetryResult={symmetryResult}
          onGetCanvasImage={() => canvasRef.current?.getCanvasDataUrl() ?? null}
          caseName={caseData?.codename}
          currentPhotoAngle={caseData?.photos.find(p => p.url === currentImageUrl)?.angle}
        />
        
        {/* Analysis History */}
        {caseData && (
          <div className="p-3 border-t border-border bg-card">
            <AnalysisHistory 
              caseId={caseData.id} 
              onLoadAnalysis={loadExistingAnalysis}
              onAnalysisDeleted={async () => {
                // Refresh analyzed photo IDs after deletion
                const { data: analysesData } = await supabase
                  .from('facial_analyses')
                  .select('photo_id')
                  .eq('case_id', caseData.id);
                
                if (analysesData) {
                  setAnalyzedPhotoIds(new Set(analysesData.map(a => a.photo_id)));
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
