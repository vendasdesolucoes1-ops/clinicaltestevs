// Professional Simulation Canvas with Fabric.js
import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as fabric from 'fabric';
import { ToolType } from './ToolPanel';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasStatusBar } from './CanvasStatusBar';
import { FacialMesh } from './FacialMesh';
import { MediaPipeMeshRenderer } from './MediaPipeMeshRenderer';
import { useCanvasState, Point, CanvasObject } from '@/hooks/useCanvasState';
import { FacialMeshData } from '@/types/facialLandmarks';
import { MediaPipeMeshData } from '@/types/mediapipeMesh';
import { type MeshEditMode } from '@/hooks/useFacialAnalysis';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { type MeshVisualStyle } from './MediaPipeMeshRenderer';

interface SimulationCanvasProps {
  imageUrl: string;
  activeTool: ToolType;
  isPanMode: boolean;
  onObjectAdded?: (object: CanvasObject) => void;
  meshData?: FacialMeshData | null;
  mediaPipeMeshData?: MediaPipeMeshData | null;
  showMesh?: boolean;
  meshOpacity?: number;
  meshDensity?: 'simple' | 'dense';
  meshVisualStyle?: MeshVisualStyle;
  meshEditMode?: MeshEditMode;
  connectingFrom?: string | null;
  onMeshPointMove?: (pointId: string, x: number, y: number) => void;
  onMeshPointAdd?: (x: number, y: number) => void;
  onMeshPointRemove?: (pointId: string) => void;
  onMeshStartConnection?: (fromId: string) => void;
  onMeshAddConnection?: (fromId: string, toId: string) => void;
  onMeshRemoveConnection?: (fromId: string, toId: string) => void;
}

export interface SimulationCanvasRef {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportImage: () => string | null;
  getCanvasState: () => any;
  getCanvas: () => fabric.Canvas | null;
  getCanvasDataUrl: () => string | null;
}

const TOOL_COLORS: Record<ToolType, string> = {
  select: '#0ea5e9',
  warp: '#f59e0b',
  volume: '#22c55e',
  incision: '#ef4444',
  suture: '#8b5cf6',
  annotate: '#0ea5e9',
  eraser: '#64748b',
};

const TOOL_CURSORS: Record<ToolType, string> = {
  select: 'default',
  warp: 'crosshair',
  volume: 'crosshair',
  incision: 'crosshair',
  suture: 'crosshair',
  annotate: 'text',
  eraser: 'not-allowed',
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
  const arrowSize = 10;
  
  // Main line
  const line = new fabric.Line([startX, startY, endX, endY], {
    stroke: '#f59e0b',
    strokeWidth: 3,
    selectable: false,
  });
  
  // Arrow head
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
  ({ imageUrl, activeTool, isPanMode, onObjectAdded, meshData, mediaPipeMeshData, showMesh = true, meshOpacity = 80, meshDensity = 'dense', meshVisualStyle = 'minimal', meshEditMode = 'move', connectingFrom, onMeshPointMove, onMeshPointAdd, onMeshPointRemove, onMeshStartConnection, onMeshAddConnection, onMeshRemoveConnection }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    
    const [isReady, setIsReady] = useState(false);
    const [cursorPosition, setCursorPosition] = useState<Point>({ x: 0, y: 0 });
    const [imageBounds, setImageBounds] = useState({ width: 0, height: 0, left: 0, top: 0 });
    const [isMouseOverCanvas, setIsMouseOverCanvas] = useState(false);
    
    // For warp tool - track drag start/end
    const warpStartRef = useRef<Point | null>(null);
    
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
      undo: stateUndo,
      redo: stateRedo,
    } = useCanvasState();

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
      
      fabricRef.current = canvas;
      setIsReady(true);

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
        canvas.dispose();
        fabricRef.current = null;
      };
    }, []);

    // Load background image
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas || !imageUrl) return;

      fabric.FabricImage.fromURL(imageUrl).then((img) => {
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

    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      // Only incision and suture use free drawing mode
      const drawingTools = ['incision', 'suture'];
      canvas.isDrawingMode = drawingTools.includes(activeTool);
      canvas.selection = activeTool === 'select';
      
      if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
        if (activeTool === 'incision') {
          canvas.freeDrawingBrush.color = '#ef4444';
          canvas.freeDrawingBrush.width = Math.max(2, toolParams.incisionDepth / 2);
        } else if (activeTool === 'suture') {
          canvas.freeDrawingBrush.color = '#8b5cf6';
          canvas.freeDrawingBrush.width = 2;
        }
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

      // Handle path created for incision/suture
      const handlePathCreated = (e: any) => {
        if (!e.path) return;
        
        if (activeTool === 'suture') {
          // Convert path to suture points
          const sutureGroup = createSuturePoints(
            e.path,
            toolParams.sutureSpacing,
            '#8b5cf6'
          );
          canvas.remove(e.path);
          canvas.add(sutureGroup);
          canvas.renderAll();
          
          const canvasObj: CanvasObject = {
            id: `suture_${Date.now()}`,
            type: 'suture',
            points: [],
            color: '#8b5cf6',
            strokeWidth: 2,
            opacity: 1,
            layer: 'markings',
          };
          addObject(canvasObj);
          onObjectAdded?.(canvasObj);
          toast.success('Sutura adicionada');
        } else if (activeTool === 'incision') {
          // Style incision as dashed line
          e.path.set({
            stroke: '#ef4444',
            strokeWidth: Math.max(2, toolParams.incisionDepth / 2),
            strokeDashArray: [8, 4],
            fill: 'transparent',
            selectable: true,
            evented: true,
          });
          (e.path as any).toolType = 'incision';
          (e.path as any).customName = 'incision_line';
          
          const canvasObj: CanvasObject = {
            id: `incision_${Date.now()}`,
            type: 'incision',
            points: [],
            color: '#ef4444',
            strokeWidth: toolParams.incisionDepth / 2,
            opacity: 1,
            layer: 'markings',
          };
          addObject(canvasObj);
          onObjectAdded?.(canvasObj);
          toast.success('Incisão marcada');
        }
      };

      // Handle mouse events for other tools
      const handleMouseDown = (e: any) => {
        if (isPanMode) return;
        
        const pointer = canvas.getPointer(e.e);
        
        if (activeTool === 'eraser') {
          const target = canvas.findTarget(e.e);
          if (target && (target as any).customName !== 'backgroundImage') {
            canvas.remove(target);
            canvas.renderAll();
            toast.success('Objeto removido');
          }
        } else if (activeTool === 'volume') {
          const volumeIndicator = createVolumeIndicator(
            pointer.x,
            pointer.y,
            toolParams.brushSize,
            toolParams.volumeMode
          );
          canvas.add(volumeIndicator);
          canvas.renderAll();
          
          const canvasObj: CanvasObject = {
            id: `volume_${Date.now()}`,
            type: 'volume',
            points: [{ x: pointer.x, y: pointer.y }],
            color: toolParams.volumeMode === 'add' ? '#22c55e' : '#ef4444',
            strokeWidth: toolParams.brushSize,
            opacity: 0.4,
            layer: 'simulation',
          };
          addObject(canvasObj);
          onObjectAdded?.(canvasObj);
          toast.success(toolParams.volumeMode === 'add' ? 'Volume adicionado' : 'Volume removido');
        } else if (activeTool === 'warp') {
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
        }
      };

      const handleMouseUp = (e: any) => {
        if (activeTool === 'warp' && warpStartRef.current) {
          const pointer = canvas.getPointer(e.e);
          const start = warpStartRef.current;
          
          // Only create arrow if there's significant movement
          const distance = Math.sqrt((pointer.x - start.x) ** 2 + (pointer.y - start.y) ** 2);
          if (distance > 10) {
            const warpArrow = createWarpArrow(start.x, start.y, pointer.x, pointer.y);
            canvas.add(warpArrow);
            canvas.renderAll();
            
            const canvasObj: CanvasObject = {
              id: `warp_${Date.now()}`,
              type: 'warp',
              points: [start, { x: pointer.x, y: pointer.y }],
              color: '#f59e0b',
              strokeWidth: 3,
              opacity: 1,
              layer: 'simulation',
            };
            addObject(canvasObj);
            onObjectAdded?.(canvasObj);
            toast.success('Vetor de tração adicionado');
          }
          warpStartRef.current = null;
        }
      };

      const handleMouseMove = (e: any) => {
        const pointer = canvas.getPointer(e.e);
        setCursorPosition({ x: pointer.x, y: pointer.y });
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
    }, [activeTool, toolParams, addObject, onObjectAdded, isPanMode]);

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
        
        const objs = canvas.getObjects().filter((obj: any) => 
          !obj.customName?.startsWith('grid_') && 
          !obj.customName?.startsWith('mesh_') && 
          obj.customName !== 'backgroundImage'
        );
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
      clear: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        
        const toRemove = canvas.getObjects().filter((obj: any) => 
          !obj.customName?.startsWith('grid_') && 
          !obj.customName?.startsWith('mesh_') && 
          obj.customName !== 'backgroundImage'
        );
        toRemove.forEach(obj => canvas.remove(obj));
        canvas.renderAll();
        toast.success('Canvas limpo');
      },
      exportImage: () => {
        const canvas = fabricRef.current;
        if (!canvas) return null;
        return canvas.toDataURL({ multiplier: 1, format: 'png', quality: 1 });
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
    const showCursorPreview = isMouseOverCanvas && !isPanMode && ['volume', 'eraser', 'incision', 'suture'].includes(activeTool);
    const cursorSize = activeTool === 'volume' ? toolParams.brushSize : 
                       activeTool === 'incision' ? Math.max(8, toolParams.incisionDepth / 2) : 
                       activeTool === 'suture' ? 16 : 20;
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
        />

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
          objectCount={objects.length}
        />
      </div>
    );
  }
);

SimulationCanvas.displayName = 'SimulationCanvas';
