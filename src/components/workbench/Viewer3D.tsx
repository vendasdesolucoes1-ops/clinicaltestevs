import { useRef, useEffect, useState } from 'react';
import { 
  RotateCcw, 
  ZoomIn, 
  ZoomOut, 
  Move3D,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Viewer3DProps {
  modelUrl?: string;
  isProcessing?: boolean;
}

export function Viewer3D({ modelUrl, isProcessing }: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - lastPos.x;
    const deltaY = e.clientY - lastPos.y;
    setRotation(r => ({
      x: r.x + deltaY * 0.5,
      y: r.y + deltaX * 0.5,
    }));
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleReset = () => {
    setRotation({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleZoomIn = () => setZoom(z => Math.min(3, z * 1.2));
  const handleZoomOut = () => setZoom(z => Math.max(0.3, z / 1.2));

  return (
    <div className="relative h-full flex flex-col">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-lg border border-border p-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Resetar vista</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>
      </div>

      {/* 3D View */}
      <div 
        ref={containerRef}
        className="flex-1 canvas-container cursor-grab active:cursor-grabbing flex items-center justify-center overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {isProcessing ? (
          <div className="text-center">
            <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Modelo 3D sendo gerado...</p>
            <p className="text-xs text-muted-foreground mt-1">Isso pode levar alguns minutos</p>
          </div>
        ) : modelUrl ? (
          // Placeholder 3D representation
          <div 
            className="relative transition-transform duration-100"
            style={{
              transform: `perspective(1000px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) scale(${zoom})`,
            }}
          >
            {/* Simple 3D face placeholder */}
            <div className="w-48 h-64 relative">
              <div className="absolute inset-0 rounded-[50%] bg-gradient-to-b from-secondary to-muted border border-border shadow-lg" />
              <div className="absolute top-1/4 left-1/4 w-1/2 flex justify-between px-2">
                <div className="w-4 h-2 rounded-full bg-muted-foreground/20" />
                <div className="w-4 h-2 rounded-full bg-muted-foreground/20" />
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-3 h-4 rounded-full bg-muted-foreground/10" />
              <div className="absolute top-2/3 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-muted-foreground/10" />
            </div>
          </div>
        ) : (
          <div className="text-center">
            <Move3D className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Modelo 3D não disponível</p>
            <p className="text-xs text-muted-foreground mt-1">Execute uma simulação para gerar o modelo</p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-3 py-1.5">
        <span className="text-xs text-muted-foreground font-mono">
          Rotação: {Math.round(rotation.x)}°, {Math.round(rotation.y)}°
        </span>
      </div>
    </div>
  );
}
