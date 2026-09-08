// Tool Panel - Right side panel with CLINICAL-FIRST organization
// Reorganized by clinical stages: AVALIAÇÃO → PLANEJAMENTO → DOCUMENTAÇÃO
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Move,
  Scissors,
  Circle,
  ArrowUpRight,
  Type,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Sliders,
  Play,
  Plus,
  Minus,
  Grid3X3,
  Eye,
  EyeOff,
  Link2,
  Sparkles,
  Activity,
  Ruler,
  Triangle,
  Brain,
  Loader2,
  ScanFace,
  Hand,
  FileText,
  Target,
  Crosshair,
  MapPin,
  ClipboardList,
  Box,
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

import { type MeshDensity, type SymmetryResult, MESH_PRESETS } from '@/types/facialLandmarks';
import { type MeshEditMode } from '@/hooks/useFacialAnalysis';
import { type MeshVisualStyle } from './MediaPipeMeshRenderer';
import { SymmetryIndicator } from './SymmetryIndicator';
import { AnalysisHistory } from './AnalysisHistory';
import { Generate3DButton } from './Generate3DButton';
import { AnatomicalMeasurementsPanel } from './AnatomicalMeasurements';
import { 
  CORRECTION_PROCEDURES, 
  INTERVENTION_TYPES,
  MARKING_TYPES,
  SURGICAL_TECHNIQUES,
  type MarkingType,
  type InterventionType,
} from '@/types/clinicalTools';

export type ToolType = 'select' | 'correction_vector' | 'intervention_area' | 'surgical_marking' | 'skin_pull' | 'annotate' | 'eraser' | 'measure' | 'angle';

// Legacy type alias for backwards compatibility
export type LegacyToolType = 'warp' | 'volume' | 'incision' | 'suture';

interface ToolPanelProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Detecção de landmarks (MediaPipe, no navegador)
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

  // Anatomical measurements
  anatomicalMeasurements?: any;
  isCalibrated?: boolean;

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
  
  // AI Mesh recommendation
  onTriggerMeshAI?: () => void;
  isMeshAILoading?: boolean;

  // AI-1: análise direta pela edge function `analyze-face` (Gemini), independente do
  // mesh geométrico do MediaPipe.
  onAnalyzeDirect?: () => void;

  // PR-4 nível 1: deformação geométrica da face
  warpRadius?: number;
  onWarpRadiusChange?: (radius: number) => void;
  warpIntensity?: number;
  onWarpIntensityChange?: (intensity: number) => void;
  hasWarp?: boolean;
  warpPointCount?: number;
  onResetWarp?: () => void;
  
  // Active points counter
  activePointsCount?: number;
  
  // 3D Model generation (Meshy AI)
  onGenerate3D?: () => void;
  is3DGenerating?: boolean;
  generation3DProgress?: number;
  generation3DStatus?: 'idle' | 'creating' | 'processing' | 'finalizing' | 'completed' | 'error';
  generation3DError?: string | null;
  hasExisting3DScan?: boolean;
  hasImage?: boolean;
}

// ============= CLINICAL TOOL DEFINITIONS =============

const PLANNING_TOOLS: { id: ToolType; icon: React.ElementType; label: string; tooltip: string; shortcut: string }[] = [
  { 
    id: 'correction_vector', 
    icon: ArrowUpRight, 
    label: 'Vetor de Correção', 
    tooltip: 'Marque direção e magnitude de correção. Mostra medida em mm.', 
    shortcut: '1' 
  },
  { 
    id: 'intervention_area', 
    icon: Target, 
    label: 'Área de Intervenção', 
    tooltip: 'Delimite região cirúrgica (preenchimento, ressecção, lifting).', 
    shortcut: '2' 
  },
  { 
    id: 'surgical_marking', 
    icon: Scissors, 
    label: 'Marcação Cirúrgica', 
    tooltip: 'Trace linhas de incisão, limites de descolamento ou suturas.', 
    shortcut: '3' 
  },
  {
    id: 'skin_pull',
    icon: Hand,
    label: 'Puxar Pele',
    tooltip: 'Arraste sobre o rosto para deslocar a pele. Deformação geométrica sobre a malha detectada — visualização, não predição cirúrgica.',
    shortcut: '9'
  },
];

const UTILITY_TOOLS: { id: ToolType; icon: React.ElementType; label: string; tooltip: string; shortcut: string }[] = [
  { id: 'select', icon: Move, label: 'Selecionar', tooltip: 'Selecione e mova elementos no canvas.', shortcut: '4' },
  { id: 'measure', icon: Ruler, label: 'Medir', tooltip: 'Meça distância entre 2 pontos (em mm se calibrado).', shortcut: '5' },
  { id: 'angle', icon: Triangle, label: 'Ângulo', tooltip: 'Meça ângulo entre 3 pontos do mesh.', shortcut: '6' },
  { id: 'annotate', icon: Type, label: 'Anotar', tooltip: 'Adicione textos e anotações.', shortcut: '7' },
  { id: 'eraser', icon: Eraser, label: 'Apagar', tooltip: 'Apague marcações individuais.', shortcut: '8' },
];

// ============= ANIMATED COUNTER =============

function AnimatedCounter({ count }: { count: number }) {
  const [displayCount, setDisplayCount] = useState(count);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevCountRef = useRef(count);

  useEffect(() => {
    if (prevCountRef.current !== count) {
      setIsAnimating(true);
      
      const timeout = setTimeout(() => {
        setDisplayCount(count);
        prevCountRef.current = count;
      }, 100);

      const resetAnimation = setTimeout(() => {
        setIsAnimating(false);
      }, 300);

      return () => {
        clearTimeout(timeout);
        clearTimeout(resetAnimation);
      };
    }
  }, [count]);

  return (
    <span 
      className={cn(
        "text-[10px] font-mono px-1.5 py-0.5 bg-primary/10 text-primary rounded transition-all duration-200",
        isAnimating && "scale-110 bg-primary/20"
      )}
    >
      {displayCount} pts ativos
    </span>
  );
}

// ============= MAIN COMPONENT =============

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
  anatomicalMeasurements,
  isCalibrated = false,
  caseId,
  onRetryAnalysis,
  onCancelAnalysis,
  onLoadAnalysis,
  onAnalysisDeleted,
  onGetCanvasImage,
  caseName,
  currentPhotoAngle,
  onTriggerMeshAI,
  onAnalyzeDirect,
  warpRadius = 0.08,
  onWarpRadiusChange,
  warpIntensity = 100,
  onWarpIntensityChange,
  hasWarp = false,
  warpPointCount = 0,
  onResetWarp,
  isMeshAILoading,
  activePointsCount,
  // 3D Model generation (Meshy AI)
  onGenerate3D,
  is3DGenerating,
  generation3DProgress,
  generation3DStatus,
  generation3DError,
  hasExisting3DScan,
  hasImage,
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
      {/* Fixed header: Clinical planning tools */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="p-3">
          {/* Clinical Section Label */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-medium text-primary uppercase tracking-wider">
              🎯 Planejamento
            </span>
          </div>
          
          {/* Planning Tools */}
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {PLANNING_TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Tooltip key={tool.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === tool.id ? 'tool-active' : 'tool'}
                      size="sm"
                      onClick={() => onToolChange(tool.id)}
                      className="h-auto py-2 px-2 flex flex-col items-center gap-1"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-[9px] leading-tight text-center">{tool.label}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[220px]">
                    <p className="font-medium">{tool.label} ({tool.shortcut})</p>
                    <p className="text-xs text-muted-foreground mt-1">{tool.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Utility Tools */}
          <div className="grid grid-cols-5 gap-1">
            {UTILITY_TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Tooltip key={tool.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === tool.id ? 'tool-active' : 'tool'}
                      size="icon"
                      onClick={() => onToolChange(tool.id)}
                      className="h-8 w-full relative"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="absolute bottom-0 right-0.5 text-[8px] font-mono text-muted-foreground">
                        {tool.shortcut}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{tool.label} ({tool.shortcut})</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Undo/Redo/Clear */}
          <div className="flex gap-1.5 mt-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={onUndo} disabled={!canUndo} className="flex-1">
                  <Undo2 className="h-4 w-4" />
                  <span className="text-xs ml-1 hidden sm:inline">Z</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Desfazer (Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={onRedo} disabled={!canRedo} className="flex-1">
                  <Redo2 className="h-4 w-4" />
                  <span className="text-xs ml-1 hidden sm:inline">⇧Z</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refazer (Shift+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={onClear} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Limpar tudo</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Scrollable body: Clinical sections */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin">
        <Accordion type="multiple" defaultValue={['avaliacao']} className="w-full">
          
          {/* ============= AVALIAÇÃO ============= */}
          <div className="border-b border-primary/20 bg-primary/5">
            <div className="px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] font-medium text-primary uppercase tracking-wider">
                📋 Avaliação
              </span>
            </div>
          </div>

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
                    {showMesh ? <Eye className="h-3.5 w-3.5 mr-1" /> : <EyeOff className="h-3.5 w-3.5 mr-1" />}
                    <span className="text-xs">{showMesh ? 'Visível' : 'Oculto'}</span>
                  </Button>
                </div>

                {/* Opacity Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Opacidade</Label>
                    <span className="text-xs text-muted-foreground font-mono">{Math.round(meshOpacity)}%</span>
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
                    {(['minimal', 'standard', 'detailed'] as const).map((style) => (
                      <Button
                        key={style}
                        variant={meshVisualStyle === style ? 'tool-active' : 'outline'}
                        size="sm"
                        className="flex-1 h-7 px-1.5"
                        onClick={() => onMeshVisualStyleChange(style)}
                        disabled={!showMesh}
                      >
                        <span className="text-[10px]">
                          {style === 'minimal' ? 'Minimal' : style === 'standard' ? 'Padrão' : 'Detalhado'}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Density Preset Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Densidade do Mesh</Label>
                    {activePointsCount !== undefined && activePointsCount > 0 && (
                      <AnimatedCounter count={activePointsCount} />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(MESH_PRESETS) as MeshDensity[]).map((preset) => {
                      const config = MESH_PRESETS[preset];
                      const isActive = meshDensity === preset;
                      return (
                        <Button
                          key={preset}
                          variant={isActive ? 'tool-active' : 'outline'}
                          size="sm"
                          className={cn(
                            "h-auto py-2 px-2 flex flex-col items-start gap-0.5",
                            isActive && "ring-1 ring-primary"
                          )}
                          onClick={() => onMeshDensityChange(preset)}
                          disabled={!showMesh}
                        >
                          <div className="flex items-center gap-1.5 w-full">
                            <span className="text-sm">{config.icon}</span>
                            <span className="text-xs font-medium">{config.label}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {config.points} pts
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Auto-Mesh AI Button */}
                {onTriggerMeshAI && (
                  <div className="pt-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-8 gap-1.5 border-primary/30 hover:border-primary hover:bg-primary/5"
                          onClick={onTriggerMeshAI}
                          disabled={isMeshAILoading || isAnalyzingFace}
                        >
                          {isMeshAILoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Brain className="h-3.5 w-3.5 text-primary" />
                          )}
                          <span className="text-xs">Auto-Mesh IA</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px]">
                        <p className="text-xs">
                          Usa GPT-4 Vision para analisar a imagem e recomendar a densidade ideal de mesh.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}

                {/* AI-1: landmarks anatômicos nomeados via Gemini */}
                {onAnalyzeDirect && (
                  <div className="pt-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-8 gap-1.5"
                          onClick={onAnalyzeDirect}
                          disabled={isAnalyzingFace}
                        >
                          {isAnalyzingFace ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ScanFace className="h-3.5 w-3.5" />
                          )}
                          <span className="text-xs">Analisar (direto)</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[220px]">
                        <p className="text-xs">
                          Caminho independente: analisa a foto atual direto pelo Gemini
                          (edge function <span className="font-mono">analyze-face</span>),
                          Complementa o mesh geométrico com pontos anatômicos nomeados.
                          Pontos em laranja indicam baixa confiança do detector.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}

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
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onCancelConnection}>
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
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Simetria */}
          <AccordionItem value="symmetry" className="border-b border-border">
            <AccordionTrigger className="px-3 py-2.5 text-xs">
              <span className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                Análise de Simetria
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

          {/* Medidas Anatômicas - NEW! */}
          <AccordionItem value="anatomical" className="border-b border-border">
            <AccordionTrigger className="px-3 py-2.5 text-xs">
              <span className="flex items-center gap-2">
                <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                Medidas Anatômicas
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              <AnatomicalMeasurementsPanel
                measurements={anatomicalMeasurements}
                isCalibrated={isCalibrated}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Modelo 3D (Meshy AI) */}
          <AccordionItem value="model3d" className="border-b border-border">
            <AccordionTrigger className="px-3 py-2.5 text-xs">
              <span className="flex items-center gap-2">
                <Box className="h-3.5 w-3.5 text-muted-foreground" />
                Modelo 3D
                {hasExisting3DScan && (
                  <span className="ml-auto text-[10px] text-green-600 dark:text-green-400">✓ Disponível</span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground">
                  Gere um modelo 3D realista a partir da foto do paciente usando Meshy AI.
                </p>
                <Generate3DButton
                  isGenerating={is3DGenerating || false}
                  progress={generation3DProgress || 0}
                  status={generation3DStatus || 'idle'}
                  error={generation3DError || null}
                  hasExistingScan={hasExisting3DScan || false}
                  hasImage={hasImage !== false}
                  onGenerate={onGenerate3D || (() => {})}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ============= PLANEJAMENTO ============= */}
          <div className="border-b border-amber-500/20 bg-amber-500/5">
            <div className="px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                🎯 Parâmetros da Ferramenta
              </span>
            </div>
          </div>

          {/* Tool Parameters - Contextual based on active tool */}
          <AccordionItem value="params" className="border-b border-border">
            <AccordionTrigger className="px-3 py-2.5 text-xs">
              <span className="flex items-center gap-2">
                <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
                {activeTool === 'correction_vector' && 'Vetor de Correção'}
                {activeTool === 'intervention_area' && 'Área de Intervenção'}
                {activeTool === 'surgical_marking' && 'Marcação Cirúrgica'}
                {activeTool === 'skin_pull' && 'Puxar Pele'}
                {!['correction_vector', 'intervention_area', 'surgical_marking', 'skin_pull'].includes(activeTool) && 'Parâmetros'}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              <div className="space-y-4">
                
                {/* PR-4 nível 1: parâmetros da deformação geométrica */}
                {activeTool === 'skin_pull' && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 p-2 rounded-md bg-warning/10 border border-warning/20">
                      <Activity className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Deformação <strong className="text-foreground">geométrica</strong>: mostra como a
                        imagem ficaria se a pele se movesse assim. Não incorpora rigidez de tecido, tensão de
                        sutura nem comportamento de cicatriz — não prediz o resultado da intervenção.
                      </p>
                    </div>

                    <p className="text-[10px] text-muted-foreground">
                      Arraste sobre o rosto para deslocar a pele. O tecido ao redor acompanha com atenuação
                      suave, dentro do raio de influência.
                    </p>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Raio de Influência</Label>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {(warpRadius * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Slider
                        value={[warpRadius * 100]}
                        onValueChange={([v]) => onWarpRadiusChange?.(v / 100)}
                        min={2}
                        max={25}
                        step={1}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Intensidade</Label>
                        <span className="text-[10px] font-mono text-muted-foreground">{warpIntensity}%</span>
                      </div>
                      <Slider
                        value={[warpIntensity]}
                        onValueChange={([v]) => onWarpIntensityChange?.(v)}
                        min={10}
                        max={200}
                        step={5}
                      />
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 gap-1.5"
                      onClick={onResetWarp}
                      disabled={!hasWarp}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      <span className="text-xs">
                        {hasWarp ? `Redefinir (${warpPointCount} pontos)` : 'Sem deformação'}
                      </span>
                    </Button>
                  </div>
                )}

                {/* Correction Vector Parameters */}
                {activeTool === 'correction_vector' && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-muted-foreground">
                      Clique e arraste para indicar direção e magnitude da correção. A medida aparecerá em mm.
                    </p>
                    <div className="space-y-2">
                      <Label className="text-xs">Procedimento Associado</Label>
                      <Select 
                        value={toolParams.procedure || 'outro'} 
                        onValueChange={(v) => setToolParams({ procedure: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CORRECTION_PROCEDURES.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Intervention Area Parameters */}
                {activeTool === 'intervention_area' && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-muted-foreground">
                      Clique para marcar região de intervenção. A área será calculada em mm².
                    </p>
                    <div className="space-y-2">
                      <Label className="text-xs">Tipo de Intervenção</Label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {INTERVENTION_TYPES.map((type) => (
                          <Button
                            key={type.value}
                            variant={toolParams.interventionType === type.value ? 'tool-active' : 'outline'}
                            size="sm"
                            className="h-8 text-xs justify-start gap-2"
                            onClick={() => setToolParams({ interventionType: type.value, volumeMode: type.value === 'resseccao' ? 'remove' : 'add' })}
                          >
                            <span>{type.icon}</span>
                            {type.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Tamanho da Área</Label>
                        <span className="text-xs text-muted-foreground font-mono">{toolParams.brushSize}px</span>
                      </div>
                      <Slider
                        value={[toolParams.brushSize]}
                        onValueChange={([v]) => setToolParams({ brushSize: v })}
                        min={20}
                        max={150}
                        step={5}
                      />
                    </div>
                  </div>
                )}

                {/* Surgical Marking Parameters */}
                {activeTool === 'surgical_marking' && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-muted-foreground">
                      Desenhe marcações cirúrgicas. O comprimento será exibido em mm.
                    </p>
                    <div className="space-y-2">
                      <Label className="text-xs">Tipo de Marcação</Label>
                      <Select 
                        value={toolParams.markingType || 'incision_line'} 
                        onValueChange={(v) => setToolParams({ markingType: v as MarkingType })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MARKING_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Técnica Cirúrgica</Label>
                      <Select 
                        value={toolParams.surgicalTechnique || 'incisao_linear'} 
                        onValueChange={(v) => setToolParams({ surgicalTechnique: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SURGICAL_TECHNIQUES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Generic brush parameters for other tools */}
                {['annotate', 'eraser'].includes(activeTool) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Tamanho</Label>
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
                )}

                {/* Measure/Angle info */}
                {(activeTool === 'measure' || activeTool === 'angle') && (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      {activeTool === 'measure' 
                        ? 'Clique em 2 pontos para medir a distância. Se calibrado, mostrará valor em mm.'
                        : 'Clique em 3 pontos do mesh para medir o ângulo. O segundo ponto será o vértice.'
                      }
                    </p>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Simulação (IA) - Future */}
          <AccordionItem value="simulation" className="border-b border-border">
            <AccordionTrigger className="px-3 py-2.5 text-xs">
              <span className="flex items-center gap-2">
                <Play className="h-3.5 w-3.5 text-muted-foreground" />
                Simulação (IA)
                <span className="text-[9px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">Futuro</span>
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

          {/* ============= DOCUMENTAÇÃO ============= */}
          <div className="border-b border-green-500/20 bg-green-500/5">
            <div className="px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">
                📊 Documentação
              </span>
            </div>
          </div>

          {/* Histórico */}
          {caseId && onLoadAnalysis && (
            <AccordionItem value="history" className="border-b-0">
              <AccordionTrigger className="px-3 py-2.5 text-xs">
                <span className="flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                  Histórico de Análises
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
              <span className="text-[10px] text-amber-500">Processando…</span>
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
