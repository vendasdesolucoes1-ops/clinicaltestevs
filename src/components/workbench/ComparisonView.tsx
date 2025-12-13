import { useState } from 'react';
import { 
  SplitSquareHorizontal, 
  Layers, 
  ArrowLeftRight,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type ComparisonMode = 'wipe' | 'side-by-side' | 'overlay';

interface ComparisonViewProps {
  imageA: string;
  imageB: string;
  labelA?: string;
  labelB?: string;
}

export function ComparisonView({ 
  imageA, 
  imageB, 
  labelA = 'Versão A',
  labelB = 'Versão B'
}: ComparisonViewProps) {
  const [mode, setMode] = useState<ComparisonMode>('wipe');
  const [wipePosition, setWipePosition] = useState(50);
  const [overlayOpacity, setOverlayOpacity] = useState(50);

  return (
    <div className="relative h-full flex flex-col">
      {/* Mode Selector */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-lg border border-border p-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant={mode === 'wipe' ? 'tool-active' : 'ghost'} 
              size="icon-sm"
              onClick={() => setMode('wipe')}
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Slider Antes/Depois</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant={mode === 'side-by-side' ? 'tool-active' : 'ghost'} 
              size="icon-sm"
              onClick={() => setMode('side-by-side')}
            >
              <SplitSquareHorizontal className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Lado a Lado</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant={mode === 'overlay' ? 'tool-active' : 'ghost'} 
              size="icon-sm"
              onClick={() => setMode('overlay')}
            >
              <Layers className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sobreposição</TooltipContent>
        </Tooltip>
      </div>

      {/* Controls */}
      {mode === 'wipe' && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-3 py-2">
          <Label className="text-xs">Posição</Label>
          <Slider
            value={[wipePosition]}
            onValueChange={([v]) => setWipePosition(v)}
            min={0}
            max={100}
            step={1}
            className="w-24"
          />
          <span className="text-xs font-mono text-muted-foreground w-8">{wipePosition}%</span>
        </div>
      )}

      {mode === 'overlay' && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-3 py-2">
          <Label className="text-xs">Opacidade B</Label>
          <Slider
            value={[overlayOpacity]}
            onValueChange={([v]) => setOverlayOpacity(v)}
            min={0}
            max={100}
            step={1}
            className="w-24"
          />
          <span className="text-xs font-mono text-muted-foreground w-8">{overlayOpacity}%</span>
        </div>
      )}

      {/* Comparison Views */}
      <div className="flex-1 canvas-container overflow-hidden">
        {mode === 'wipe' && (
          <div className="relative w-full h-full">
            {/* Image B (background) */}
            <img 
              src={imageB || '/placeholder.svg'} 
              alt={labelB}
              className="absolute inset-0 w-full h-full object-contain"
            />
            {/* Image A (foreground with clip) */}
            <div 
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${wipePosition}%` }}
            >
              <img 
                src={imageA || '/placeholder.svg'} 
                alt={labelA}
                className="w-full h-full object-contain"
                style={{ 
                  width: `${100 / (wipePosition / 100)}%`,
                  maxWidth: 'none'
                }}
              />
            </div>
            {/* Slider handle */}
            <div 
              className="absolute top-0 bottom-0 w-1 bg-primary cursor-ew-resize"
              style={{ left: `${wipePosition}%` }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg">
                <ArrowLeftRight className="h-4 w-4 text-primary-foreground" />
              </div>
            </div>
            {/* Labels */}
            <div className="absolute bottom-4 left-4 px-2 py-1 rounded bg-version-a/90 text-xs font-medium text-primary-foreground">
              {labelA}
            </div>
            <div className="absolute bottom-4 right-4 px-2 py-1 rounded bg-version-b/90 text-xs font-medium text-primary-foreground">
              {labelB}
            </div>
          </div>
        )}

        {mode === 'side-by-side' && (
          <div className="flex h-full gap-1">
            <div className="flex-1 relative">
              <img 
                src={imageA || '/placeholder.svg'} 
                alt={labelA}
                className="w-full h-full object-contain"
              />
              <div className="absolute bottom-4 left-4 px-2 py-1 rounded bg-version-a/90 text-xs font-medium text-primary-foreground">
                {labelA}
              </div>
            </div>
            <div className="flex-1 relative">
              <img 
                src={imageB || '/placeholder.svg'} 
                alt={labelB}
                className="w-full h-full object-contain"
              />
              <div className="absolute bottom-4 right-4 px-2 py-1 rounded bg-version-b/90 text-xs font-medium text-primary-foreground">
                {labelB}
              </div>
            </div>
          </div>
        )}

        {mode === 'overlay' && (
          <div className="relative w-full h-full">
            <img 
              src={imageA || '/placeholder.svg'} 
              alt={labelA}
              className="absolute inset-0 w-full h-full object-contain"
            />
            <img 
              src={imageB || '/placeholder.svg'} 
              alt={labelB}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ opacity: overlayOpacity / 100 }}
            />
            <div className="absolute bottom-4 left-4 flex gap-2">
              <div className="px-2 py-1 rounded bg-version-a/90 text-xs font-medium text-primary-foreground flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {labelA}
              </div>
              <div className="px-2 py-1 rounded bg-version-b/90 text-xs font-medium text-primary-foreground flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {labelB} ({overlayOpacity}%)
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
