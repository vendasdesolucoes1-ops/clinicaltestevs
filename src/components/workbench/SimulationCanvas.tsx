// Professional Simulation Canvas with Fabric.js
import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as fabric from 'fabric';
import { ToolType } from './ToolPanel';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasStatusBar } from './CanvasStatusBar';
import { FacialMesh } from './FacialMesh';
import { useCanvasState, Point, CanvasObject } from '@/hooks/useCanvasState';
import { FacialMeshData } from '@/types/facialLandmarks';
import { type MeshEditMode } from '@/hooks/useFacialAnalysis';
import { cn } from '@/lib/utils';

interface SimulationCanvasProps {
  imageUrl: string;
  activeTool: ToolType;
  isPanMode: boolean;
  onObjectAdded?: (object: CanvasObject) => void;
  meshData?: FacialMeshData | null;
  showMesh?: boolean;
  meshOpacity?: number;
  meshEditMode?: MeshEditMode;
  connectingFrom?: string | null;
  onMeshPointMove?: (pointId: string, x: number, y: number) => void;
  onMeshPointAdd?: (x: number, y: number) => void;
  onMeshPointRemove?: (pointId: string) => void;
  onMeshStartConnection?: (fromId: string) => void;
  onMeshAddConnection?: (fromId: string, toId: string) => void;
}

export interface SimulationCanvasRef {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportImage: () => string | null;
  getCanvasState: () => any;
  getCanvas: () => fabric.Canvas | null;
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
  eraser: 'pointer',
};

export const SimulationCanvas = forwardRef<SimulationCanvasRef, SimulationCanvasProps>(
  ({ imageUrl, activeTool, isPanMode, onObjectAdded, meshData, showMesh = true, meshOpacity = 80, meshEditMode = 'move', connectingFrom, onMeshPointMove, onMeshPointAdd, onMeshPointRemove, onMeshStartConnection, onMeshAddConnection }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    
    const [isReady, setIsReady] = useState(false);
    const [cursorPosition, setCursorPosition] = useState<Point>({ x: 0, y: 0 });
    const [imageBounds, setImageBounds] = useState({ width: 0, height: 0, left: 0, top: 0 });
    
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
        
        // Salvar bounds da imagem para o mesh
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
    }, [imageUrl, isReady, layerOpacity.original]);

    // Configure drawing mode
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      canvas.isDrawingMode = ['warp', 'volume', 'incision', 'suture', 'annotate'].includes(activeTool);
      canvas.selection = activeTool === 'select';
      
      if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = TOOL_COLORS[activeTool];
        canvas.freeDrawingBrush.width = toolParams.brushSize;
      }
      
      if (!isPanMode) {
        canvas.defaultCursor = TOOL_CURSORS[activeTool];
        canvas.hoverCursor = TOOL_CURSORS[activeTool];
      }
    }, [activeTool, toolParams.brushSize, isPanMode]);

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

    // Drawing events
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const handlePathCreated = (e: any) => {
        if (e.path) {
          e.path.set({
            stroke: TOOL_COLORS[activeTool],
            strokeWidth: activeTool === 'incision' ? 3 : toolParams.brushSize / 5,
            fill: 'transparent',
            selectable: activeTool === 'select',
            evented: true,
          });
          
          (e.path as any).toolType = activeTool;
          
          const canvasObj: CanvasObject = {
            id: `obj_${Date.now()}`,
            type: activeTool === 'warp' ? 'warp' : 
                  activeTool === 'volume' ? 'volume' :
                  activeTool === 'incision' ? 'incision' :
                  activeTool === 'suture' ? 'suture' : 'path',
            points: [],
            color: TOOL_COLORS[activeTool],
            strokeWidth: toolParams.brushSize,
            opacity: 1,
            layer: 'markings',
          };
          
          addObject(canvasObj);
          onObjectAdded?.(canvasObj);
        }
      };

      const handleMouseMove = (e: any) => {
        const pointer = canvas.getPointer(e.e);
        setCursorPosition({ x: pointer.x, y: pointer.y });
      };

      canvas.on('path:created', handlePathCreated);
      canvas.on('mouse:move', handleMouseMove);

      return () => {
        canvas.off('path:created', handlePathCreated);
        canvas.off('mouse:move', handleMouseMove);
      };
    }, [activeTool, toolParams, addObject, onObjectAdded]);

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
        }
      },
      redo: () => {
        stateRedo();
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

    return (
      <div 
        ref={containerRef} 
        className={cn(
          "relative h-full w-full overflow-hidden bg-canvas-bg",
          isPanMode && "cursor-grab"
        )}
      >
        <canvas ref={canvasRef} />

        {/* Facial Mesh Overlay */}
        <FacialMesh
          canvas={fabricRef.current}
          meshData={meshData || null}
          visible={showMesh && !!meshData}
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
