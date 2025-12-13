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
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useCanvasState } from '@/hooks/useCanvasState';
import { useFacialAnalysis } from '@/hooks/useFacialAnalysis';
import { api, mockCases, mockJobs, type ClinicalCase, type CaseVersion, type SimulationJob } from '@/lib/mockData';
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

  const {
    isAnalyzing,
    meshData,
    analyzeImage,
    updatePoint,
    clearMesh,
  } = useFacialAnalysis();

  // Load case data
  useEffect(() => {
    const loadCase = async () => {
      setIsLoading(true);
      try {
        const data = await api.getCase(id!);
        if (data) {
          setCaseData(data);
          setSelectedVersion(data.versions[0] || null);
          // Set initial image
          if (data.photos.length > 0) {
            setCurrentImageUrl(data.photos[0].url);
          }
          const job = mockJobs.find(j => j.caseId === id && j.status === 'processando');
          setProcessingJob(job || null);
        } else {
          toast.error('Caso não encontrado');
          navigate('/cases');
        }
      } catch (error) {
        toast.error('Erro ao carregar caso');
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      loadCase();
    }
  }, [id, navigate]);

  // Handle adding a new photo - automatically triggers facial analysis
  const handleAddPhoto = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    setCurrentImageUrl(url);
    
    // Also add to case data
    if (caseData) {
      const newPhoto = {
        id: `ph_${Date.now()}`,
        angle: 'frente' as const,
        url: url,
        capturedAt: new Date().toISOString(),
      };
      setCaseData(prev => prev ? {
        ...prev,
        photos: [...prev.photos, newPhoto],
      } : null);
    }

    // Automatically analyze facial landmarks
    await analyzeImage(url);
  }, [caseData, analyzeImage]);

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
      const version = await api.createVersion(caseData.id, type, `Nova versão ${type}`);
      setCaseData(prev => prev ? {
        ...prev,
        versions: [...prev.versions, version],
      } : null);
      setSelectedVersion(version);
      
      // Save current canvas state to the new version
      const canvasState = canvasRef.current?.getCanvasState();
      saveVersion(version.name);
      
      toast.success(`Versão ${type} criada com estado atual do canvas`);
    } catch (error) {
      toast.error('Erro ao criar versão');
    }
  };

  const handleDuplicateVersion = async (version: CaseVersion) => {
    if (!caseData) return;
    try {
      const newVersion = await api.createVersion(
        caseData.id, 
        version.type as 'A' | 'B', 
        `${version.description} (cópia)`
      );
      setCaseData(prev => prev ? {
        ...prev,
        versions: [...prev.versions, newVersion],
      } : null);
      setSelectedVersion(newVersion);
      toast.success('Versão duplicada');
    } catch (error) {
      toast.error('Erro ao duplicar versão');
    }
  };

  const handleRenameVersion = (version: CaseVersion, newName: string) => {
    setCaseData(prev => prev ? {
      ...prev,
      versions: prev.versions.map(v => 
        v.id === version.id ? { ...v, name: newName } : v
      ),
    } : null);
  };

  const handleDeleteVersion = (version: CaseVersion) => {
    setCaseData(prev => prev ? {
      ...prev,
      versions: prev.versions.filter(v => v.id !== version.id),
    } : null);
    if (selectedVersion?.id === version.id) {
      setSelectedVersion(caseData?.versions[0] || null);
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
              onMeshPointMove={updatePoint}
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
          isAnalyzingFace={isAnalyzing}
        />
      </div>
    </div>
  );
}
