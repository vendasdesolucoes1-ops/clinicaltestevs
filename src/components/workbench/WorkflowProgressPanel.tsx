// Workflow Progress Panel - Shows detailed n8n job stages
import { useEffect, useState, useCallback } from 'react';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Circle,
  Workflow,
  ScanFace,
  Grid3X3,
  Ruler,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Workflow stages in order
type WorkflowStage = 
  | 'pending' 
  | 'processing' 
  | 'landmarks_ready' 
  | 'mesh_generated' 
  | 'symmetry_calculated' 
  | 'success' 
  | 'failed';

interface StageConfig {
  id: WorkflowStage;
  label: string;
  description: string;
  icon: React.ElementType;
}

const STAGES: StageConfig[] = [
  { 
    id: 'pending', 
    label: 'Aguardando', 
    description: 'Job na fila de processamento',
    icon: Clock
  },
  { 
    id: 'processing', 
    label: 'Processando', 
    description: 'Enviando imagem para análise',
    icon: Workflow
  },
  { 
    id: 'landmarks_ready', 
    label: 'Landmarks', 
    description: 'Pontos faciais detectados',
    icon: ScanFace
  },
  { 
    id: 'mesh_generated', 
    label: 'Mesh Gerada', 
    description: 'Malha facial construída',
    icon: Grid3X3
  },
  { 
    id: 'symmetry_calculated', 
    label: 'Simetria', 
    description: 'Métricas calculadas',
    icon: Ruler
  },
  { 
    id: 'success', 
    label: 'Concluído', 
    description: 'Análise finalizada',
    icon: CheckCircle2
  },
];

interface WorkflowJob {
  job_id: string;
  case_id: string;
  status: WorkflowStage;
  image_url: string;
  timestamp_start: string;
  timestamp_end?: string;
  error_message?: string;
  error_stage?: string;
  photo_id?: string;
}

interface WorkflowProgressPanelProps {
  caseId: string;
  onRetry?: () => void;
  onCancel?: () => void;
  className?: string;
}

function getStageIndex(status: WorkflowStage): number {
  const index = STAGES.findIndex(s => s.id === status);
  return index >= 0 ? index : 0;
}

function getStageStatus(
  stageId: WorkflowStage, 
  currentStatus: WorkflowStage
): 'completed' | 'current' | 'pending' | 'failed' {
  if (currentStatus === 'failed') {
    const currentIndex = getStageIndex(stageId);
    // Mark stages before the failed one as completed
    if (currentIndex < STAGES.length - 1) {
      return 'completed';
    }
    return 'failed';
  }
  
  const currentIndex = getStageIndex(currentStatus);
  const stageIndex = getStageIndex(stageId);
  
  if (stageIndex < currentIndex) return 'completed';
  if (stageIndex === currentIndex) return 'current';
  return 'pending';
}

export function WorkflowProgressPanel({ 
  caseId, 
  onRetry, 
  onCancel,
  className 
}: WorkflowProgressPanelProps) {
  const [jobs, setJobs] = useState<WorkflowJob[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch jobs for this case
  const fetchJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from('facial_analysis_jobs')
      .select('*')
      .eq('case_id', caseId)
      .order('timestamp_start', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error fetching jobs:', error);
      return;
    }

    if (data) {
      setJobs(data.map(job => ({
        job_id: job.job_id,
        case_id: job.case_id,
        status: job.status as WorkflowStage,
        image_url: job.image_url,
        timestamp_start: job.timestamp_start || '',
        timestamp_end: job.timestamp_end || undefined,
        error_message: job.error_message || undefined,
        error_stage: job.error_stage || undefined,
        photo_id: job.photo_id || undefined,
      })));
    }
    setIsLoading(false);
  }, [caseId]);

  // Initial fetch and polling
  useEffect(() => {
    fetchJobs();
    
    const interval = setInterval(fetchJobs, 3000); // Poll every 3s
    
    return () => clearInterval(interval);
  }, [fetchJobs]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('workflow-jobs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'facial_analysis_jobs',
          filter: `case_id=eq.${caseId}`
        },
        () => {
          fetchJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseId, fetchJobs]);

  const activeJob = jobs.find(j => 
    j.status !== 'success' && j.status !== 'failed'
  ) || jobs[0];

  const hasActiveJob = activeJob && 
    activeJob.status !== 'success' && 
    activeJob.status !== 'failed';

  if (isLoading) {
    return (
      <div className={cn("p-3 border-b border-border", className)}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Carregando jobs...</span>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className={cn("p-3 border-b border-border", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Workflow className="h-3.5 w-3.5" />
          <span className="text-xs">Nenhum job de análise encontrado</span>
        </div>
      </div>
    );
  }

  const currentStageIndex = activeJob ? getStageIndex(activeJob.status) : -1;
  const progress = activeJob?.status === 'success' 
    ? 100 
    : activeJob?.status === 'failed' 
      ? 0 
      : Math.round((currentStageIndex / (STAGES.length - 1)) * 100);

  return (
    <div className={cn("border-b border-border", className)}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Workflow n8n</span>
          {hasActiveJob && (
            <Badge variant="outline" className="h-5 text-[10px] animate-pulse bg-primary/10 border-primary/30 text-primary">
              Ativo
            </Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {isExpanded && activeJob && (
        <div className="px-3 pb-3 space-y-3">
          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Progresso</span>
              <span className="text-[10px] font-mono text-muted-foreground">{progress}%</span>
            </div>
            <Progress 
              value={progress} 
              className={cn(
                "h-1.5",
                activeJob.status === 'failed' && "[&>div]:bg-destructive"
              )} 
            />
          </div>

          {/* Stages */}
          <div className="space-y-1">
            {STAGES.map((stage, index) => {
              const stageStatus = getStageStatus(stage.id, activeJob.status);
              const StageIcon = stage.icon;
              
              return (
                <div 
                  key={stage.id}
                  className={cn(
                    "flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors",
                    stageStatus === 'current' && "bg-primary/10",
                    stageStatus === 'failed' && stage.id === 'success' && "bg-destructive/10"
                  )}
                >
                  {/* Status Icon */}
                  <div className="shrink-0">
                    {stageStatus === 'completed' && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    )}
                    {stageStatus === 'current' && (
                      <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                    )}
                    {stageStatus === 'pending' && (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                    )}
                    {stageStatus === 'failed' && (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </div>

                  {/* Stage Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <StageIcon className={cn(
                        "h-3 w-3",
                        stageStatus === 'completed' && "text-success",
                        stageStatus === 'current' && "text-primary",
                        stageStatus === 'pending' && "text-muted-foreground/40",
                        stageStatus === 'failed' && "text-destructive"
                      )} />
                      <span className={cn(
                        "text-xs font-medium",
                        stageStatus === 'completed' && "text-success",
                        stageStatus === 'current' && "text-primary",
                        stageStatus === 'pending' && "text-muted-foreground/40",
                        stageStatus === 'failed' && "text-destructive"
                      )}>
                        {stage.label}
                      </span>
                    </div>
                    {stageStatus === 'current' && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {stage.description}
                      </p>
                    )}
                  </div>

                  {/* Connector Line */}
                  {index < STAGES.length - 1 && (
                    <div className={cn(
                      "absolute left-[1.1rem] ml-px w-px h-4 -bottom-2.5",
                      stageStatus === 'completed' ? "bg-success" : "bg-border"
                    )} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Error Message */}
          {activeJob.status === 'failed' && activeJob.error_message && (
            <div className="p-2 rounded-md bg-destructive/10 border border-destructive/20">
              {activeJob.error_stage && (
                <p className="text-[10px] text-muted-foreground mb-1">
                  Estágio: <span className="font-mono">{activeJob.error_stage}</span>
                </p>
              )}
              <p className="text-xs text-destructive">
                {activeJob.error_message}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {activeJob.status === 'failed' && onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="h-7 text-xs gap-1.5 flex-1"
              >
                <RefreshCw className="h-3 w-3" />
                Tentar Novamente
              </Button>
            )}
            {hasActiveJob && onCancel && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
                Cancelar
              </Button>
            )}
          </div>

          {/* Timestamp */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/50">
            <span>
              Iniciado {formatDistanceToNow(new Date(activeJob.timestamp_start), { 
                addSuffix: true, 
                locale: ptBR 
              })}
            </span>
            {activeJob.timestamp_end && (
              <span>
                Finalizado em {formatDistanceToNow(new Date(activeJob.timestamp_end), {
                  addSuffix: true,
                  locale: ptBR
                })}
              </span>
            )}
          </div>

          {/* Job History */}
          {jobs.length > 1 && (
            <div className="pt-2 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground mb-1.5">Histórico recente</p>
              <div className="space-y-1">
                {jobs.slice(1, 4).map(job => (
                  <div 
                    key={job.job_id}
                    className="flex items-center gap-2 text-[10px] text-muted-foreground"
                  >
                    {job.status === 'success' && (
                      <CheckCircle2 className="h-3 w-3 text-success/60" />
                    )}
                    {job.status === 'failed' && (
                      <AlertCircle className="h-3 w-3 text-destructive/60" />
                    )}
                    {job.status !== 'success' && job.status !== 'failed' && (
                      <Circle className="h-3 w-3 text-muted-foreground/40" />
                    )}
                    <span className="truncate flex-1">
                      {job.status === 'success' ? 'Concluído' : 
                       job.status === 'failed' ? 'Falhou' : 
                       'Em progresso'}
                    </span>
                    <span className="font-mono shrink-0">
                      {formatDistanceToNow(new Date(job.timestamp_start), { 
                        addSuffix: true, 
                        locale: ptBR 
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
