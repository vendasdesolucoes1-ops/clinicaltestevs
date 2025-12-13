// Canvas Status Bar - Bottom status information
import { 
  MousePointer2,
  Move,
  AlertTriangle
} from 'lucide-react';
import { ToolType } from './ToolPanel';
import { Point } from '@/hooks/useCanvasState';
import { cn } from '@/lib/utils';

interface CanvasStatusBarProps {
  activeTool: ToolType;
  cursorPosition: Point;
  isPanning: boolean;
  zoom: number;
  objectCount: number;
}

const TOOL_LABELS: Record<ToolType, string> = {
  select: 'Selecionar',
  warp: 'Puxar Pele',
  volume: 'Volume',
  incision: 'Incisão',
  suture: 'Sutura',
  annotate: 'Anotar',
  eraser: 'Borracha',
};

export function CanvasStatusBar({
  activeTool,
  cursorPosition,
  isPanning,
  zoom,
  objectCount,
}: CanvasStatusBarProps) {
  return (
    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
      {/* Left - Tool info */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 bg-card/95 backdrop-blur-sm rounded-lg border border-border px-3 py-1.5 shadow-sm">
          {isPanning ? (
            <>
              <Move className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-primary font-medium">Pan (Espaço)</span>
            </>
          ) : (
            <>
              <MousePointer2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs">
                <span className="text-muted-foreground">Ferramenta: </span>
                <span className="text-foreground font-medium">{TOOL_LABELS[activeTool]}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Center - Warning */}
      <div className="flex items-center gap-2 bg-warning/10 backdrop-blur-sm rounded-lg border border-warning/20 px-3 py-1.5 shadow-sm">
        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        <span className="text-xs text-warning">Simulação para planejamento — não substitui avaliação clínica</span>
      </div>

      {/* Right - Coordinates */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-3 bg-card/95 backdrop-blur-sm rounded-lg border border-border px-3 py-1.5 shadow-sm">
          <span className="text-xs text-muted-foreground font-mono">
            X: {Math.round(cursorPosition.x)} Y: {Math.round(cursorPosition.y)}
          </span>
          <span className="w-px h-3 bg-border" />
          <span className="text-xs text-muted-foreground">
            {objectCount} objetos
          </span>
        </div>
      </div>
    </div>
  );
}
