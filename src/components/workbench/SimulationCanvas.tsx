// Professional Simulation Canvas with Fabric.js
import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import * as fabric from 'fabric';
import { ToolType } from './ToolPanel';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasStatusBar } from './CanvasStatusBar';
import { CanvasRuler } from './CanvasRuler';
import { geodesicDistancesFrom } from '@/lib/faceGeodesic';
import type { VersionFrame } from '@/lib/versionState';
import { isAnnotationObject, repositionForFrame } from '@/lib/canvasAnnotations';
import { CalibrationOverlay } from './CalibrationOverlay';
import { FacialMesh } from './FacialMesh';
import { MediaPipeMeshRenderer } from './MediaPipeMeshRenderer';
import { useCanvasState, Point, CanvasObject } from '@/hooks/useCanvasState';
import { useCalibration } from '@/hooks/useCalibration';
import { FacialMeshData, MeshDensity } from '@/types/facialLandmarks';
import { MediaPipeMeshData } from '@/types/mediapipeMesh';
import { type MeshEditMode } from '@/hooks/useFacialAnalysis';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { type MeshVisualStyle, type MeshMeasurement, type MeshAngleMeasurement } from './MediaPipeMeshRenderer';
import { warpFace, type DisplacementMap } from '@/lib/faceWarp';
import { getFaceTessellation } from '@/types/mediapipeTessellation';

interface SimulationCanvasProps {
  imageUrl: string;
  activeTool: ToolType;
  isPanMode: boolean;
  onObjectAdded?: (object: CanvasObject) => void;
  meshData?: FacialMeshData | null;
  mediaPipeMeshData?: MediaPipeMeshData | null;
  showMesh?: boolean;
  meshOpacity?: number;
  meshDensity?: MeshDensity;
  meshVisualStyle?: MeshVisualStyle;
  meshEditMode?: MeshEditMode;
  connectingFrom?: string | null;
  onMeshPointMove?: (pointId: string, x: number, y: number) => void;
  onMeshPointAdd?: (x: number, y: number) => void;
  onMeshPointRemove?: (pointId: string) => void;
  onMeshStartConnection?: (fromId: string) => void;
  onMeshAddConnection?: (fromId: string, toId: string) => void;
  onMeshRemoveConnection?: (fromId: string, toId: string) => void;

  // PR-4 nível 1: deformação geométrica da face
  warpDisplacements?: DisplacementMap;
  onWarpPull?: (pointIndex: number, dx: number, dy: number) => void;
  /** Fim do arraste: fecha o passo do histórico. */
  onWarpPullEnd?: () => void;
  /** Alguma marcação foi criada, movida ou removida. */
  onAnnotationsChanged?: () => void;
  /** Raio de influência, para desenhar a prévia sob o cursor. */
  warpRadius?: number;
  /** Maior deslocamento da manobra em mm, ou null se a foto não está calibrada. */
  onWarpMeasureChange?: (millimeters: number | null) => void;
}

export interface SimulationCanvasRef {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportImage: () => string | null;
  /** Marcações do usuário, como o Fabric as serializa, e o quadro em que foram feitas. */
  exportMarkings: () => { markings: unknown[]; frame: VersionFrame | null };
  /** Substitui as marcações atuais pelas gravadas, reposicionadas para o quadro atual. */
  loadMarkings: (markings: unknown[], frame: VersionFrame | null) => Promise<void>;
  getCanvasState: () => any;
  getCanvas: () => fabric.Canvas | null;
  getCanvasDataUrl: () => string | null;
}

const TOOL_COLORS: Record<ToolType, string> = {
  select: '#0ea5e9',           // Selecionar objetos
  correction_vector: '#f59e0b', // Vetor de correção (setas)
  intervention_area: '#22c55e', // Área de intervenção
  surgical_marking: '#ef4444',  // Marcação cirúrgica
  skin_pull: '#ec4899',         // Puxar pele (deformação)
  annotate: '#0ea5e9',
  eraser: '#64748b',
  measure: '#7c3aed',
  angle: '#f97316',
};

const TOOL_CURSORS: Record<ToolType, string> = {
  select: 'default',
  correction_vector: 'crosshair',
  intervention_area: 'crosshair',
  surgical_marking: 'crosshair',
  skin_pull: 'grab',
  annotate: 'text',
  eraser: 'pointer',
  measure: 'crosshair',
  angle: 'crosshair',
};

// Helper to create suture points along a path
const createSuturePoints = (
  path: fabric.Path,
  spacing: number,
  color: string
): fabric.Group => {
  const pathInfo = path.path;
  const points: fabric.Object[] = [];
  
  // Get path bounding box for estimation
  const bounds = path.getBoundingRect();
  const pathLength = Math.sqrt(bounds.width ** 2 + bounds.height ** 2);
  const numPoints = Math.max(2, Math.floor(pathLength / spacing));
  
  // Create X marks along the path
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const x = bounds.left + bounds.width * t;
    const y = bounds.top + bounds.height * t;
    
    // Create X shape for suture
    const line1 = new fabric.Line([x - 4, y - 4, x + 4, y + 4], {
      stroke: color,
      strokeWidth: 2,
      selectable: false,
    });
    const line2 = new fabric.Line([x - 4, y + 4, x + 4, y - 4], {
      stroke: color,
      strokeWidth: 2,
      selectable: false,
    });
    points.push(line1, line2);
  }
  
  const group = new fabric.Group(points, {
    selectable: true,
    evented: true,
  });
  (group as any).toolType = 'suture';
  (group as any).customName = 'suture_group';
  
  return group;
};

// Helper to create volume indicator
const createVolumeIndicator = (
  x: number,
  y: number,
  size: number,
  mode: 'add' | 'remove'
): fabric.Circle => {
  const color = mode === 'add' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
  const strokeColor = mode === 'add' ? '#22c55e' : '#ef4444';
  
  const circle = new fabric.Circle({
    left: x - size / 2,
    top: y - size / 2,
    radius: size / 2,
    fill: color,
    stroke: strokeColor,
    strokeWidth: 2,
    selectable: true,
    evented: true,
  });
  (circle as any).toolType = 'volume';
  (circle as any).volumeMode = mode;
  (circle as any).customName = 'volume_indicator';
  
  return circle;
};

// Helper to create warp arrow
const createWarpArrow = (
  startX: number,
  startY: number,
  endX: number,
  endY: number
): fabric.Group => {
  const angle = Math.atan2(endY - startY, endX - startX);
  const arrowSize = 6;
  
  // Main line - thinner for more delicate marking
  const line = new fabric.Line([startX, startY, endX, endY], {
    stroke: '#f59e0b',
    strokeWidth: 1.5,
    selectable: false,
  });
  
  // Arrow head - smaller for proportion
  const arrowHead = new fabric.Triangle({
    left: endX,
    top: endY,
    width: arrowSize,
    height: arrowSize * 1.5,
    fill: '#f59e0b',
    angle: (angle * 180 / Math.PI) + 90,
    originX: 'center',
    originY: 'center',
    selectable: false,
  });
  
  const group = new fabric.Group([line, arrowHead], {
    selectable: true,
    evented: true,
  });
  (group as any).toolType = 'warp';
  (group as any).customName = 'warp_arrow';
  
  return group;
};

export const SimulationCanvas = forwardRef<SimulationCanvasRef, SimulationCanvasProps>(
  ({ imageUrl, activeTool, isPanMode, onObjectAdded, meshData, mediaPipeMeshData, showMesh = true, meshOpacity = 80, meshDensity = 'clinico', meshVisualStyle = 'minimal', meshEditMode = 'move', connectingFrom, onMeshPointMove, onMeshPointAdd, onMeshPointRemove, onMeshStartConnection, onMeshAddConnection, onMeshRemoveConnection, warpDisplacements, onWarpPull, onWarpPullEnd, onAnnotationsChanged, warpRadius, onWarpMeasureChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    
    const [isReady, setIsReady] = useState(false);
    const [cursorPosition, setCursorPosition] = useState<Point>({ x: 0, y: 0 });
    const [imageBounds, setImageBounds] = useState({ width: 0, height: 0, left: 0, top: 0 });

    // PR-4: elemento original da foto e canvas reaproveitado entre quadros da deformação.
    // Guardar o original permite desfazer a deformação sem recarregar a imagem.
    const sourceImageElRef = useRef<HTMLImageElement | null>(null);
    const warpCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const pullAnchorRef = useRef<{ pointIndex: number; x: number; y: number } | null>(null);

    // As callbacks do warp mudam a cada ajuste de raio, intensidade ou ancoragem — e a
    // cada quadro do arraste. O efeito que registra os handlers do Fabric não as observa,
    // então chamá-las direto congelava a versão do primeiro registro: mexer no raio não
    // tinha efeito até trocar de ferramenta e voltar. A ref sempre aponta para a atual.
    const onWarpPullRef = useRef(onWarpPull);
    const onWarpPullEndRef = useRef(onWarpPullEnd);
    const onAnnotationsChangedRef = useRef(onAnnotationsChanged);
    // Restaurar uma versão adiciona e remove objetos, mas isso não é edição do usuário: sem
    // silenciar, a versão nasceria marcada como "não salva" no instante em que foi aberta.
    const suppressAnnotationEventsRef = useRef(false);
    useEffect(() => {
      onWarpPullRef.current = onWarpPull;
      onWarpPullEndRef.current = onWarpPullEnd;
      onAnnotationsChangedRef.current = onAnnotationsChanged;
    });
    const [isMouseOverCanvas, setIsMouseOverCanvas] = useState(false);
    // Contado a partir do canvas, não do store: a borracha remove o objeto do Fabric e
    // nunca chamava `removeObject`, então o número só crescia. E restaurar uma versão
    // acrescenta objetos sem passar pelo store, o que deixaria o contador em zero com
    // marcações na tela.
    const [annotationCount, setAnnotationCount] = useState(0);
    
    // For warp tool - track drag start/end
    const warpStartRef = useRef<Point | null>(null);
    
    // For measure tool - track measurement points (arbitrary canvas points)
    const [measureStart, setMeasureStart] = useState<Point | null>(null);
    const [measurements, setMeasurements] = useState<{ id: string; start: Point; end: Point }[]>([]);
    
    // For mesh landmark measurements
    const [meshMeasureStart, setMeshMeasureStart] = useState<{ pointId: number; x: number; y: number } | null>(null);
    const [meshMeasurements, setMeshMeasurements] = useState<MeshMeasurement[]>([]);
    
    // For mesh angle measurements (3 points)
    const [anglePoints, setAnglePoints] = useState<{ pointId: number; x: number; y: number }[]>([]);
    const [angleMeasurements, setAngleMeasurements] = useState<MeshAngleMeasurement[]>([]);
    
    const {
      zoom,
      pan,
      showGrid,
      showRuler,
      layers,
      layerOpacity,
      objects,
      toolParams,
      setZoom,
      setPan,
      setShowGrid,
      setShowRuler,
      setLayerVisibility,
      setLayerOpacity,
      addObject,
      clearObjects,
      undo: stateUndo,
      redo: stateRedo,
    } = useCanvasState();

    // Calibration state
    const {
      isCalibrating,
      calibrationStep,
      isCalibrated,
      pixelsPerMm,
      setPoint1,
      setPoint2,
      startCalibration,
    } = useCalibration();

    // Initialize Fabric.js canvas
    useEffect(() => {
      if (!canvasRef.current || !containerRef.current) return;
      
      const container = containerRef.current;
      const canvas = new fabric.Canvas(canvasRef.current, {
        width: container.clientWidth,
        height: container.clientHeight,
        backgroundColor: '#1a1a2e',
        selection: activeTool === 'select',
        preserveObjectStacking: true,
      });
      
      // Initialize freeDrawingBrush for suture/incision tools
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = '#8b5cf6';
      canvas.freeDrawingBrush.width = 2;
      
      fabricRef.current = canvas;
      setIsReady(true);

      // A malha detectada cria um objeto por ponto e um por conexão — cerca de 3000 de
      // uma vez. Varrer o canvas inteiro a cada objeto adicionado é quadrático: medido em
      // navegador, dobrava o tempo de desenhar a malha e disparava o handler 3034 vezes,
      // marcando a versão como "não salva" só por ter desenhado a malha. O objeto que não
      // é anotação não interessa aqui, e a contagem anda de um em um.
      const handleObjectAdded = ({ target }: { target?: fabric.FabricObject }) => {
        if (!target || !isAnnotationObject(target)) return;
        setAnnotationCount(current => current + 1);
        if (!suppressAnnotationEventsRef.current) onAnnotationsChangedRef.current?.();
      };

      const handleObjectRemoved = ({ target }: { target?: fabric.FabricObject }) => {
        if (!target || !isAnnotationObject(target)) return;
        setAnnotationCount(current => Math.max(0, current - 1));
        if (!suppressAnnotationEventsRef.current) onAnnotationsChangedRef.current?.();
      };

      // Mover ou redimensionar não muda a quantidade, mas muda o que seria gravado.
      const handleObjectModified = ({ target }: { target?: fabric.FabricObject }) => {
        if (!target || !isAnnotationObject(target)) return;
        if (!suppressAnnotationEventsRef.current) onAnnotationsChangedRef.current?.();
      };

      canvas.on('object:added', handleObjectAdded);
      canvas.on('object:removed', handleObjectRemoved);
      canvas.on('object:modified', handleObjectModified);

      const handleResize = () => {
        canvas.setDimensions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
        canvas.renderAll();
      };
      
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('resize', handleResize);
        canvas.off('object:added', handleObjectAdded);
        canvas.off('object:removed', handleObjectRemoved);
        canvas.off('object:modified', handleObjectModified);
        canvas.dispose();
        fabricRef.current = null;
      };
    }, []);

    // Load background image
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas || !imageUrl) return;

      // `crossOrigin` é obrigatório aqui: a foto vem de signed URL do Supabase, outra
      // origem. Sem isso o canvas fica contaminado e `toDataURL` lança SecurityError — a
      // exportação simplesmente não acontece. O bucket responde com cabeçalho CORS (é o
      // mesmo caminho por onde a textura da malha 3D carrega), então a imagem continua
      // aparecendo normalmente.
      fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' }).then((img) => {
        const containerWidth = canvas.getWidth();
        const containerHeight = canvas.getHeight();
        
        const scale = Math.min(
          (containerWidth - 80) / (img.width || 1),
          (containerHeight - 80) / (img.height || 1)
        );
        
        const imgWidth = (img.width || 0) * scale;
        const imgHeight = (img.height || 0) * scale;
        const imgLeft = (containerWidth - imgWidth) / 2;
        const imgTop = (containerHeight - imgHeight) / 2;
        
        img.set({
          scaleX: scale,
          scaleY: scale,
          left: imgLeft,
          top: imgTop,
          selectable: false,
          evented: false,
          opacity: layerOpacity.original / 100,
        });
        
        (img as any).customName = 'backgroundImage';

        // Guardado para restaurar a foto intacta ao redefinir a deformação (PR-4).
        sourceImageElRef.current = img.getElement() as HTMLImageElement;

        setImageBounds({
          width: imgWidth,
          height: imgHeight,
          left: imgLeft,
          top: imgTop,
        });
        
        const existingBg = canvas.getObjects().find((obj: any) => obj.customName === 'backgroundImage');
        if (existingBg) canvas.remove(existingBg);
        
        canvas.add(img);
        canvas.sendObjectToBack(img);
        canvas.renderAll();
      }).catch(() => {
        const placeholder = new fabric.Rect({
          width: 400,
          height: 500,
          fill: '#2a2a4a',
          left: (canvas.getWidth() - 400) / 2,
          top: (canvas.getHeight() - 500) / 2,
          selectable: false,
          evented: false,
        });
        (placeholder as any).customName = 'backgroundImage';
        setImageBounds({
          width: 400,
          height: 500,
          left: (canvas.getWidth() - 400) / 2,
          top: (canvas.getHeight() - 500) / 2,
        });
        canvas.add(placeholder);
        canvas.sendObjectToBack(placeholder);
        canvas.renderAll();
      });
    }, [imageUrl, isReady]);

    // Apply layer visibility and opacity to canvas objects
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const objects = canvas.getObjects();
      
      objects.forEach((obj: any) => {
        // Background image - handle original layer
        if (obj.customName === 'backgroundImage') {
          obj.set({
            visible: layers.original,
            opacity: layerOpacity.original / 100,
          });
          return;
        }

        // Grid objects - always visible
        if (obj.customName?.startsWith('grid_')) return;

        // Mesh objects - handled separately
        if (obj.customName?.startsWith('mesh_') || obj.customName?.startsWith('mediapipe_')) return;

        // Determine object layer based on toolType or customName
        const toolType = obj.toolType;
        let objectLayer: 'markings' | 'simulation' | null = null;

        // Markings: incisions, sutures, annotations
        if (toolType === 'incision' || toolType === 'suture' || toolType === 'annotate') {
          objectLayer = 'markings';
        }
        // Simulation: volume, warp
        else if (toolType === 'volume' || toolType === 'warp') {
          objectLayer = 'simulation';
        }
        // Fallback: check customName patterns
        else if (obj.customName?.includes('incision') || obj.customName?.includes('suture') || obj.customName?.includes('annotation')) {
          objectLayer = 'markings';
        }
        else if (obj.customName?.includes('volume') || obj.customName?.includes('warp')) {
          objectLayer = 'simulation';
        }

        if (objectLayer) {
          obj.set({
            visible: layers[objectLayer],
            opacity: (layers[objectLayer] ? layerOpacity[objectLayer] / 100 : 0),
          });
        }
      });

      canvas.renderAll();
    }, [layers, layerOpacity]);

    // PR-4: aplica a deformação geométrica trocando o elemento da imagem de fundo.
    // Fazendo assim, zoom, pan, camadas e exportação seguem funcionando sem alteração —
    // o objeto do Fabric é o mesmo, muda só o pixel que ele desenha.
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const background = canvas
        .getObjects()
        .find(obj => (obj as fabric.Object & { customName?: string }).customName === 'backgroundImage') as
        | fabric.FabricImage
        | undefined;

      const original = sourceImageElRef.current;
      if (!background || !original) return;

      const landmarks = mediaPipeMeshData?.points;
      const hasWarp = !!warpDisplacements && warpDisplacements.size > 0;

      if (!hasWarp || !landmarks || landmarks.length === 0) {
        // Sem deformação: volta para a foto original, sem recarregar nada.
        if (background.getElement() !== original) {
          background.setElement(original);
          canvas.renderAll();
        }
        return;
      }

      warpCanvasRef.current = warpFace({
        image: original,
        landmarks,
        displacements: warpDisplacements,
        triangles: getFaceTessellation(),
        target: warpCanvasRef.current ?? undefined,
      });

      background.setElement(warpCanvasRef.current);
      canvas.renderAll();
    }, [warpDisplacements, mediaPipeMeshData, isReady]);

    // PR-4: traduz o deslocamento para milímetros usando a calibração da foto.
    // Sem calibração devolve null — a interface então mostra a manobra em porcentagem,
    // porque afirmar milímetro sobre foto sem escala seria pior do que não medir.
    useEffect(() => {
      if (!onWarpMeasureChange) return;

      if (!warpDisplacements || warpDisplacements.size === 0) {
        onWarpMeasureChange(null);
        return;
      }

      let largestNormalized = 0;
      warpDisplacements.forEach(({ dx, dy }) => {
        largestNormalized = Math.max(largestNormalized, Math.hypot(dx, dy));
      });

      if (!isCalibrated || !pixelsPerMm || !imageBounds.width) {
        onWarpMeasureChange(null);
        return;
      }

      // O deslocamento é normalizado à imagem; a calibração vive em pixels do canvas,
      // que é onde os cliques de calibração foram dados.
      const canvasPixels = largestNormalized * imageBounds.width;
      onWarpMeasureChange(canvasPixels / pixelsPerMm);
    }, [warpDisplacements, isCalibrated, pixelsPerMm, imageBounds.width, onWarpMeasureChange]);

    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      // surgical_marking uses free drawing mode
      canvas.isDrawingMode = activeTool === 'surgical_marking';
      canvas.selection = activeTool === 'select';
      
      if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
        // Color based on marking type
        const markingColors: Record<string, string> = {
          'incision_line': '#ef4444',
          'dissection_limit': '#f97316',
          'resection_area': '#dc2626',
          'suture_line': '#8b5cf6',
          'reference_line': '#6b7280',
        };
        canvas.freeDrawingBrush.color = markingColors[toolParams.markingType] || '#ef4444';
        canvas.freeDrawingBrush.width = 2;
      }
      
      if (!isPanMode) {
        canvas.defaultCursor = TOOL_CURSORS[activeTool];
        canvas.hoverCursor = TOOL_CURSORS[activeTool];
      }
    }, [activeTool, toolParams, isPanMode]);

    // Handle pan mode
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      if (isPanMode) {
        canvas.defaultCursor = 'grab';
        canvas.hoverCursor = 'grab';
        canvas.isDrawingMode = false;
        canvas.selection = false;
      }
    }, [isPanMode]);

    // Tool-specific event handlers
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      // Handle path created for surgical_marking
      const handlePathCreated = (e: any) => {
        if (!e.path) return;
        
        if (activeTool === 'surgical_marking') {
          const markingType = toolParams.markingType;
          const markingColors: Record<string, string> = {
            'incision_line': '#ef4444',
            'dissection_limit': '#f97316',
            'resection_area': '#dc2626',
            'suture_line': '#8b5cf6',
            'reference_line': '#6b7280',
          };
          const markingStyles: Record<string, number[]> = {
            'incision_line': [],
            'dissection_limit': [8, 4],
            'resection_area': [4, 4],
            'suture_line': [],
            'reference_line': [8, 4],
          };
          const markingLabels: Record<string, string> = {
            'incision_line': 'Linha de incisão marcada',
            'dissection_limit': 'Limite de descolamento marcado',
            'resection_area': 'Área de ressecção marcada',
            'suture_line': 'Linha de sutura marcada',
            'reference_line': 'Linha de referência marcada',
          };

          e.path.set({
            stroke: markingColors[markingType] || '#ef4444',
            strokeWidth: 2,
            strokeDashArray: markingStyles[markingType] || [],
            fill: 'transparent',
            selectable: true,
            evented: true,
          });
          (e.path as any).toolType = 'surgical_marking';
          (e.path as any).markingType = markingType;
          (e.path as any).customName = `surgical_marking_${markingType}`;
          
          const canvasObj: CanvasObject = {
            id: `surgical_${Date.now()}`,
            type: 'surgical_marking',
            points: [],
            color: markingColors[markingType] || '#ef4444',
            strokeWidth: 2,
            opacity: 1,
            layer: 'markings',
            metadata: { markingType, technique: toolParams.surgicalTechnique },
          };
          addObject(canvasObj);
          onObjectAdded?.(canvasObj);
          toast.success(markingLabels[markingType] || 'Marcação adicionada');
        }
      };

      // PR-4: converte o ponteiro do canvas para as coordenadas normalizadas em que os
      // landmarks vivem, e encontra o landmark mais próximo do toque.
      const toNormalized = (pointer: { x: number; y: number }) => ({
        x: (pointer.x - imageBounds.left) / (imageBounds.width || 1),
        y: (pointer.y - imageBounds.top) / (imageBounds.height || 1),
      });

      const findNearestLandmark = (normalized: { x: number; y: number }) => {
        const landmarks = mediaPipeMeshData?.points;
        if (!landmarks || landmarks.length === 0) return null;

        let nearestIndex = -1;
        let nearestDistance = Infinity;
        landmarks.forEach((point, index) => {
          const distance = (point.x - normalized.x) ** 2 + (point.y - normalized.y) ** 2;
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });

        // Longe demais de qualquer landmark: o clique caiu fora do rosto.
        return Math.sqrt(nearestDistance) > 0.12 ? null : nearestIndex;
      };

    // Handle mouse events for other tools
      const handleMouseDown = (e: any) => {
        const pointer = canvas.getPointer(e.e);

        if (activeTool === 'skin_pull') {
          const normalized = toNormalized(pointer);
          const nearest = findNearestLandmark(normalized);
          if (nearest === null) {
            toast.info('Clique sobre o rosto para deslocar a pele');
            return;
          }
          pullAnchorRef.current = { pointIndex: nearest, x: normalized.x, y: normalized.y };
          return;
        }
        
        // Handle calibration clicks
        if (isCalibrating) {
          if (calibrationStep === 'point1') {
            setPoint1({ x: pointer.x, y: pointer.y });
            toast.info('Primeiro ponto marcado. Clique no segundo ponto.');
          } else if (calibrationStep === 'point2') {
            setPoint2({ x: pointer.x, y: pointer.y });
          }
          return;
        }
        
        if (isPanMode) return;
        
        if (activeTool === 'eraser') {
          const target = canvas.findTarget(e.e);
          if (target && (target as any).customName !== 'backgroundImage') {
            canvas.remove(target);
            canvas.renderAll();
            toast.success('Objeto removido');
          } else {
            // Check if clicking near any SVG measurement line
            const clickThreshold = 15; // pixels tolerance
            
            // Helper function to calculate distance from point to line segment
            const pointToLineDistance = (p: Point, lineStart: Point, lineEnd: Point): number => {
              const A = p.x - lineStart.x;
              const B = p.y - lineStart.y;
              const C = lineEnd.x - lineStart.x;
              const D = lineEnd.y - lineStart.y;
              
              const dot = A * C + B * D;
              const lenSq = C * C + D * D;
              let param = -1;
              if (lenSq !== 0) param = dot / lenSq;
              
              let xx, yy;
              if (param < 0) {
                xx = lineStart.x;
                yy = lineStart.y;
              } else if (param > 1) {
                xx = lineEnd.x;
                yy = lineEnd.y;
              } else {
                xx = lineStart.x + param * C;
                yy = lineStart.y + param * D;
              }
              
              const dx = p.x - xx;
              const dy = p.y - yy;
              return Math.sqrt(dx * dx + dy * dy);
            };
            
            // Check general measurements
            const measurementToRemove = measurements.find(m => {
              const distToLine = pointToLineDistance(pointer, m.start, m.end);
              return distToLine < clickThreshold;
            });
            
            if (measurementToRemove) {
              setMeasurements(prev => prev.filter(m => m.id !== measurementToRemove.id));
              toast.success('Medida removida');
              return;
            }
            
            // Check mesh measurements
            const meshMeasurementToRemove = meshMeasurements.find(m => {
              const distToLine = pointToLineDistance(pointer, m.point1, m.point2);
              return distToLine < clickThreshold;
            });
            
            if (meshMeasurementToRemove) {
              setMeshMeasurements(prev => prev.filter(m => m.id !== meshMeasurementToRemove.id));
              toast.success('Medida removida');
              return;
            }
            
            // Check angle measurements
            const angleMeasurementToRemove = angleMeasurements.find(m => {
              // Check distance to any of the two lines forming the angle
              const dist1 = pointToLineDistance(pointer, m.point1, m.point2);
              const dist2 = pointToLineDistance(pointer, m.point2, m.point3);
              return Math.min(dist1, dist2) < clickThreshold;
            });
            
            if (angleMeasurementToRemove) {
              setAngleMeasurements(prev => prev.filter(m => m.id !== angleMeasurementToRemove.id));
              toast.success('Medida de ângulo removida');
              return;
            }
            
            toast.info('Clique sobre uma marcação para apagar');
          }
        } else if (activeTool === 'intervention_area') {
          const interventionIndicator = createVolumeIndicator(
            pointer.x,
            pointer.y,
            toolParams.brushSize,
            toolParams.volumeMode
          );
          canvas.add(interventionIndicator);
          canvas.renderAll();
          
          const canvasObj: CanvasObject = {
            id: `intervention_${Date.now()}`,
            type: 'intervention_area',
            points: [{ x: pointer.x, y: pointer.y }],
            color: toolParams.volumeMode === 'add' ? '#22c55e' : '#ef4444',
            strokeWidth: toolParams.brushSize,
            opacity: 0.4,
            layer: 'simulation',
            metadata: { interventionType: toolParams.interventionType },
          };
          addObject(canvasObj);
          onObjectAdded?.(canvasObj);
          toast.success(`Área de intervenção: ${toolParams.interventionType}`);
        } else if (activeTool === 'correction_vector') {
          // correction_vector = Vetor de Correção (draw arrows with direction + magnitude)
          warpStartRef.current = { x: pointer.x, y: pointer.y };
        } else if (activeTool === 'annotate') {
          const text = prompt('Digite sua anotação:');
          if (text) {
            const textObj = new fabric.IText(text, {
              left: pointer.x,
              top: pointer.y,
              fontSize: toolParams.annotationFontSize,
              fill: toolParams.annotationColor,
              fontFamily: 'sans-serif',
              selectable: true,
              editable: true,
            });
            (textObj as any).toolType = 'annotate';
            (textObj as any).customName = 'annotation_text';
            canvas.add(textObj);
            canvas.renderAll();
            
            const canvasObj: CanvasObject = {
              id: `annotate_${Date.now()}`,
              type: 'annotation',
              points: [{ x: pointer.x, y: pointer.y }],
              color: toolParams.annotationColor,
              strokeWidth: 1,
              opacity: 1,
              layer: 'markings',
            };
            addObject(canvasObj);
            onObjectAdded?.(canvasObj);
            toast.success('Anotação adicionada');
          }
        } else if (activeTool === 'measure') {
          // Free canvas measurement - click anywhere on image
          if (!measureStart) {
            // First click - set start point
            setMeasureStart({ x: pointer.x, y: pointer.y });
            toast.info('Clique no segundo ponto para medir');
          } else {
            // Second click - complete measurement
            const newMeasurement = {
              id: `measure_${Date.now()}`,
              start: measureStart,
              end: { x: pointer.x, y: pointer.y },
            };
            setMeasurements(prev => [...prev, newMeasurement]);
            setMeasureStart(null);
            
            // Calculate distance
            const dx = pointer.x - measureStart.x;
            const dy = pointer.y - measureStart.y;
            const pixelDistance = Math.sqrt(dx * dx + dy * dy);
            
            if (isCalibrated && pixelsPerMm) {
              const cmDistance = pixelDistance / pixelsPerMm / 10; // mm to cm
              toast.success(`Distância: ${cmDistance.toFixed(2)} cm`);
            } else {
              toast.success(`Distância: ${pixelDistance.toFixed(1)} px (calibre para ver em cm)`);
            }
          }
        }
      };

      const handleMouseUp = (e: any) => {
        // correction_vector = Vetor de Correção (creates arrows with direction + magnitude)
        if (activeTool === 'correction_vector' && warpStartRef.current) {
          const pointer = canvas.getPointer(e.e);
          const start = warpStartRef.current;
          
          // Only create arrow if there's significant movement
          const distance = Math.sqrt((pointer.x - start.x) ** 2 + (pointer.y - start.y) ** 2);
          if (distance > 10) {
            const warpArrow = createWarpArrow(start.x, start.y, pointer.x, pointer.y);
            canvas.add(warpArrow);
            canvas.renderAll();
            
            // Calculate magnitude in mm if calibrated
            const magnitudePx = distance;
            const magnitudeMm = isCalibrated && pixelsPerMm ? magnitudePx / pixelsPerMm : undefined;
            
            const canvasObj: CanvasObject = {
              id: `correction_${Date.now()}`,
              type: 'correction_vector',
              points: [start, { x: pointer.x, y: pointer.y }],
              color: '#f59e0b',
              strokeWidth: 3,
              opacity: 1,
              layer: 'simulation',
              metadata: { 
                magnitudePx, 
                magnitudeMm,
                procedure: toolParams.procedure,
              },
            };
            addObject(canvasObj);
            onObjectAdded?.(canvasObj);
            
            const message = magnitudeMm 
              ? `Vetor de correção: ${magnitudeMm.toFixed(1)}mm` 
              : `Vetor de correção: ${magnitudePx.toFixed(0)}px`;
            toast.success(message);
          }
          warpStartRef.current = null;
        }

        // Só fecha um passo se o arraste chegou a existir.
        if (pullAnchorRef.current) {
          pullAnchorRef.current = null;
          onWarpPullEndRef.current?.();
        }
      };

      const handleMouseMove = (e: any) => {
        const pointer = canvas.getPointer(e.e);
        setCursorPosition({ x: pointer.x, y: pointer.y });

        const anchor = pullAnchorRef.current;
        if (activeTool !== 'skin_pull' || !anchor || !onWarpPullRef.current) return;

        const normalized = toNormalized(pointer);
        const dx = normalized.x - anchor.x;
        const dy = normalized.y - anchor.y;

        // Incremental: cada quadro aplica só o trecho percorrido desde o anterior, para
        // que o deslocamento acompanhe o cursor em vez de multiplicar a cada evento.
        if (Math.hypot(dx, dy) < 0.002) return;

        onWarpPullRef.current(anchor.pointIndex, dx, dy);
        pullAnchorRef.current = { ...anchor, x: normalized.x, y: normalized.y };
      };

      const handleMouseOver = () => setIsMouseOverCanvas(true);
      const handleMouseOut = () => setIsMouseOverCanvas(false);

      canvas.on('path:created', handlePathCreated);
      canvas.on('mouse:down', handleMouseDown);
      canvas.on('mouse:up', handleMouseUp);
      canvas.on('mouse:move', handleMouseMove);
      canvas.on('mouse:over', handleMouseOver);
      canvas.on('mouse:out', handleMouseOut);

      return () => {
        canvas.off('path:created', handlePathCreated);
        canvas.off('mouse:down', handleMouseDown);
        canvas.off('mouse:up', handleMouseUp);
        canvas.off('mouse:move', handleMouseMove);
        canvas.off('mouse:over', handleMouseOver);
        canvas.off('mouse:out', handleMouseOut);
      };
    }, [activeTool, toolParams, addObject, onObjectAdded, isPanMode, isCalibrating, calibrationStep, setPoint1, setPoint2, measureStart, isCalibrated, pixelsPerMm]);

    // Clear measure/angle state when switching tools
    useEffect(() => {
      if (activeTool !== 'measure') {
        setMeasureStart(null);
        setMeshMeasureStart(null);
      }
      if (activeTool !== 'angle') {
        setAnglePoints([]);
      }
    }, [activeTool]);

    // Handler for mesh point clicks in measure mode
    const handleMeshPointClick = useCallback((pointId: number, canvasX: number, canvasY: number) => {
      // Distance measurement
      if (activeTool === 'measure') {
        if (!meshMeasureStart) {
          setMeshMeasureStart({ pointId, x: canvasX, y: canvasY });
          toast.info(`Ponto #${pointId} selecionado. Clique em outro ponto para medir.`);
        } else {
          const dx = canvasX - meshMeasureStart.x;
          const dy = canvasY - meshMeasureStart.y;
          const distancePx = Math.sqrt(dx * dx + dy * dy);
          
          const newMeasurement: MeshMeasurement = {
            id: `mesh_measure_${Date.now()}`,
            point1Id: meshMeasureStart.pointId,
            point2Id: pointId,
            point1: { x: meshMeasureStart.x, y: meshMeasureStart.y },
            point2: { x: canvasX, y: canvasY },
            distancePx,
          };
          
          setMeshMeasurements(prev => [...prev, newMeasurement]);
          setMeshMeasureStart(null);
          
          if (isCalibrated && pixelsPerMm) {
            const mmDistance = distancePx / pixelsPerMm;
            toast.success(`#${meshMeasureStart.pointId} → #${pointId}: ${mmDistance.toFixed(2)} mm`);
          } else {
            toast.success(`#${meshMeasureStart.pointId} → #${pointId}: ${distancePx.toFixed(1)} px`);
          }
        }
        return;
      }
      
      // Angle measurement (3 points)
      if (activeTool === 'angle') {
        const newPoints = [...anglePoints, { pointId, x: canvasX, y: canvasY }];
        
        if (newPoints.length < 3) {
          setAnglePoints(newPoints);
          const remaining = 3 - newPoints.length;
          toast.info(`Ponto #${pointId} selecionado. Selecione mais ${remaining} ponto${remaining > 1 ? 's' : ''}.`);
        } else {
          // Calculate angle with point2 as vertex
          const [p1, p2, p3] = newPoints; // p2 is the vertex
          
          // Vectors from vertex to other points
          const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
          const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
          
          // Dot product and magnitudes
          const dot = v1.x * v2.x + v1.y * v2.y;
          const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
          const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
          
          // Angle in degrees
          const cosAngle = dot / (mag1 * mag2);
          const angleDegrees = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
          
          const newAngle: MeshAngleMeasurement = {
            id: `angle_measure_${Date.now()}`,
            point1Id: p1.pointId,
            point2Id: p2.pointId, // vertex
            point3Id: p3.pointId,
            point1: { x: p1.x, y: p1.y },
            point2: { x: p2.x, y: p2.y }, // vertex
            point3: { x: p3.x, y: p3.y },
            angleDegrees,
          };
          
          setAngleMeasurements(prev => [...prev, newAngle]);
          setAnglePoints([]);
          
          toast.success(`Ângulo #${p1.pointId}-#${p2.pointId}-#${p3.pointId}: ${angleDegrees.toFixed(1)}°`);
        }
        return;
      }
    }, [activeTool, meshMeasureStart, anglePoints, isCalibrated, pixelsPerMm]);

    // Keyboard listener for measurements
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (measureStart) {
            setMeasureStart(null);
            toast.info('Medição cancelada');
          }
          if (meshMeasureStart) {
            setMeshMeasureStart(null);
            toast.info('Medição de landmark cancelada');
          }
          if (anglePoints.length > 0) {
            setAnglePoints([]);
            toast.info('Medição de ângulo cancelada');
          }
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (activeTool === 'measure') {
            if (meshMeasurements.length > 0) {
              setMeshMeasurements(prev => prev.slice(0, -1));
              toast.info('Última medição de landmark removida');
            } else if (measurements.length > 0) {
              setMeasurements(prev => prev.slice(0, -1));
              toast.info('Última medição removida');
            }
          }
          if (activeTool === 'angle') {
            if (angleMeasurements.length > 0) {
              setAngleMeasurements(prev => prev.slice(0, -1));
              toast.info('Última medição de ângulo removida');
            }
          }
        }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [measureStart, meshMeasureStart, anglePoints, activeTool, measurements.length, meshMeasurements.length, angleMeasurements.length]);

    // Pan handling
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      let isDragging = false;
      let lastPosX = 0;
      let lastPosY = 0;

      const handleMouseDown = (e: any) => {
        if (isPanMode || e.e.button === 1) {
          isDragging = true;
          canvas.defaultCursor = 'grabbing';
          lastPosX = e.e.clientX;
          lastPosY = e.e.clientY;
          e.e.preventDefault();
        }
      };

      const handleMouseMove = (e: any) => {
        if (isDragging) {
          const vpt = canvas.viewportTransform;
          if (vpt) {
            vpt[4] += e.e.clientX - lastPosX;
            vpt[5] += e.e.clientY - lastPosY;
            canvas.requestRenderAll();
            lastPosX = e.e.clientX;
            lastPosY = e.e.clientY;
            setPan({ x: vpt[4], y: vpt[5] });
          }
        }
      };

      const handleMouseUp = () => {
        isDragging = false;
        if (isPanMode) {
          canvas.defaultCursor = 'grab';
        } else {
          canvas.defaultCursor = TOOL_CURSORS[activeTool];
        }
      };

      canvas.on('mouse:down', handleMouseDown);
      canvas.on('mouse:move', handleMouseMove);
      canvas.on('mouse:up', handleMouseUp);

      return () => {
        canvas.off('mouse:down', handleMouseDown);
        canvas.off('mouse:move', handleMouseMove);
        canvas.off('mouse:up', handleMouseUp);
      };
    }, [isPanMode, activeTool, setPan]);

    // Zoom handling
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const handleWheel = (opt: any) => {
        const delta = opt.e.deltaY;
        let newZoom = canvas.getZoom() * (delta > 0 ? 0.95 : 1.05);
        newZoom = Math.max(0.1, Math.min(5, newZoom));
        
        const point = new fabric.Point(opt.e.offsetX, opt.e.offsetY);
        canvas.zoomToPoint(point, newZoom);
        setZoom(newZoom);
        
        opt.e.preventDefault();
        opt.e.stopPropagation();
      };

      canvas.on('mouse:wheel', handleWheel);

      return () => {
        canvas.off('mouse:wheel', handleWheel);
      };
    }, [setZoom]);

    // Expose methods
    useImperativeHandle(ref, () => ({
      undo: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        
        const objs = canvas.getObjects().filter(isAnnotationObject);
        if (objs.length > 0) {
          canvas.remove(objs[objs.length - 1]);
          canvas.renderAll();
          stateUndo();
          toast.info('Ação desfeita');
        }
      },
      redo: () => {
        stateRedo();
        toast.info('Ação refeita');
      },
      exportMarkings: () => {
        const canvas = fabricRef.current;
        if (!canvas || !imageBounds.width) return { markings: [], frame: null };

        return {
          // `customName` não é propriedade padrão do Fabric: sem pedir explicitamente ela
          // não entra na serialização, e sem ela o objeto restaurado deixaria de ser
          // reconhecido como anotação na próxima gravação.
          markings: canvas.getObjects().filter(isAnnotationObject).map(obj => obj.toObject(['customName'])),
          frame: { ...imageBounds },
        };
      },
      loadMarkings: async (markings, frame) => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        suppressAnnotationEventsRef.current = true;
        try {
          canvas.getObjects().filter(isAnnotationObject).forEach(obj => canvas.remove(obj));

          if (markings.length === 0 || !frame || !imageBounds.width) {
            canvas.renderAll();
            return;
          }

          const revived = await fabric.util.enlivenObjects<fabric.FabricObject>(markings);

          // A foto pode estar exibida em outro tamanho que quando a marcação foi feita.
          for (const object of revived) {
            repositionForFrame(object, frame, imageBounds);
            canvas.add(object);
          }

          canvas.renderAll();
        } finally {
          suppressAnnotationEventsRef.current = false;
        }
      },
      clear: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        
        const toRemove = canvas.getObjects().filter(isAnnotationObject);
        toRemove.forEach(obj => canvas.remove(obj));
        canvas.renderAll();
        clearObjects();
        toast.success('Canvas limpo');
      },
      exportImage: () => {
        const canvas = fabricRef.current;
        if (!canvas) return null;

        // O canvas do Fabric tem o tamanho do contêiner, não o da foto, e `toDataURL`
        // respeita o viewportTransform. Exportando direto, o arquivo dependia de onde a
        // tela estava: a 100% saía com as margens do canvas em volta, e com zoom saía
        // cortado no pedaço visível. Aqui a exportação é sempre a região da foto, em
        // resolução nativa, independente de zoom e deslocamento.
        if (!imageBounds.width || !imageBounds.height) {
          return canvas.toDataURL({ multiplier: 1, format: 'png', quality: 1 });
        }

        const previousTransform = canvas.viewportTransform
          ? ([...canvas.viewportTransform] as typeof canvas.viewportTransform)
          : undefined;

        const naturalWidth = sourceImageElRef.current?.naturalWidth ?? imageBounds.width;
        const multiplier = naturalWidth / imageBounds.width;

        try {
          canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
          return canvas.toDataURL({
            format: 'png',
            quality: 1,
            left: imageBounds.left,
            top: imageBounds.top,
            width: imageBounds.width,
            height: imageBounds.height,
            multiplier,
          });
        } finally {
          if (previousTransform) canvas.setViewportTransform(previousTransform);
        }
      },
      getCanvasState: () => {
        const canvas = fabricRef.current;
        if (!canvas) return null;
        return canvas.toJSON();
      },
      getCanvas: () => fabricRef.current,
      getCanvasDataUrl: () => {
        const canvas = fabricRef.current;
        if (!canvas) return null;
        return canvas.toDataURL({ multiplier: 1, format: 'png', quality: 0.9 });
      },
    }));

    // Prévia do alcance da manobra (item D): quais landmarks o arraste atingiria a partir
    // da posição do cursor, e com que peso. Usa exatamente o mesmo critério de computePull
    // — distância pela pele e atenuação por cosseno — para não prometer na tela um alcance
    // diferente do que a ferramenta aplica. A ancoragem anatômica não entra aqui: ela
    // reduz o quanto cada ponto cede, não se ele é alcançado.
    const warpPreview = useMemo(() => {
      const landmarks = mediaPipeMeshData?.points;
      if (activeTool !== 'skin_pull' || !isMouseOverCanvas) return null;
      if (!landmarks?.length || !warpRadius || !imageBounds.width) return null;

      const normalized = {
        x: (cursorPosition.x - imageBounds.left) / imageBounds.width,
        y: (cursorPosition.y - imageBounds.top) / (imageBounds.height || 1),
      };

      let nearestIndex = -1;
      let nearestDistance = Infinity;
      landmarks.forEach((point, index) => {
        const distance = (point.x - normalized.x) ** 2 + (point.y - normalized.y) ** 2;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      // Mesmo limiar do arraste: fora disso o clique não pega o rosto.
      if (nearestIndex < 0 || Math.sqrt(nearestDistance) > 0.12) return null;

      const surface = geodesicDistancesFrom(landmarks, nearestIndex);
      const anchor = landmarks[nearestIndex];

      const reached: { x: number; y: number; weight: number }[] = [];
      landmarks.forEach((point, index) => {
        const distance = surface
          ? surface.get(index)
          : Math.hypot(point.x - anchor.x, point.y - anchor.y);
        if (distance === undefined || distance > warpRadius) return;
        reached.push({
          x: point.x,
          y: point.y,
          weight: (Math.cos((distance / warpRadius) * Math.PI) + 1) / 2,
        });
      });

      return { anchor, reached };
    }, [activeTool, isMouseOverCanvas, mediaPipeMeshData, warpRadius, cursorPosition, imageBounds]);

    const handleZoomIn = () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const newZoom = Math.min(5, zoom * 1.2);
      canvas.setZoom(newZoom);
      setZoom(newZoom);
    };

    const handleZoomOut = () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const newZoom = Math.max(0.1, zoom / 1.2);
      canvas.setZoom(newZoom);
      setZoom(newZoom);
    };

    const handleFitToScreen = () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.setZoom(1);
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };

    // Determine if cursor preview should be shown
    const showCursorPreview = isMouseOverCanvas && !isPanMode && ['intervention_area', 'eraser', 'surgical_marking'].includes(activeTool);
    const cursorSize = activeTool === 'intervention_area' ? toolParams.brushSize : 
                       activeTool === 'surgical_marking' ? 16 : 20;
    const cursorColor = TOOL_COLORS[activeTool] || '#0ea5e9';

    return (
      <div 
        ref={containerRef} 
        className={cn(
          "relative h-full w-full overflow-hidden bg-canvas-bg",
          isPanMode && "cursor-grab"
        )}
        onMouseEnter={() => setIsMouseOverCanvas(true)}
        onMouseLeave={() => setIsMouseOverCanvas(false)}
      >
        <canvas ref={canvasRef} />

        {/* Measurement Rulers */}
        <CanvasRuler
          visible={showRuler}
          zoom={zoom}
          panX={fabricRef.current?.viewportTransform?.[4] || 0}
          panY={fabricRef.current?.viewportTransform?.[5] || 0}
          containerWidth={containerRef.current?.clientWidth || 0}
          containerHeight={containerRef.current?.clientHeight || 0}
          isCalibrated={isCalibrated}
          pixelsPerMm={pixelsPerMm}
          onCalibrate={startCalibration}
        />

        {/* Measurement Overlay - Styled like reference app */}
        {(measureStart || measurements.length > 0) && (
          <svg
            className="absolute inset-0 z-25 pointer-events-none"
            width={containerRef.current?.clientWidth || 0}
            height={containerRef.current?.clientHeight || 0}
          >
            {/* Completed measurements */}
            {measurements.map((m) => {
              const panX = fabricRef.current?.viewportTransform?.[4] || 0;
              const panY = fabricRef.current?.viewportTransform?.[5] || 0;
              const startScreen = { x: m.start.x * zoom + panX, y: m.start.y * zoom + panY };
              const endScreen = { x: m.end.x * zoom + panX, y: m.end.y * zoom + panY };
              
              const dx = m.end.x - m.start.x;
              const dy = m.end.y - m.start.y;
              const pixelDist = Math.sqrt(dx * dx + dy * dy);
              const displayDist = isCalibrated && pixelsPerMm 
                ? `${(pixelDist / pixelsPerMm / 10).toFixed(2)} cm` 
                : `${pixelDist.toFixed(1)} px`;
              
              const midX = (startScreen.x + endScreen.x) / 2;
              const midY = (startScreen.y + endScreen.y) / 2;
              
              // Calculate angle for perpendicular tick marks
              const angle = Math.atan2(endScreen.y - startScreen.y, endScreen.x - startScreen.x);
              const perpAngle = angle + Math.PI / 2;
              const tickLength = 8;
              
              return (
                <g key={m.id}>
                  {/* Main measurement line - solid purple */}
                  <line
                    x1={startScreen.x}
                    y1={startScreen.y}
                    x2={endScreen.x}
                    y2={endScreen.y}
                    stroke="#7c3aed"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                  
                  {/* Start tick mark (perpendicular) */}
                  <line
                    x1={startScreen.x - Math.cos(perpAngle) * tickLength}
                    y1={startScreen.y - Math.sin(perpAngle) * tickLength}
                    x2={startScreen.x + Math.cos(perpAngle) * tickLength}
                    y2={startScreen.y + Math.sin(perpAngle) * tickLength}
                    stroke="#7c3aed"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                  
                  {/* End tick mark (perpendicular) */}
                  <line
                    x1={endScreen.x - Math.cos(perpAngle) * tickLength}
                    y1={endScreen.y - Math.sin(perpAngle) * tickLength}
                    x2={endScreen.x + Math.cos(perpAngle) * tickLength}
                    y2={endScreen.y + Math.sin(perpAngle) * tickLength}
                    stroke="#7c3aed"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                  
                  {/* Distance label with background */}
                  <rect
                    x={midX - 35}
                    y={midY - 14}
                    width={70}
                    height={24}
                    rx={4}
                    fill="hsl(var(--background))"
                    stroke="#7c3aed"
                    strokeWidth={2}
                  />
                  <text
                    x={midX}
                    y={midY + 5}
                    textAnchor="middle"
                    fill="#7c3aed"
                    className="text-sm font-bold font-mono"
                  >
                    {displayDist}
                  </text>
                </g>
              );
            })}
            
            {/* Active measurement in progress */}
            {measureStart && activeTool === 'measure' && (
              <g>
                {(() => {
                  const panX = fabricRef.current?.viewportTransform?.[4] || 0;
                  const panY = fabricRef.current?.viewportTransform?.[5] || 0;
                  const startScreen = { x: measureStart.x * zoom + panX, y: measureStart.y * zoom + panY };
                  const endScreen = { x: cursorPosition.x * zoom + panX, y: cursorPosition.y * zoom + panY };
                  
                  const dx = cursorPosition.x - measureStart.x;
                  const dy = cursorPosition.y - measureStart.y;
                  const pixelDist = Math.sqrt(dx * dx + dy * dy);
                  const displayDist = isCalibrated && pixelsPerMm 
                    ? `${(pixelDist / pixelsPerMm / 10).toFixed(2)} cm` 
                    : `${pixelDist.toFixed(1)} px`;
                  
                  const midX = (startScreen.x + endScreen.x) / 2;
                  const midY = (startScreen.y + endScreen.y) / 2;
                  
                  // Calculate angle for perpendicular tick marks
                  const angle = Math.atan2(endScreen.y - startScreen.y, endScreen.x - startScreen.x);
                  const perpAngle = angle + Math.PI / 2;
                  const tickLength = 8;
                  
                  return (
                    <>
                      {/* Preview line - solid purple */}
                      <line
                        x1={startScreen.x}
                        y1={startScreen.y}
                        x2={endScreen.x}
                        y2={endScreen.y}
                        stroke="#7c3aed"
                        strokeWidth={3}
                        strokeLinecap="round"
                        opacity={0.8}
                      />
                      
                      {/* Start tick mark */}
                      <line
                        x1={startScreen.x - Math.cos(perpAngle) * tickLength}
                        y1={startScreen.y - Math.sin(perpAngle) * tickLength}
                        x2={startScreen.x + Math.cos(perpAngle) * tickLength}
                        y2={startScreen.y + Math.sin(perpAngle) * tickLength}
                        stroke="#7c3aed"
                        strokeWidth={3}
                        strokeLinecap="round"
                      />
                      
                      {/* Preview distance */}
                      {pixelDist > 20 && (
                        <>
                          {/* End tick mark (preview) */}
                          <line
                            x1={endScreen.x - Math.cos(perpAngle) * tickLength}
                            y1={endScreen.y - Math.sin(perpAngle) * tickLength}
                            x2={endScreen.x + Math.cos(perpAngle) * tickLength}
                            y2={endScreen.y + Math.sin(perpAngle) * tickLength}
                            stroke="#7c3aed"
                            strokeWidth={3}
                            strokeLinecap="round"
                            opacity={0.8}
                          />
                          <rect
                            x={midX - 35}
                            y={midY - 14}
                            width={70}
                            height={24}
                            rx={4}
                            fill="hsl(var(--background) / 0.95)"
                            stroke="#7c3aed"
                            strokeWidth={2}
                          />
                          <text
                            x={midX}
                            y={midY + 5}
                            textAnchor="middle"
                            fill="#7c3aed"
                            className="text-sm font-bold font-mono"
                          >
                            {displayDist}
                          </text>
                        </>
                      )}
                    </>
                  );
                })()}
              </g>
            )}
          </svg>
        )}

        {/* Calibration Overlay */}
        <CalibrationOverlay
          containerWidth={containerRef.current?.clientWidth || 0}
          containerHeight={containerRef.current?.clientHeight || 0}
          zoom={zoom}
          panX={fabricRef.current?.viewportTransform?.[4] || 0}
          panY={fabricRef.current?.viewportTransform?.[5] || 0}
        />

        {/* Cursor Size Preview */}
        {showCursorPreview && (
          <div
            className="pointer-events-none absolute rounded-full border-2 transition-all duration-75"
            style={{
              width: cursorSize * zoom,
              height: cursorSize * zoom,
              left: cursorPosition.x * zoom + (fabricRef.current?.viewportTransform?.[4] || 0) - (cursorSize * zoom) / 2,
              top: cursorPosition.y * zoom + (fabricRef.current?.viewportTransform?.[5] || 0) - (cursorSize * zoom) / 2,
              borderColor: cursorColor,
              backgroundColor: `${cursorColor}20`,
            }}
          />
        )}

        {/* Facial Mesh Overlay (Legacy/AI-generated) */}
        <FacialMesh
          canvas={fabricRef.current}
          meshData={meshData || null}
          visible={showMesh && !!meshData && !mediaPipeMeshData}
          opacity={meshOpacity}
          imageWidth={imageBounds.width}
          imageHeight={imageBounds.height}
          imageLeft={imageBounds.left}
          imageTop={imageBounds.top}
          editMode={meshEditMode}
          connectingFrom={connectingFrom}
          onPointMove={onMeshPointMove}
          onPointAdd={onMeshPointAdd}
          onPointRemove={onMeshPointRemove}
          onStartConnection={onMeshStartConnection}
          onAddConnection={onMeshAddConnection}
          onRemoveConnection={onMeshRemoveConnection}
        />

        {/* MediaPipe Mesh Overlay (Real landmarks) */}
        <MediaPipeMeshRenderer
          canvas={fabricRef.current}
          meshData={mediaPipeMeshData || null}
          visible={showMesh && !!mediaPipeMeshData}
          opacity={meshOpacity}
          density={meshDensity}
          visualStyle={meshVisualStyle}
          imageWidth={imageBounds.width}
          imageHeight={imageBounds.height}
          imageLeft={imageBounds.left}
          imageTop={imageBounds.top}
          activeTool={activeTool}
          onMeshPointClick={handleMeshPointClick}
        />

        {/* Mesh Landmark Measurements Overlay */}
        {(meshMeasurements.length > 0 || meshMeasureStart) && (
          <svg
            className="absolute inset-0 pointer-events-none z-30"
            style={{ width: '100%', height: '100%' }}
          >
            {/* Completed mesh measurements */}
            {meshMeasurements.map(m => {
              const panX = fabricRef.current?.viewportTransform?.[4] || 0;
              const panY = fabricRef.current?.viewportTransform?.[5] || 0;
              const p1Screen = { x: m.point1.x * zoom + panX, y: m.point1.y * zoom + panY };
              const p2Screen = { x: m.point2.x * zoom + panX, y: m.point2.y * zoom + panY };
              const midX = (p1Screen.x + p2Screen.x) / 2;
              const midY = (p1Screen.y + p2Screen.y) / 2;
              
              const displayDist = isCalibrated && pixelsPerMm 
                ? `${(m.distancePx / pixelsPerMm).toFixed(2)} mm` 
                : `${m.distancePx.toFixed(1)} px`;
              
              return (
                <g key={m.id}>
                  <line
                    x1={p1Screen.x}
                    y1={p1Screen.y}
                    x2={p2Screen.x}
                    y2={p2Screen.y}
                    stroke="#22c55e"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                  <circle cx={p1Screen.x} cy={p1Screen.y} r={6} fill="#22c55e" stroke="#fff" strokeWidth={1} />
                  <circle cx={p2Screen.x} cy={p2Screen.y} r={6} fill="#22c55e" stroke="#fff" strokeWidth={1} />
                  <text x={p1Screen.x} y={p1Screen.y - 8} textAnchor="middle" className="fill-foreground text-[10px] font-mono">
                    #{m.point1Id}
                  </text>
                  <text x={p2Screen.x} y={p2Screen.y - 8} textAnchor="middle" className="fill-foreground text-[10px] font-mono">
                    #{m.point2Id}
                  </text>
                  <rect
                    x={midX - 35}
                    y={midY - 12}
                    width={70}
                    height={20}
                    rx={4}
                    fill="hsl(var(--background))"
                    stroke="#22c55e"
                    strokeWidth={1}
                  />
                  <text
                    x={midX}
                    y={midY + 4}
                    textAnchor="middle"
                    className="fill-foreground text-xs font-mono font-medium"
                  >
                    {displayDist}
                  </text>
                </g>
              );
            })}
            
            {/* Active mesh measurement in progress */}
            {meshMeasureStart && activeTool === 'measure' && (
              <g>
                {(() => {
                  const panX = fabricRef.current?.viewportTransform?.[4] || 0;
                  const panY = fabricRef.current?.viewportTransform?.[5] || 0;
                  const startScreen = { x: meshMeasureStart.x * zoom + panX, y: meshMeasureStart.y * zoom + panY };
                  
                  return (
                    <>
                      <circle cx={startScreen.x} cy={startScreen.y} r={8} fill="#22c55e" stroke="#fff" strokeWidth={2} />
                      <text x={startScreen.x} y={startScreen.y - 12} textAnchor="middle" className="fill-foreground text-[10px] font-mono font-bold">
                        #{meshMeasureStart.pointId}
                      </text>
                    </>
                  );
                })()}
              </g>
            )}
          </svg>
        )}

        {/* Angle Measurements Overlay */}
        {(angleMeasurements.length > 0 || anglePoints.length > 0) && (
          <svg
            className="absolute inset-0 pointer-events-none z-30"
            style={{ width: '100%', height: '100%' }}
          >
            {/* Completed angle measurements */}
            {angleMeasurements.map(m => {
              const panX = fabricRef.current?.viewportTransform?.[4] || 0;
              const panY = fabricRef.current?.viewportTransform?.[5] || 0;
              const p1Screen = { x: m.point1.x * zoom + panX, y: m.point1.y * zoom + panY };
              const p2Screen = { x: m.point2.x * zoom + panX, y: m.point2.y * zoom + panY }; // vertex
              const p3Screen = { x: m.point3.x * zoom + panX, y: m.point3.y * zoom + panY };
              
              // Calculate arc path for angle visualization
              const arcRadius = 25;
              const angle1 = Math.atan2(p1Screen.y - p2Screen.y, p1Screen.x - p2Screen.x);
              const angle3 = Math.atan2(p3Screen.y - p2Screen.y, p3Screen.x - p2Screen.x);
              const startAngle = Math.min(angle1, angle3);
              const endAngle = Math.max(angle1, angle3);
              const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
              
              const arcStart = {
                x: p2Screen.x + arcRadius * Math.cos(startAngle),
                y: p2Screen.y + arcRadius * Math.sin(startAngle)
              };
              const arcEnd = {
                x: p2Screen.x + arcRadius * Math.cos(endAngle),
                y: p2Screen.y + arcRadius * Math.sin(endAngle)
              };
              
              // Label position (midpoint of arc)
              const midAngle = (startAngle + endAngle) / 2;
              const labelRadius = arcRadius + 18;
              const labelPos = {
                x: p2Screen.x + labelRadius * Math.cos(midAngle),
                y: p2Screen.y + labelRadius * Math.sin(midAngle)
              };
              
              return (
                <g key={m.id}>
                  {/* Lines from vertex to points */}
                  <line
                    x1={p2Screen.x}
                    y1={p2Screen.y}
                    x2={p1Screen.x}
                    y2={p1Screen.y}
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                  <line
                    x1={p2Screen.x}
                    y1={p2Screen.y}
                    x2={p3Screen.x}
                    y2={p3Screen.y}
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                  {/* Arc */}
                  <path
                    d={`M ${arcStart.x} ${arcStart.y} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${arcEnd.x} ${arcEnd.y}`}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth={2}
                  />
                  {/* Points */}
                  <circle cx={p1Screen.x} cy={p1Screen.y} r={6} fill="#f97316" stroke="#fff" strokeWidth={1} />
                  <circle cx={p2Screen.x} cy={p2Screen.y} r={8} fill="#f97316" stroke="#fff" strokeWidth={2} />
                  <circle cx={p3Screen.x} cy={p3Screen.y} r={6} fill="#f97316" stroke="#fff" strokeWidth={1} />
                  {/* Point IDs */}
                  <text x={p1Screen.x} y={p1Screen.y - 10} textAnchor="middle" className="fill-foreground text-[10px] font-mono">
                    #{m.point1Id}
                  </text>
                  <text x={p2Screen.x} y={p2Screen.y - 12} textAnchor="middle" className="fill-foreground text-[10px] font-mono font-bold">
                    #{m.point2Id}
                  </text>
                  <text x={p3Screen.x} y={p3Screen.y - 10} textAnchor="middle" className="fill-foreground text-[10px] font-mono">
                    #{m.point3Id}
                  </text>
                  {/* Angle value */}
                  <rect
                    x={labelPos.x - 25}
                    y={labelPos.y - 10}
                    width={50}
                    height={20}
                    rx={4}
                    fill="hsl(var(--background))"
                    stroke="#f97316"
                    strokeWidth={1}
                  />
                  <text
                    x={labelPos.x}
                    y={labelPos.y + 5}
                    textAnchor="middle"
                    className="fill-foreground text-xs font-mono font-medium"
                  >
                    {m.angleDegrees.toFixed(1)}°
                  </text>
                </g>
              );
            })}
            
            {/* Active angle measurement in progress */}
            {anglePoints.length > 0 && activeTool === 'angle' && (
              <g>
                {(() => {
                  const panX = fabricRef.current?.viewportTransform?.[4] || 0;
                  const panY = fabricRef.current?.viewportTransform?.[5] || 0;
                  
                  return anglePoints.map((pt, idx) => {
                    const screen = { x: pt.x * zoom + panX, y: pt.y * zoom + panY };
                    const isVertex = idx === 1 && anglePoints.length === 2;
                    
                    return (
                      <g key={`angle_point_${idx}`}>
                        <circle 
                          cx={screen.x} 
                          cy={screen.y} 
                          r={isVertex ? 8 : 6} 
                          fill="#f97316" 
                          stroke="#fff" 
                          strokeWidth={isVertex ? 2 : 1} 
                        />
                        <text 
                          x={screen.x} 
                          y={screen.y - 10} 
                          textAnchor="middle" 
                          className="fill-foreground text-[10px] font-mono font-bold"
                        >
                          #{pt.pointId} {idx === 1 ? '(vértice)' : ''}
                        </text>
                        {idx > 0 && (
                          <line
                            x1={anglePoints[idx - 1].x * zoom + panX}
                            y1={anglePoints[idx - 1].y * zoom + panY}
                            x2={screen.x}
                            y2={screen.y}
                            stroke="#f97316"
                            strokeWidth={2}
                            strokeDasharray="4 2"
                            opacity={0.7}
                          />
                        )}
                      </g>
                    );
                  });
                })()}
              </g>
            )}
          </svg>
        )}

        {/* Prévia do alcance da manobra de puxar pele. Os pontos marcados são os que
            de fato se moveriam: por medir distância pela pele, a região respeita boca e
            olhos em vez de ser um círculo. O círculo tracejado fica só como referência do
            raio configurado. */}
        {warpPreview && (
          <svg className="absolute inset-0 pointer-events-none z-30" style={{ width: '100%', height: '100%' }}>
            {(() => {
              const panX = fabricRef.current?.viewportTransform?.[4] || 0;
              const panY = fabricRef.current?.viewportTransform?.[5] || 0;
              const toScreen = (nx: number, ny: number) => ({
                x: (imageBounds.left + nx * imageBounds.width) * zoom + panX,
                y: (imageBounds.top + ny * imageBounds.height) * zoom + panY,
              });
              const center = toScreen(warpPreview.anchor.x, warpPreview.anchor.y);
              const screenRadius = (warpRadius ?? 0) * imageBounds.width * zoom;

              return (
                <g>
                  <circle
                    cx={center.x}
                    cy={center.y}
                    r={screenRadius}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.5}
                  />
                  {warpPreview.reached.map((point, index) => {
                    const screen = toScreen(point.x, point.y);
                    return (
                      <circle
                        key={index}
                        cx={screen.x}
                        cy={screen.y}
                        r={2.5}
                        fill="#38bdf8"
                        opacity={0.25 + point.weight * 0.65}
                      />
                    );
                  })}
                  <circle cx={center.x} cy={center.y} r={4} fill="#0ea5e9" />
                </g>
              );
            })()}
          </svg>
        )}

        <CanvasToolbar
          zoom={zoom}
          showGrid={showGrid}
          showRuler={showRuler}
          layers={layers}
          layerOpacity={layerOpacity}
          onZoomChange={(z) => {
            const canvas = fabricRef.current;
            if (canvas) {
              canvas.setZoom(z);
              setZoom(z);
            }
          }}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitToScreen={handleFitToScreen}
          onToggleGrid={() => setShowGrid(!showGrid)}
          onToggleRuler={() => setShowRuler(!showRuler)}
          onLayerVisibilityChange={setLayerVisibility}
          onLayerOpacityChange={setLayerOpacity}
        />

        <CanvasStatusBar
          activeTool={activeTool}
          cursorPosition={cursorPosition}
          isPanning={isPanMode}
          zoom={zoom}
          objectCount={annotationCount}
        />
      </div>
    );
  }
);

SimulationCanvas.displayName = 'SimulationCanvas';
