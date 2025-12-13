import { useRef, useEffect, useState, useCallback } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Grid3X3, 
  Ruler, 
  Layers,
  Eye,
  EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { type ToolType } from './ToolPanel';
import { cn } from '@/lib/utils';

interface Canvas2DProps {
  imageUrl: string;
  activeTool: ToolType;
  onAction: (action: { type: string; data: any }) => void;
}

interface Point {
  x: number;
  y: number;
}

export function Canvas2D({ imageUrl, activeTool, onAction }: Canvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<Point>({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showRuler, setShowRuler] = useState(true);
  const [layers, setLayers] = useState({
    original: true,
    markings: true,
    simulation: true,
  });

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [drawings, setDrawings] = useState<Point[][]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
    };
    img.src = imageUrl || '/placeholder.svg';
  }, [imageUrl]);

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !image) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply transform
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(100, 150, 200, 0.1)';
      ctx.lineWidth = 1 / zoom;
      const gridSize = 50;
      for (let x = 0; x < canvas.width / zoom; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height / zoom);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height / zoom; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width / zoom, y);
        ctx.stroke();
      }
    }

    // Draw image
    if (layers.original) {
      const scale = Math.min(
        (canvas.width / zoom - 40) / image.width,
        (canvas.height / zoom - 40) / image.height
      );
      const x = (canvas.width / zoom - image.width * scale) / 2;
      const y = (canvas.height / zoom - image.height * scale) / 2;
      ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
    }

    // Draw markings
    if (layers.markings) {
      ctx.strokeStyle = 'hsl(195, 85%, 50%)';
      ctx.lineWidth = 2 / zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      [...drawings, currentPath].forEach(path => {
        if (path.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        path.slice(1).forEach(point => {
          ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
      });
    }

    // Draw ruler
    if (showRuler) {
      ctx.restore();
      ctx.save();
      
      // Ruler background
      ctx.fillStyle = 'hsl(var(--muted) / 0.8)';
      ctx.fillRect(0, canvas.height - 24, canvas.width, 24);
      ctx.fillRect(0, 0, 24, canvas.height);

      // Ruler marks
      ctx.strokeStyle = 'hsl(var(--muted-foreground))';
      ctx.fillStyle = 'hsl(var(--muted-foreground))';
      ctx.font = '9px JetBrains Mono';
      ctx.lineWidth = 1;

      const step = 50 * zoom;
      for (let i = 0; i < canvas.width; i += step) {
        const x = i + pan.x % step;
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - 24);
        ctx.lineTo(x, canvas.height - 16);
        ctx.stroke();
        ctx.fillText(`${Math.round((x - pan.x) / zoom)}`, x + 2, canvas.height - 6);
      }
      for (let i = 0; i < canvas.height; i += step) {
        const y = i + pan.y % step;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(8, y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [image, zoom, pan, showGrid, showRuler, layers, drawings, currentPath]);

  // Resize canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Get canvas coordinates
  const getCanvasPoint = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || activeTool === 'select') {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    } else {
      setIsDrawing(true);
      setCurrentPath([getCanvasPoint(e)]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: pan.x + e.clientX - lastPanPoint.x,
        y: pan.y + e.clientY - lastPanPoint.y,
      });
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    } else if (isDrawing) {
      setCurrentPath([...currentPath, getCanvasPoint(e)]);
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && currentPath.length > 1) {
      setDrawings([...drawings, currentPath]);
      onAction({ type: 'draw', data: currentPath });
    }
    setIsPanning(false);
    setIsDrawing(false);
    setCurrentPath([]);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, zoom * delta));
    setZoom(newZoom);
  };

  const handleZoomIn = () => setZoom(z => Math.min(5, z * 1.2));
  const handleZoomOut = () => setZoom(z => Math.max(0.1, z / 1.2));
  const handleFit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="relative h-full flex flex-col">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between">
        <div className="flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-lg border border-border p-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Diminuir zoom</TooltipContent>
          </Tooltip>
          
          <div className="w-24 px-2">
            <Slider
              value={[zoom * 100]}
              onValueChange={([v]) => setZoom(v / 100)}
              min={10}
              max={500}
              step={10}
            />
          </div>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Aumentar zoom</TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={handleFit}>
                <Maximize className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ajustar à tela</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={showGrid ? 'tool-active' : 'ghost'} 
                size="icon-sm" 
                onClick={() => setShowGrid(!showGrid)}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Grid</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={showRuler ? 'tool-active' : 'ghost'} 
                size="icon-sm" 
                onClick={() => setShowRuler(!showRuler)}
              >
                <Ruler className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Régua</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-lg border border-border p-1">
          <span className="text-xs text-muted-foreground font-mono px-2">
            {Math.round(zoom * 100)}%
          </span>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <Layers className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                checked={layers.original}
                onCheckedChange={(checked) => setLayers(l => ({ ...l, original: !!checked }))}
              >
                Original
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={layers.markings}
                onCheckedChange={(checked) => setLayers(l => ({ ...l, markings: !!checked }))}
              >
                Marcações
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={layers.simulation}
                onCheckedChange={(checked) => setLayers(l => ({ ...l, simulation: !!checked }))}
              >
                Simulação
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Canvas */}
      <div 
        ref={containerRef}
        className="flex-1 canvas-container cursor-crosshair"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={cn(
            "w-full h-full",
            isPanning && "cursor-grabbing"
          )}
        />
      </div>

      {/* Status bar */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
        <div className="flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-3 py-1.5">
          <span className="text-xs text-muted-foreground">
            Ferramenta: <span className="text-foreground font-medium">{activeTool}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-3 py-1.5">
          <span className="text-xs text-muted-foreground font-mono">
            Pan: {Math.round(pan.x)}, {Math.round(pan.y)}
          </span>
        </div>
      </div>
    </div>
  );
}
