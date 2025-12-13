import { useState } from 'react';
import { 
  Move, 
  Scissors, 
  Circle, 
  PenTool, 
  Type, 
  Eraser,
  Undo2,
  Redo2,
  RotateCcw,
  Sliders,
  Play,
  Check,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { type SimulationJob } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export type ToolType = 'select' | 'warp' | 'volume' | 'incision' | 'suture' | 'annotate' | 'eraser';

interface ToolPanelProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  processingJob: SimulationJob | null;
}

const TOOLS: { id: ToolType; icon: React.ElementType; label: string; tooltip: string }[] = [
  { id: 'select', icon: Move, label: 'Selecionar', tooltip: 'Selecione e mova elementos' },
  { id: 'warp', icon: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M12 3v18M3 12h18" strokeLinecap="round" />
      <path d="M8 8c0-2 2-4 4-4s4 2 4 4M8 16c0 2 2 4 4 4s4-2 4-4" strokeLinecap="round" />
    </svg>
  ), label: 'Puxar Pele', tooltip: 'Arraste para simular tração de pele' },
  { id: 'volume', icon: Circle, label: 'Volume', tooltip: 'Adicione ou remova volume tecidual' },
  { id: 'incision', icon: Scissors, label: 'Incisão', tooltip: 'Desenhe linhas de corte cirúrgico' },
  { id: 'suture', icon: PenTool, label: 'Sutura', tooltip: 'Simule pontos de sutura' },
  { id: 'annotate', icon: Type, label: 'Anotar', tooltip: 'Adicione textos e marcações' },
  { id: 'eraser', icon: Eraser, label: 'Borracha', tooltip: 'Apague marcações' },
];

const SUTURE_TYPES = [
  { value: 'simples', label: 'Ponto Simples' },
  { value: 'donati', label: 'Donati' },
  { value: 'subcuticular', label: 'Subcuticular' },
  { value: 'colchoeiro', label: 'Colchoeiro' },
];

const INCISION_TYPES = [
  { value: 'linear', label: 'Linear' },
  { value: 'curvo', label: 'Curvo' },
  { value: 'zetaplastia', label: 'Zetaplastia' },
];

export function ToolPanel({ 
  activeTool, 
  onToolChange, 
  onUndo, 
  onRedo,
  canUndo,
  canRedo,
  processingJob
}: ToolPanelProps) {
  const [toolParams, setToolParams] = useState({
    brushSize: 20,
    intensity: 50,
    smoothing: 30,
    sutureType: 'simples',
    sutureSpacing: 5,
    sutureTension: 50,
    incisionType: 'linear',
    incisionDepth: 50,
  });

  const [simParams, setSimParams] = useState({
    preserveSymmetry: true,
    avoidEyeDistortion: true,
    maintainMouthLine: true,
    clinicalObjective: '',
    quality: 'qualidade' as 'rapido' | 'qualidade',
    targetVersion: 'A' as 'A' | 'B',
  });

  const handleRunSimulation = () => {
    toast.success('Simulação iniciada', {
      description: `Versão ${simParams.targetVersion} • Modo ${simParams.quality === 'rapido' ? 'rápido' : 'qualidade'}`,
    });
  };

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      <ScrollArea className="flex-1">
        {/* Tools */}
        <div className="panel-section">
          <div className="panel-title">Ferramentas</div>
          <div className="grid grid-cols-4 gap-1">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Tooltip key={tool.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === tool.id ? 'tool-active' : 'tool'}
                      size="icon"
                      onClick={() => onToolChange(tool.id)}
                      className="h-10 w-10"
                    >
                      <Icon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p className="font-medium">{tool.label}</p>
                    <p className="text-xs text-muted-foreground">{tool.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          
          {/* Undo/Redo */}
          <div className="flex gap-1 mt-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="flex-1"
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  <span className="text-xs">Z</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Desfazer (Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="flex-1"
                >
                  <Redo2 className="h-4 w-4 mr-1" />
                  <span className="text-xs">Y</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refazer (Y)</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Tool Parameters */}
        <div className="panel-section">
          <div className="panel-title">Parâmetros da Ferramenta</div>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Tamanho do Pincel</Label>
                <span className="text-xs text-muted-foreground font-mono">{toolParams.brushSize}px</span>
              </div>
              <Slider
                value={[toolParams.brushSize]}
                onValueChange={([v]) => setToolParams(p => ({ ...p, brushSize: v }))}
                min={5}
                max={100}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Intensidade</Label>
                <span className="text-xs text-muted-foreground font-mono">{toolParams.intensity}%</span>
              </div>
              <Slider
                value={[toolParams.intensity]}
                onValueChange={([v]) => setToolParams(p => ({ ...p, intensity: v }))}
                min={1}
                max={100}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Suavização</Label>
                <span className="text-xs text-muted-foreground font-mono">{toolParams.smoothing}%</span>
              </div>
              <Slider
                value={[toolParams.smoothing]}
                onValueChange={([v]) => setToolParams(p => ({ ...p, smoothing: v }))}
                min={0}
                max={100}
                step={1}
              />
            </div>

            {activeTool === 'suture' && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs">Tipo de Sutura</Label>
                  <Select
                    value={toolParams.sutureType}
                    onValueChange={(v) => setToolParams(p => ({ ...p, sutureType: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUTURE_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Espaçamento</Label>
                    <span className="text-xs text-muted-foreground font-mono">{toolParams.sutureSpacing}mm</span>
                  </div>
                  <Slider
                    value={[toolParams.sutureSpacing]}
                    onValueChange={([v]) => setToolParams(p => ({ ...p, sutureSpacing: v }))}
                    min={2}
                    max={15}
                    step={1}
                  />
                </div>
              </>
            )}

            {activeTool === 'incision' && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs">Tipo de Incisão</Label>
                  <Select
                    value={toolParams.incisionType}
                    onValueChange={(v) => setToolParams(p => ({ ...p, incisionType: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INCISION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* Simulation Parameters */}
        <div className="panel-section">
          <div className="panel-title flex items-center gap-2">
            <Sliders className="h-3 w-3" />
            Parâmetros da Simulação (IA)
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              {[
                { key: 'preserveSymmetry', label: 'Preservar simetria facial' },
                { key: 'avoidEyeDistortion', label: 'Evitar distorção de olhos' },
                { key: 'maintainMouthLine', label: 'Manter linha de boca' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={simParams[key as keyof typeof simParams] as boolean}
                    onCheckedChange={(checked) => 
                      setSimParams(p => ({ ...p, [key]: checked }))
                    }
                  />
                  <span className="text-xs text-foreground">{label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Objetivo Clínico</Label>
              <Input
                placeholder="Ex: Reconstrução de área malar..."
                value={simParams.clinicalObjective}
                onChange={(e) => setSimParams(p => ({ ...p, clinicalObjective: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Versão</Label>
                <Select
                  value={simParams.targetVersion}
                  onValueChange={(v: 'A' | 'B') => setSimParams(p => ({ ...p, targetVersion: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Versão A</SelectItem>
                    <SelectItem value="B">Versão B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Modo</Label>
                <Select
                  value={simParams.quality}
                  onValueChange={(v: 'rapido' | 'qualidade') => setSimParams(p => ({ ...p, quality: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rapido">Rápido</SelectItem>
                    <SelectItem value="qualidade">Qualidade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={handleRunSimulation}
              disabled={!!processingJob}
            >
              <Play className="h-4 w-4 mr-2" />
              Rodar Simulação (IA)
            </Button>
          </div>
        </div>

        {/* Processing Queue */}
        <div className="panel-section">
          <div className="panel-title">Fila e Execuções</div>
          {processingJob ? (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-warning animate-pulse" />
                <span className="text-sm font-medium text-foreground">Processando...</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-warning/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-warning rounded-full transition-all duration-500"
                    style={{ width: `${processingJob.progress}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-warning">{processingJob.progress}%</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-muted-foreground">
              <Check className="h-4 w-4" />
              <span className="text-xs">Nenhuma simulação em execução</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
