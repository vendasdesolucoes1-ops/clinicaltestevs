import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Layers, 
  Box, 
  GitCompare,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { VersionPanel } from '@/components/workbench/VersionPanel';
import { ToolPanel, type ToolType } from '@/components/workbench/ToolPanel';
import { Canvas2D } from '@/components/workbench/Canvas2D';
import { Viewer3D } from '@/components/workbench/Viewer3D';
import { ComparisonView } from '@/components/workbench/ComparisonView';
import { api, mockCases, mockJobs, type ClinicalCase, type CaseVersion, type SimulationJob } from '@/lib/mockData';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ViewMode = '2d' | '3d' | 'compare';

export default function Workbench() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [caseData, setCaseData] = useState<ClinicalCase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<CaseVersion | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);
  const [processingJob, setProcessingJob] = useState<SimulationJob | null>(null);

  // Load case data
  useEffect(() => {
    const loadCase = async () => {
      setIsLoading(true);
      try {
        const data = await api.getCase(id!);
        if (data) {
          setCaseData(data);
          setSelectedVersion(data.versions[0] || null);
          // Check for processing jobs
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'z':
          if (undoStack.length > 0) handleUndo();
          break;
        case 'y':
          if (redoStack.length > 0) handleRedo();
          break;
        case ' ':
          e.preventDefault();
          // Space for pan mode
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, last]);
    toast.info('Ação desfeita');
  }, [undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, last]);
    toast.info('Ação refeita');
  }, [redoStack]);

  const handleCanvasAction = useCallback((action: { type: string; data: any }) => {
    setUndoStack(prev => [...prev, action]);
    setRedoStack([]);
  }, []);

  const handleCreateVersion = async (type: 'A' | 'B') => {
    if (!caseData) return;
    try {
      const version = await api.createVersion(caseData.id, type, `Nova versão ${type}`);
      setCaseData(prev => prev ? {
        ...prev,
        versions: [...prev.versions, version],
      } : null);
      setSelectedVersion(version);
      toast.success(`Versão ${type} criada`);
    } catch (error) {
      toast.error('Erro ao criar versão');
    }
  };

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex">
        <div className="w-64 border-r border-border p-4 space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="flex-1 flex items-center justify-center">
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

  const imageUrl = caseData.photos[0]?.url || '/placeholder.svg';
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
        />
      </div>

      {/* Center - Viewer */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Breadcrumbs + View Mode */}
        <div className="h-12 border-b border-border px-4 flex items-center justify-between bg-card">
          <div className="flex items-center gap-2 text-sm">
            <Link to="/cases" className="text-muted-foreground hover:text-foreground">
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
                A/B
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Viewer Area */}
        <div className="flex-1 bg-canvas-bg">
          {viewMode === '2d' && (
            <Canvas2D 
              imageUrl={imageUrl}
              activeTool={activeTool}
              onAction={handleCanvasAction}
            />
          )}
          {viewMode === '3d' && (
            <Viewer3D 
              modelUrl={selectedVersion?.status === 'pronto' ? '#' : undefined}
              isProcessing={processingJob?.versionId === selectedVersion?.id}
            />
          )}
          {viewMode === 'compare' && (
            <ComparisonView
              imageA={imageUrl}
              imageB={imageUrl}
              labelA={versionsA[0]?.name || 'Original'}
              labelB={versionsB[0]?.name || 'Versão B'}
            />
          )}
        </div>

        {/* Processing Status Bar */}
        {processingJob && (
          <div className="h-10 border-t border-border bg-warning/10 px-4 flex items-center gap-3">
            <Loader2 className="h-4 w-4 text-warning animate-spin" />
            <span className="text-sm text-foreground">Processando simulação...</span>
            <div className="flex-1 max-w-xs h-1.5 bg-warning/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-warning rounded-full transition-all duration-500"
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
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          processingJob={processingJob}
        />
      </div>
    </div>
  );
}
