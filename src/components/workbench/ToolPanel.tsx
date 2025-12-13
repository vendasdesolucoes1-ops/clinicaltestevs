// Tool Panel - Right side panel with tools and simulation controls
import { useState, useCallback } from 'react';
import { 
  Move, 
  Scissors, 
  Circle, 
  PenTool, 
  Type, 
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Sliders,
  Play,
  Check,
  Clock,
  AlertCircle,
  Loader2,
  Plus,
  Minus,
  Grid3X3,
  Eye,
  EyeOff,
  Link2
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
import { useCanvasState } from '@/hooks/useCanvasState';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { type MeshDensity, type SymmetryResult } from '@/types/facialLandmarks';
import { type MeshEditMode } from '@/hooks/useFacialAnalysis';
import { SymmetryIndicator } from './SymmetryIndicator';

export type ToolType = 'select' | 'warp' | 'volume' | 'incision' | 'suture' | 'annotate' | 'eraser';

interface ToolPanelProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  processingJob: SimulationJob | null;
  onStartSimulation: () => void;
  // Mesh controls
  showMesh: boolean;
  onShowMeshChange: (show: boolean) => void;
  meshOpacity: number;
  onMeshOpacityChange: (opacity: number) => void;
  meshDensity: MeshDensity;
  onMeshDensityChange: (density: MeshDensity) => void;
  meshEditMode: MeshEditMode;
  onMeshEditModeChange: (mode: MeshEditMode) => void;
  isConnecting: boolean;
  onCancelConnection: () => void;
  isAnalyzingFace: boolean;
  symmetryResult: SymmetryResult | null;
  onGetCanvasImage?: () => string | null;
}

const TOOLS: { id: ToolType; icon: React.ElementType; label: string; tooltip: string; shortcut: string }[] = [
  { id: 'select', icon: Move, label: 'Selecionar', tooltip: 'Selecione e mova elementos', shortcut: '1' },
  { id: 'warp', icon: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M12 3v18M3 12h18" strokeLinecap="round" />
      <path d="M8 8c0-2 2-4 4-4s4 2 4 4M8 16c0 2 2 4 4 4s4-2 4-4" strokeLinecap="round" />
    </svg>
  ), label: 'Puxar Pele', tooltip: 'Clique e arraste para simular tração de pele. Ajuste raio e intensidade.', shortcut: '2' },
  { id: 'volume', icon: Circle, label: 'Volume', tooltip: 'Adicione (+) ou remova (-) volume tecidual com o brush.', shortcut: '3' },
  { id: 'incision', icon: Scissors, label: 'Incisão', tooltip: 'Desenhe linhas de corte cirúrgico. Configure tipo e profundidade.', shortcut: '4' },
  { id: 'suture', icon: PenTool, label: 'Sutura', tooltip: 'Simule pontos de sutura ao longo de uma linha.', shortcut: '5' },
  { id: 'annotate', icon: Type, label: 'Anotar', tooltip: 'Adicione textos, setas e marcações livres.', shortcut: '6' },
  { id: 'eraser', icon: Eraser, label: 'Borracha', tooltip: 'Apague marcações individuais.', shortcut: '7' },
];

const SUTURE_TYPES = [
  { value: 'simples', label: 'Ponto Simples' },
  { value: 'donati', label: 'Donati' },
  { value: 'subcuticular', label: 'Subcuticular' },
  { value: 'colchoeiro', label: 'Colchoeiro' },
  { value: 'continuo', label: 'Contínuo' },
];

const INCISION_TYPES = [
  { value: 'linear', label: 'Linear' },
  { value: 'curvo', label: 'Curvo' },
  { value: 'zetaplastia', label: 'Zetaplastia' },
  { value: 'wplastia', label: 'W-plastia' },
];

const INSTRUMENTS = [
  { value: 'bisturi_15', label: 'Bisturi nº 15' },
  { value: 'bisturi_11', label: 'Bisturi nº 11' },
  { value: 'bisturi_10', label: 'Bisturi nº 10' },
  { value: 'eletrico', label: 'Elétrico' },
];

const SIMULATION_STEPS = [
  'Preparando dados...',
  'Analisando geometria facial...',
  'Aplicando parâmetros de simulação...',
  'Calculando deformação tecidual...',
  'Renderizando resultado...',
];

export function ToolPanel({ 
  activeTool, 
  onToolChange, 
  onUndo, 
  onRedo,
  onClear,
  canUndo,
  canRedo,
  processingJob,
  onStartSimulation,
  showMesh,
  onShowMeshChange,
  meshOpacity,
  onMeshOpacityChange,
  meshDensity,
  onMeshDensityChange,
  meshEditMode,
  onMeshEditModeChange,
  isConnecting,
  onCancelConnection,
  isAnalyzingFace,
  symmetryResult,
  onGetCanvasImage,
}: ToolPanelProps) {
  const { toolParams, setToolParams } = useCanvasState();
  
  const [simParams, setSimParams] = useState({
    preserveSymmetry: true,
    avoidEyeDistortion: true,
    maintainMouthLine: true,
    clinicalObjective: '',
    quality: 'qualidade' as 'rapido' | 'qualidade',
    targetVersion: 'A' as 'A' | 'B',
  });

  const [simulationStep, setSimulationStep] = useState(0);

  const handleRunSimulation = useCallback(() => {
    onStartSimulation();
    setSimulationStep(0);
    
    // Simulate progress steps
    const interval = setInterval(() => {
      setSimulationStep(prev => {
        if (prev >= SIMULATION_STEPS.length - 1) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);
  }, [onStartSimulation]);

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground">Ferramentas</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Use 1-7 para trocar</p>
      </div>

      <ScrollArea className="flex-1">
        {/* Tools Grid */}
        <div className="p-3 border-b border-border">
          <div className="grid grid-cols-4 gap-1.5">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Tooltip key={tool.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === tool.id ? 'tool-active' : 'tool'}
                      size="icon"
                      onClick={() => onToolChange(tool.id)}
                      className="h-10 w-10 relative"
                    >
                      <Icon />
                      <span className="absolute bottom-0.5 right-0.5 text-[9px] font-mono text-muted-foreground">
                        {tool.shortcut}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[200px]">
                    <p className="font-medium">{tool.label} ({tool.shortcut})</p>
                    <p className="text-xs text-muted-foreground mt-1">{tool.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          
          {/* Undo/Redo/Clear */}
          <div className="flex gap-1.5 mt-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="flex-1"
                >
                  <Undo2 className="h-4 w-4" />
                  <span className="text-xs ml-1 hidden sm:inline">Z</span>
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
                  <Redo2 className="h-4 w-4" />
                  <span className="text-xs ml-1 hidden sm:inline">⇧Z</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refazer (Shift+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onClear}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Limpar tudo</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Facial Mesh Controls */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Grid3X3 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Mesh Facial</span>
            {isAnalyzingFace && (
              <Loader2 className="h-3 w-3 animate-spin text-primary ml-auto" />
            )}
          </div>
          
          <div className="space-y-3">
            {/* Show/Hide Toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-xs">Mostrar Mesh</Label>
              <Button
                variant={showMesh ? 'tool-active' : 'outline'}
                size="sm"
                onClick={() => onShowMeshChange(!showMesh)}
                className="h-7 px-2"
              >
                {showMesh ? (
                  <Eye className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 mr-1" />
                )}
                <span className="text-xs">{showMesh ? 'Visível' : 'Oculto'}</span>
              </Button>
            </div>

            {/* Opacity Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Opacidade</Label>
                <span className="text-xs text-muted-foreground font-mono">{Math.round(meshOpacity * 100)}%</span>
              </div>
              <Slider
                value={[meshOpacity * 100]}
                onValueChange={([v]) => onMeshOpacityChange(v / 100)}
                min={10}
                max={100}
                step={5}
                disabled={!showMesh}
              />
            </div>

            {/* Density Toggle */}
            <div className="space-y-2">
              <Label className="text-xs">Densidade</Label>
              <div className="flex gap-2">
                <Button
                  variant={meshDensity === 'simple' ? 'tool-active' : 'outline'}
                  size="sm"
                  className="flex-1 h-7"
                  onClick={() => onMeshDensityChange('simple')}
                  disabled={!showMesh}
                >
                  <span className="text-xs">Simples</span>
                </Button>
                <Button
                  variant={meshDensity === 'dense' ? 'tool-active' : 'outline'}
                  size="sm"
                  className="flex-1 h-7"
                  onClick={() => onMeshDensityChange('dense')}
                  disabled={!showMesh}
                >
                  <span className="text-xs">Denso</span>
                </Button>
              </div>
            </div>

            {/* Edit Mode */}
            <div className="space-y-2">
              <Label className="text-xs">Modo de Edição</Label>
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={meshEditMode === 'move' ? 'tool-active' : 'outline'}
                      size="sm"
                      className="flex-1 h-7 px-2"
                      onClick={() => onMeshEditModeChange('move')}
                      disabled={!showMesh}
                    >
                      <Move className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Mover pontos</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={meshEditMode === 'add' ? 'tool-active' : 'outline'}
                      size="sm"
                      className="flex-1 h-7 px-2"
                      onClick={() => onMeshEditModeChange('add')}
                      disabled={!showMesh}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Adicionar ponto</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={meshEditMode === 'remove' ? 'tool-active' : 'outline'}
                      size="sm"
                      className="flex-1 h-7 px-2"
                      onClick={() => onMeshEditModeChange('remove')}
                      disabled={!showMesh}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remover ponto</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={meshEditMode === 'connect' ? 'tool-active' : 'outline'}
                      size="sm"
                      className="flex-1 h-7 px-2"
                      onClick={() => onMeshEditModeChange('connect')}
                      disabled={!showMesh}
                    >
                      <Link2 className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Conectar pontos</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Connection status */}
            {isConnecting && (
              <div className="flex items-center justify-between p-2 bg-primary/10 rounded border border-primary/20">
                <span className="text-xs text-primary">Selecionando segundo ponto...</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={onCancelConnection}
                >
                  Cancelar
                </Button>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              {meshEditMode === 'move' && 'Arraste os pontos para ajustar'}
              {meshEditMode === 'add' && 'Clique na imagem para adicionar ponto'}
              {meshEditMode === 'remove' && 'Clique em um ponto para removê-lo'}
              {meshEditMode === 'connect' && 'Clique em dois pontos para conectá-los'}
            </p>

            {/* Color Legend */}
            <Separator className="my-2" />
            <div className="space-y-1.5">
              <Label className="text-xs">Legenda das Linhas</Label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded" style={{ backgroundColor: 'rgb(255, 200, 0)' }} />
                  <span className="text-[10px] text-muted-foreground">Horizontal</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded" style={{ backgroundColor: 'rgb(255, 100, 100)' }} />
                  <span className="text-[10px] text-muted-foreground">Vertical</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded" style={{ backgroundColor: 'rgb(100, 255, 100)' }} />
                  <span className="text-[10px] text-muted-foreground">Diagonal</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded" style={{ backgroundColor: 'rgb(200, 100, 255)' }} />
                  <span className="text-[10px] text-muted-foreground">Contorno</span>
                </div>
                <div className="flex items-center gap-1.5 col-span-2">
                  <div className="w-4 h-0.5 rounded border-dashed" style={{ backgroundColor: 'rgb(255, 150, 50)', borderStyle: 'dashed' }} />
                  <span className="text-[10px] text-muted-foreground">Custom (tracejada)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Symmetry Analysis */}
        <SymmetryIndicator 
          symmetryResult={symmetryResult} 
          isAnalyzing={isAnalyzingFace}
          onGetCanvasImage={onGetCanvasImage}
        />
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Parâmetros</span>
          </div>
          
          <div className="space-y-4">
            {/* Common params for brush tools */}
            {['warp', 'volume', 'incision', 'suture', 'annotate', 'eraser'].includes(activeTool) && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Raio do Pincel</Label>
                    <span className="text-xs text-muted-foreground font-mono">{toolParams.brushSize}px</span>
                  </div>
                  <Slider
                    value={[toolParams.brushSize]}
                    onValueChange={([v]) => setToolParams({ brushSize: v })}
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
                    onValueChange={([v]) => setToolParams({ intensity: v })}
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
                    onValueChange={([v]) => setToolParams({ smoothing: v })}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>
              </>
            )}

            {/* Volume tool specific */}
            {activeTool === 'volume' && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs">Modo de Volume</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={toolParams.volumeMode === 'add' ? 'tool-active' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setToolParams({ volumeMode: 'add' })}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar
                    </Button>
                    <Button
                      variant={toolParams.volumeMode === 'remove' ? 'tool-active' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setToolParams({ volumeMode: 'remove' })}
                    >
                      <Minus className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Incision tool specific */}
            {activeTool === 'incision' && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs">Tipo de Incisão</Label>
                  <Select
                    value={toolParams.incisionType}
                    onValueChange={(v) => setToolParams({ incisionType: v })}
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
                <div className="space-y-2">
                  <Label className="text-xs">Instrumento</Label>
                  <Select defaultValue="bisturi_15">
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INSTRUMENTS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Profundidade</Label>
                    <span className="text-xs text-muted-foreground font-mono">{toolParams.incisionDepth}%</span>
                  </div>
                  <Slider
                    value={[toolParams.incisionDepth]}
                    onValueChange={([v]) => setToolParams({ incisionDepth: v })}
                    min={10}
                    max={100}
                    step={5}
                  />
                </div>
              </>
            )}

            {/* Suture tool specific */}
            {activeTool === 'suture' && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs">Tipo de Sutura</Label>
                  <Select
                    value={toolParams.sutureType}
                    onValueChange={(v) => setToolParams({ sutureType: v })}
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
                    onValueChange={([v]) => setToolParams({ sutureSpacing: v })}
                    min={2}
                    max={15}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Tensão</Label>
                    <span className="text-xs text-muted-foreground font-mono">{toolParams.sutureTension}%</span>
                  </div>
                  <Slider
                    value={[toolParams.sutureTension]}
                    onValueChange={([v]) => setToolParams({ sutureTension: v })}
                    min={10}
                    max={100}
                    step={5}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Simulation Parameters */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Play className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Simulação (IA)</span>
          </div>
          
          <div className="space-y-3">
            <div className="space-y-2">
              {[
                { key: 'preserveSymmetry', label: 'Preservar simetria facial' },
                { key: 'avoidEyeDistortion', label: 'Evitar distorção periorbital' },
                { key: 'maintainMouthLine', label: 'Manter linha labial' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={simParams[key as keyof typeof simParams] as boolean}
                    onCheckedChange={(checked) => 
                      setSimParams(p => ({ ...p, [key]: checked }))
                    }
                    className="h-3.5 w-3.5"
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
                    <SelectItem value="rapido">Rápido (~30s)</SelectItem>
                    <SelectItem value="qualidade">Qualidade (~2min)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={handleRunSimulation}
              disabled={!!processingJob}
            >
              {processingJob ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Rodar Simulação
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Processing Status */}
        <div className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Status</span>
          </div>
          
          {processingJob ? (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-4 w-4 text-warning animate-spin" />
                <span className="text-sm font-medium text-foreground">Processando</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-1.5 bg-warning/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-warning rounded-full transition-all duration-500"
                    style={{ width: `${processingJob.progress}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-warning">{processingJob.progress}%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {SIMULATION_STEPS[simulationStep]}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-muted-foreground">
              <Check className="h-4 w-4" />
              <span className="text-xs">Pronto para simular</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
