// Analysis Status Component - Shows async job status
import { Loader2, AlertCircle, CheckCircle2, RefreshCw, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { AnalysisJobStatus } from '@/hooks/useN8nFacialAnalysis';

interface AnalysisStatusProps {
  status: AnalysisJobStatus;
  errorMessage?: string;
  errorStage?: string;
  onRetry?: () => void;
  onCancel?: () => void;
  className?: string;
}

export function AnalysisStatus({ 
  status, 
  errorMessage, 
  errorStage,
  onRetry,
  onCancel,
  className 
}: AnalysisStatusProps) {
  if (status === 'idle') {
    return null;
  }

  return (
    <div className={cn(
      "rounded-lg border p-4",
      status === 'processing' && "bg-primary/5 border-primary/20",
      status === 'completed' && "bg-success/10 border-success/20",
      status === 'failed' && "bg-destructive/10 border-destructive/20",
      className
    )}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="shrink-0 mt-0.5">
          {status === 'processing' && (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          )}
          {status === 'completed' && (
            <CheckCircle2 className="h-5 w-5 text-success" />
          )}
          {status === 'failed' && (
            <AlertCircle className="h-5 w-5 text-destructive" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className={cn(
            "text-sm font-medium",
            status === 'processing' && "text-primary",
            status === 'completed' && "text-success",
            status === 'failed' && "text-destructive"
          )}>
            {status === 'processing' && 'Analisando Face...'}
            {status === 'completed' && 'Análise Concluída'}
            {status === 'failed' && 'Análise Falhou'}
          </h4>

          {status === 'processing' && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">
                Detectando landmarks faciais e calculando métricas de simetria...
              </p>
              <div className="flex items-center gap-2">
                <Progress value={undefined} className="h-1.5 flex-1" />
                <Clock className="h-3 w-3 text-muted-foreground" />
              </div>
              {onCancel && (
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
          )}

          {status === 'completed' && (
            <p className="text-xs text-muted-foreground mt-1">
              Landmarks detectados com sucesso. O mesh facial está disponível.
            </p>
          )}

          {status === 'failed' && (
            <div className="mt-2 space-y-2">
              {errorStage && (
                <p className="text-xs text-muted-foreground">
                  Estágio: <span className="font-mono">{errorStage}</span>
                </p>
              )}
              <p className="text-xs text-destructive/80">
                {errorMessage || 'Ocorreu um erro durante o processamento.'}
              </p>
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  className="h-7 text-xs gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" />
                  Tentar Novamente
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact inline version for the status bar
interface AnalysisStatusBarProps {
  status: AnalysisJobStatus;
  onRetry?: () => void;
  onCancel?: () => void;
}

export function AnalysisStatusBar({ status, onRetry, onCancel }: AnalysisStatusBarProps) {
  if (status === 'idle' || status === 'completed') {
    return null;
  }

  return (
    <div className={cn(
      "h-10 border-t px-4 flex items-center gap-3 shrink-0",
      status === 'processing' && "bg-primary/10 border-primary/20",
      status === 'failed' && "bg-destructive/10 border-destructive/20"
    )}>
      {status === 'processing' && (
        <>
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
          <span className="text-sm text-foreground">Processando análise facial...</span>
          <div className="flex-1 max-w-xs h-1.5 bg-primary/20 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-pulse w-2/3" />
          </div>
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
              Cancelar
            </Button>
          )}
        </>
      )}
      
      {status === 'failed' && (
        <>
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">Análise falhou</span>
          {onRetry && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="h-6 px-2 text-xs gap-1 text-destructive hover:text-destructive"
            >
              <RefreshCw className="h-3 w-3" />
              Repetir
            </Button>
          )}
        </>
      )}
    </div>
  );
}
