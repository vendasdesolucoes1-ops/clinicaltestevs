// CanvasContextBar - Floating contextual toolbar for canvas interactions
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2,
  Move,
  MousePointer2,
  Hand,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ToolType } from './ToolPanel';

interface CanvasContextBarProps {
  activeTool: ToolType;
  isPanMode: boolean;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onFitToScreen?: () => void;
  className?: string;
}

const TOOL_INSTRUCTIONS: Record<ToolType | 'pan', { action: string; hint: string }> = {
  select: { 
    action: 'Puxar Pele', 
    hint: 'Clique e arraste para simular tração de pele na direção do movimento' 
  },
  warp: { 
    action: 'Selecionar', 
    hint: 'Clique para selecionar • Arraste para mover • Delete para remover' 
  },
  volume: { 
    action: 'Volume', 
    hint: 'Clique para adicionar volume • Shift+clique para remover' 
  },
  incision: { 
    action: 'Incisão', 
    hint: 'Clique e arraste para desenhar linha de corte cirúrgico' 
  },
  suture: { 
    action: 'Sutura', 
    hint: 'Clique e arraste para criar linha de pontos de sutura' 
  },
  annotate: { 
    action: 'Anotar', 
    hint: 'Clique para adicionar texto • Arraste para posicionar' 
  },
  measure: { 
    action: 'Medir', 
    hint: 'Clique em 2 pontos QUAISQUER da imagem para medir distância (cm)' 
  },
  angle: { 
    action: 'Ângulo', 
    hint: 'Clique em 3 pontos do mesh • O 2º ponto será o vértice do ângulo' 
  },
  eraser: { 
    action: 'Borracha', 
    hint: 'Clique em um elemento para removê-lo' 
  },
  pan: { 
    action: 'Navegando', 
    hint: 'Solte Space para voltar à ferramenta anterior' 
  },
};

export function CanvasContextBar({
  activeTool,
  isPanMode,
  zoom = 100,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitToScreen,
  className,
}: CanvasContextBarProps) {
  const currentTool = isPanMode ? 'pan' : activeTool;
  const instruction = TOOL_INSTRUCTIONS[currentTool];

  return (
    <div 
      className={cn(
        "absolute bottom-4 left-1/2 -translate-x-1/2 z-40",
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-card/95 backdrop-blur-sm border border-border shadow-lg",
        className
      )}
    >
      {/* Current Tool Indicator */}
      <div className="flex items-center gap-2">
        {isPanMode ? (
          <Hand className="h-4 w-4 text-primary" />
        ) : (
          <MousePointer2 className="h-4 w-4 text-primary" />
        )}
        <Badge variant="secondary" className="text-xs font-medium">
          {instruction.action}
        </Badge>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Instructions */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground max-w-[300px]">
        <Info className="h-3 w-3 shrink-0" />
        <span className="truncate">{instruction.hint}</span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onZoomOut}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Diminuir zoom</TooltipContent>
        </Tooltip>

        <span className="text-xs text-muted-foreground font-mono w-10 text-center">
          {zoom}%
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onZoomIn}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Aumentar zoom</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onResetView}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Resetar visualização</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onFitToScreen}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ajustar à tela</TooltipContent>
        </Tooltip>
      </div>

      {/* Keyboard Shortcut Hint */}
      <div className="hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Space</kbd>
        <span>para pan</span>
      </div>
    </div>
  );
}
