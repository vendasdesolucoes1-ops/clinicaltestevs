// Tool Panel - Right side panel with tools and simulation controls - v2
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
  Plus,
  Minus,
  Grid3X3,
  Eye,
  EyeOff,
  Link2,
  Sparkles,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useCanvasState } from '@/hooks/useCanvasState';
import { cn } from '@/lib/utils';

import { type MeshDensity, type SymmetryResult } from '@/types/facialLandmarks';
import { type MeshEditMode } from '@/hooks/useFacialAnalysis';
import { type MeshVisualStyle } from './MediaPipeMeshRenderer';
import { SymmetryIndicator } from './SymmetryIndicator';
import { WorkflowProgressPanel } from './WorkflowProgressPanel';
import { AnalysisHistory } from './AnalysisHistory';

export type ToolType = 'select' | 'warp' | 'volume' | 'incision' | 'suture' | 'annotate' | 'eraser';

interface ToolPanelProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Simulation via n8n
  isSimulating: boolean;
  onTriggerSimulation: (targetVersion: 'A' | 'B') => void;

  // Mesh controls
  showMesh: boolean;
  onShowMeshChange: (show: boolean) => void;
  meshOpacity: number;
  onMeshOpacityChange: (opacity: number) => void;
  meshDensity: MeshDensity;
  onMeshDensityChange: (density: MeshDensity) => void;
  meshVisualStyle: MeshVisualStyle;
  onMeshVisualStyleChange: (style: MeshVisualStyle) => void;
  meshEditMode: MeshEditMode;
  onMeshEditModeChange: (mode: MeshEditMode) => void;
  isConnecting: boolean;
  onCancelConnection: () => void;
  isAnalyzingFace: boolean;
  symmetryResult: SymmetryResult | null;

  // Optional: integrate workflow + history in-panel
  caseId?: string;
  onRetryAnalysis?: () => void;
  onCancelAnalysis?: () => void;
  onLoadAnalysis?: (analysis: {
    points: any;
    faceROI: any;
    midlinePoints: string[];
    customConnections: any;
  }) => void;
  onAnalysisDeleted?: () => void;

  // Export context
  onGetCanvasImage?: () => string | null;
  caseName?: string;
  currentPhotoAngle?: string;
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

export function ToolPanel({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  isSimulating,
  onTriggerSimulation,
  showMesh,
  onShowMeshChange,
  meshOpacity,
  onMeshOpacityChange,
  meshDensity,
  onMeshDensityChange,
  meshVisualStyle,
  onMeshVisualStyleChange,
  meshEditMode,
  onMeshEditModeChange,
  isConnecting,
  onCancelConnection,
  isAnalyzingFace,
  symmetryResult,
  caseId,
  onRetryAnalysis,
  onCancelAnalysis,
  onLoadAnalysis,
  onAnalysisDeleted,
  onGetCanvasImage,
  caseName,
  currentPhotoAngle,
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

  const handleRunSimulation = useCallback(() => {
    onTriggerSimulation(simParams.targetVersion);
  }, [onTriggerSimulation, simParams.targetVersion]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Fixed header: primary tools */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="p-3">
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
                  <TooltipContent side="left" className="max-w-[220px]">
                    <p className="font-medium">
                      {tool.label} ({tool.shortcut})
                    </p>
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
      </div>

      {/* Scrollable body: collapsible sections */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin">
        <Accordion type="single" collapsible defaultValue="mesh" className="w-full">
          {/* Mesh Facial */}
          <AccordionItem value="mesh" className="border-b border-border">
            <AccordionTrigger className="px-3 py-2.5 text-xs">
              <span className="flex items-center gap-2">
                <Grid3X3 className="h-3.5 w-3.5 text-muted-foreground" />
                Mesh Facial
                {isAnalyzingFace && (
                  <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                    <Activity className="h-3 w-3 animate-pulse" />
                    <span className="text-[10px]">Processando</span>
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
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
                    <span className="text-xs text-muted-foreground font-mono">
                      {Math.round(meshOpacity)}%
                    </span>
                  </div>
                  <Slider
                    value={[meshOpacity]}
                    onValueChange={([v]) => onMeshOpacityChange(v)}
                    min={10}
                    max={100}
                    step={5}
                    disabled={!showMesh}
                  />
                </div>

                {/* Visual Style Selector */}
                <div className="space-y-2">
                  <Label className="text-xs">Estilo Visual</Label>
                  <div className="flex gap-1">
                    <Button
                      variant={meshVisualStyle === 'minimal' ? 'tool-active' : 'outline'}
                      size="sm"
                      className="flex-1 h-7 px-1.5"
                      onClick={() => onMeshVisualStyleChange('minimal')}
                      disabled={!showMesh}
                    >
                      <span className="text-[10px]">Minimal</span>
                    </Button>
                    <Button
                      variant={meshVisualStyle === 'standard' ? 'tool-active' : 'outline'}
                      size="sm"
                      className="flex-1 h-7 px-1.5"
                      onClick={() => onMeshVisualStyleChange('standard')}
                      disabled={!showMesh}
                    >
                      <span className="text-[10px]">Padrão</span>
                    </Button>
                    <Button
                      variant={meshVisualStyle === 'detailed' ? 'tool-active' : 'outline'}
                      size="sm"
                      className="flex-1 h-7 px-1.5"
                      onClick={() => onMeshVisualStyleChange('detailed')}
                      disabled={!showMesh}
                    >
                      <span className="text-[10px]">Detalhado</span>
                    </Button>
                  </div>
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
                      <div
                        className="w-4 h-0.5 rounded"
                        style={{ backgroundColor: 'hsl(var(--mesh-midline))' }}
                      />
                      <span className="text-[10px] text-muted-foreground">Linha Média</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-4 h-0.5 rounded"
                        style={{ backgroundColor: 'hsl(var(--mesh-horizontal))' }}
                      />
                      <span className="text-[10px] text-muted-foreground">Horizontal</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-4 h-0.5 rounded"
                        style={{ backgroundColor: 'hsl(var(--mesh-contour))' }}
                      />
                      <span className="text-[10px] text-muted-foreground">Contorno</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-4 h-0.5 rounded"
                        style={{ backgroundColor: 'hsl(var(--mesh-diagonal))' }}
                      />
                      <span className="text-[10px] text-muted-foreground">Diagonal</span>
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <div
                        className="w-4 h-0.5 rounded border border-border"
                        style={{ backgroundColor: 'hsl(var(--mesh-custom))' }}
                      />
                      <span className="text-[10px] text-muted-foreground">Custom (tracejada)</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-2">
                    Pontos coloridos por região anatômica. ROI facial tracejada em azul.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Simetria */}
          <AccordionItem value="symmetry" className="border-b border-border">
            <AccordionTrigger className="px-3 py-2.5 text-xs">
              <span className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                Simetria
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              <SymmetryIndicator
                symmetryResult={symmetryResult}
                isAnalyzing={isAnalyzingFace}
                onGetCanvasImage={onGetCanvasImage}
                caseName={caseName}
                photoAngle={currentPhotoAngle}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Parâmetros */}
          <AccordionItem value="params" className="border-b border-border">
            <AccordionTrigger className="px-3 py-2.5 text-xs">
              <span className="flex items-center gap-2">
                <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
                Parâmetros
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
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
                      <Select value={toolParams.incisionType} onValueChange={(v) => setToolParams({ incisionType: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INCISION_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
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
                          {INSTRUMENTS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
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
                      <Select value={toolParams.sutureType} onValueChange={(v) => setToolParams({ sutureType: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUTURE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
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
            </AccordionContent>
          </AccordionItem>

          {/* Simulação (IA) */}
          <AccordionItem value="simulation" className="border-b border-border">
            <AccordionTrigger className="px-3 py-2.5 text-xs">
              <span className="flex items-center gap-2">
                <Play className="h-3.5 w-3.5 text-muted-foreground" />
                Simulação (IA)
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
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
                        onCheckedChange={(checked) => setSimParams((p) => ({ ...p, [key]: checked }))}
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
                    onChange={(e) => setSimParams((p) => ({ ...p, clinicalObjective: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Versão</Label>
                    <Select
                      value={simParams.targetVersion}
                      onValueChange={(v: 'A' | 'B') => setSimParams((p) => ({ ...p, targetVersion: v }))}
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
                      onValueChange={(v: 'rapido' | 'qualidade') => setSimParams((p) => ({ ...p, quality: v }))}
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
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Workflow */}
          {caseId && (
            <AccordionItem value="workflow" className="border-b border-border">
              <AccordionTrigger className="px-3 py-2.5 text-xs">
                <span className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  Workflow n8n
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0">
                <WorkflowProgressPanel
                  caseId={caseId}
                  onRetry={onRetryAnalysis}
                  onCancel={onCancelAnalysis}
                  className="border-b-0"
                />
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Histórico */}
          {caseId && onLoadAnalysis && (
            <AccordionItem value="history" className="border-b-0">
              <AccordionTrigger className="px-3 py-2.5 text-xs">
                <span className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  Histórico
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <AnalysisHistory
                  caseId={caseId}
                  onLoadAnalysis={onLoadAnalysis}
                  onAnalysisDeleted={onAnalysisDeleted}
                  className="w-full"
                />
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>

      {/* Sticky footer: CTA always visible */}
      <div className="shrink-0 border-t border-border bg-card">
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Status</span>
            {isSimulating ? (
              <span className="text-[10px] text-warning">Processando…</span>
            ) : (
              <span className="text-[10px] text-muted-foreground">Pronto</span>
            )}
          </div>

          <Button className="w-full" onClick={handleRunSimulation} disabled={isSimulating}>
            {isSimulating ? (
              <>
                <Activity className="h-4 w-4 mr-2 animate-pulse" />
                Processando análise facial…
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Rodar Simulação
              </>
            )}
          </Button>

          <p className="text-[10px] text-muted-foreground leading-snug">
            Simulação para planejamento — não substitui avaliação clínica.
          </p>
        </div>
      </div>
    </div>
  );
}
