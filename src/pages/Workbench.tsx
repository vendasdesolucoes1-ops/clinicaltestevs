// Workbench - Main simulation screen
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Layers, 
  Box, 
  GitCompare,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { VersionPanel } from '@/components/workbench/VersionPanel';
import { ToolPanel, type ToolType } from '@/components/workbench/ToolPanel';
import { SimulationCanvas, SimulationCanvasRef } from '@/components/workbench/SimulationCanvas';
import { Viewer3D } from '@/components/workbench/Viewer3D';
import { ComparisonView } from '@/components/workbench/ComparisonView';
import { AnalysisStatusBar } from '@/components/workbench/AnalysisStatus';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useCanvasState } from '@/hooks/useCanvasState';
import { useFacialAnalysis } from '@/hooks/useFacialAnalysis';
import { useN8nFacialAnalysis } from '@/hooks/useN8nFacialAnalysis';
import { useSymmetryAnalysis } from '@/hooks/useSymmetryAnalysis';
import { supabase } from '@/integrations/supabase/client';
import { type ClinicalCase, type CaseVersion, type SimulationJob, type CasePhoto } from '@/lib/mockData';
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
  const [processingJob, setProcessingJob] = useState<SimulationJob | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>('/placeholder.svg');
  const [showMesh, setShowMesh] = useState(true);
  const [meshOpacity, setMeshOpacity] = useState(80);
  
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
    retryAnalysis,
  } = useN8nFacialAnalysis();

  // Use n8n mesh data if available, otherwise use local
  const meshData = n8nMeshData || localMeshData;
  const isAnalyzing = isLocalAnalyzing || isN8nProcessing;

  // Calcular análise de simetria
  const symmetryResult = useSymmetryAnalysis(meshData);

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

        // Set initial image (prefer front photo) and trigger analysis
        if (photos.length > 0) {
          const frontPhoto = photos.find(p => p.angle === 'frente') || photos[0];
          setCurrentImageUrl(frontPhoto.url);

          // Check for existing facial analysis
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
          } else {
            // Trigger n8n analysis via webhook
            triggerAnalysis(id, frontPhoto.url);
          }
        }

        // Set processing job if exists
        if (jobData) {
          setProcessingJob({
            id: jobData.id,
            caseId: jobData.case_id,
            versionId: jobData.version_id,
            status: jobData.status as SimulationJob['status'],
            progress: jobData.progress,
            startedAt: jobData.started_at,
            completedAt: jobData.completed_at ?? undefined,
            parameters: (jobData.parameters as SimulationJob['parameters']) || {
              quality: 'qualidade',
              preserveSymmetry: true,
              avoidEyeDistortion: true,
              maintainMouthLine: true,
            },
          });
        }

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
        // Fallback to local analysis
        await analyzeImage(blobUrl);
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

      // Trigger n8n analysis via webhook
      triggerAnalysis(caseData.id, publicUrl);

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

  const handleStartSimulation = () => {
    if (!caseData || !selectedVersion) return;
    
    // Create fake processing job
    const job: SimulationJob = {
      id: `job_${Date.now()}`,
      caseId: caseData.id,
      versionId: selectedVersion.id,
      status: 'processando',
      progress: 0,
      startedAt: new Date().toISOString(),
      parameters: {
        quality: 'qualidade',
        preserveSymmetry: true,
        avoidEyeDistortion: true,
        maintainMouthLine: true,
      },
    };
    
    setProcessingJob(job);
    
    // Simulate progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setProcessingJob(null);
        toast.success('Simulação concluída!', {
          description: 'O resultado foi aplicado à versão selecionada.',
        });
      } else {
        setProcessingJob(prev => prev ? { ...prev, progress: Math.round(progress) } : null);
      }
    }, 800);
  };

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
              isProcessing={processingJob?.versionId === selectedVersion?.id}
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

        {/* Processing Status Bar */}
        {processingJob && (
          <div className="h-10 border-t border-border bg-warning/10 px-4 flex items-center gap-3 shrink-0">
            <Loader2 className="h-4 w-4 text-warning animate-spin" />
            <span className="text-sm text-foreground">Processando simulação...</span>
            <div className="flex-1 max-w-xs h-1.5 bg-warning/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-warning rounded-full transition-all duration-300"
                style={{ width: `${processingJob.progress}%` }}
              />
            </div>
            <span className="text-xs font-mono text-warning">{processingJob.progress}%</span>
          </div>
        )}
      </div>

      {/* Right Panel - Tools */}
      <div className="w-72 shrink-0">
        <ToolPanel
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
          canUndo={objects.length > 0}
          canRedo={false}
          processingJob={processingJob}
          onStartSimulation={handleStartSimulation}
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
        />
      </div>
    </div>
  );
}
