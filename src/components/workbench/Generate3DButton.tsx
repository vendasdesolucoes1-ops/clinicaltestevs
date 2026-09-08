import { Box, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface Generate3DButtonProps {
  isGenerating: boolean;
  progress: number;
  status: 'idle' | 'creating' | 'processing' | 'finalizing' | 'completed' | 'error';
  error: string | null;
  /** A Meshy recusou por plano: o botão deixa de convidar a repetir. */
  planBlocked?: boolean;
  hasExistingScan: boolean;
  hasImage: boolean;
  onGenerate: () => void;
}

export function Generate3DButton({
  isGenerating,
  progress,
  status,
  error,
  planBlocked = false,
  hasExistingScan,
  hasImage,
  onGenerate,
}: Generate3DButtonProps) {
  const getStatusText = () => {
    switch (status) {
      case 'creating':
        return 'Iniciando...';
      case 'processing':
        return `Gerando modelo... ${Math.round(progress)}%`;
      case 'finalizing':
        return 'Salvando modelo...';
      case 'completed':
        return 'Modelo gerado!';
      case 'error':
        return planBlocked ? 'Indisponível no plano atual' : 'Erro na geração';
      default:
        return hasExistingScan ? 'Regenerar Modelo 3D' : 'Gerar Modelo 3D';
    }
  };

  const getIcon = () => {
    if (isGenerating) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (status === 'completed') {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    if (status === 'error') {
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
    return <Box className="h-4 w-4" />;
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={onGenerate}
        disabled={isGenerating || !hasImage || planBlocked}
        variant={hasExistingScan ? 'outline' : 'default'}
        className={cn(
          'w-full gap-2',
          status === 'completed' && 'border-green-500/50',
          status === 'error' && 'border-destructive/50'
        )}
      >
        {getIcon()}
        <span className="text-sm">{getStatusText()}</span>
      </Button>

      {isGenerating && (
        <div className="space-y-1">
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground text-center">
            {status === 'creating' && 'Conectando ao Meshy AI...'}
            {status === 'processing' && 'Processando imagem... (~1-3 min)'}
            {status === 'finalizing' && 'Baixando e salvando modelo...'}
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}

      {!hasImage && (
        <p className="text-xs text-muted-foreground text-center">
          Selecione uma foto para gerar o modelo 3D
        </p>
      )}
    </div>
  );
}
