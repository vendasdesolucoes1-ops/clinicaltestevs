// Canvas Toolbar - Top toolbar for canvas controls
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Grid3X3, 
  Ruler, 
  Layers,
  RotateCcw,
  Keyboard,
  Info
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
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { KEYBOARD_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';
import { LayerVisibility, LayerOpacity } from '@/hooks/useCanvasState';
import { Label } from '@/components/ui/label';

interface CanvasToolbarProps {
  zoom: number;
  showGrid: boolean;
  showRuler: boolean;
  layers: LayerVisibility;
  layerOpacity: LayerOpacity;
  onZoomChange: (zoom: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onToggleGrid: () => void;
  onToggleRuler: () => void;
  onLayerVisibilityChange: (layer: keyof LayerVisibility, visible: boolean) => void;
  onLayerOpacityChange: (layer: keyof LayerOpacity, opacity: number) => void;
}

export function CanvasToolbar({
  zoom,
  showGrid,
  showRuler,
  layers,
  layerOpacity,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onToggleGrid,
  onToggleRuler,
  onLayerVisibilityChange,
  onLayerOpacityChange,
}: CanvasToolbarProps) {
  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
      {/* Left side - Zoom and view controls */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-1 bg-card/95 backdrop-blur-sm rounded-lg border border-border p-1 shadow-sm">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Diminuir zoom</TooltipContent>
          </Tooltip>
          
          <div className="w-20 px-2">
            <Slider
              value={[zoom * 100]}
              onValueChange={([v]) => onZoomChange(v / 100)}
              min={10}
              max={500}
              step={10}
            />
          </div>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Aumentar zoom</TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onFitToScreen}>
                <Maximize className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ajustar à tela</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1 bg-card/95 backdrop-blur-sm rounded-lg border border-border p-1 shadow-sm">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={showGrid ? 'tool-active' : 'ghost'} 
                size="icon-sm" 
                onClick={onToggleGrid}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Grid de referência</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={showRuler ? 'tool-active' : 'ghost'} 
                size="icon-sm" 
                onClick={onToggleRuler}
              >
                <Ruler className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Régua de medidas</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Right side - Layers and info */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-1 bg-card/95 backdrop-blur-sm rounded-lg border border-border p-1 shadow-sm">
          <span className="text-xs text-muted-foreground font-mono px-2 min-w-[48px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          
          {/* Layers dropdown with opacity control */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <Layers className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Camadas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              {/* Original */}
              <div className="px-2 py-1.5">
                <DropdownMenuCheckboxItem
                  checked={layers.original}
                  onCheckedChange={(checked) => onLayerVisibilityChange('original', !!checked)}
                >
                  Foto Original
                </DropdownMenuCheckboxItem>
                {layers.original && (
                  <div className="flex items-center gap-2 ml-6 mt-1">
                    <Slider
                      value={[layerOpacity.original]}
                      onValueChange={([v]) => onLayerOpacityChange('original', v)}
                      min={0}
                      max={100}
                      step={5}
                      className="w-20"
                    />
                    <span className="text-xs text-muted-foreground w-8">{layerOpacity.original}%</span>
                  </div>
                )}
              </div>

              {/* Markings */}
              <div className="px-2 py-1.5">
                <DropdownMenuCheckboxItem
                  checked={layers.markings}
                  onCheckedChange={(checked) => onLayerVisibilityChange('markings', !!checked)}
                >
                  Marcações
                </DropdownMenuCheckboxItem>
                {layers.markings && (
                  <div className="flex items-center gap-2 ml-6 mt-1">
                    <Slider
                      value={[layerOpacity.markings]}
                      onValueChange={([v]) => onLayerOpacityChange('markings', v)}
                      min={0}
                      max={100}
                      step={5}
                      className="w-20"
                    />
                    <span className="text-xs text-muted-foreground w-8">{layerOpacity.markings}%</span>
                  </div>
                )}
              </div>

              {/* Simulation */}
              <div className="px-2 py-1.5">
                <DropdownMenuCheckboxItem
                  checked={layers.simulation}
                  onCheckedChange={(checked) => onLayerVisibilityChange('simulation', !!checked)}
                >
                  Simulação
                </DropdownMenuCheckboxItem>
                {layers.simulation && (
                  <div className="flex items-center gap-2 ml-6 mt-1">
                    <Slider
                      value={[layerOpacity.simulation]}
                      onValueChange={([v]) => onLayerOpacityChange('simulation', v)}
                      min={0}
                      max={100}
                      step={5}
                      className="w-20"
                    />
                    <span className="text-xs text-muted-foreground w-8">{layerOpacity.simulation}%</span>
                  </div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Keyboard shortcuts modal */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <Keyboard className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Keyboard className="h-5 w-5" />
                  Atalhos de Teclado
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-2 py-4">
                {KEYBOARD_SHORTCUTS.map(({ key, description }) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <span className="text-sm text-muted-foreground">{description}</span>
                    <kbd className="px-2 py-1 rounded bg-muted border text-xs font-mono">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
