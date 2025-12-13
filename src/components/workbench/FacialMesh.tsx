import { useEffect, useRef, useCallback, useState } from 'react';
import * as fabric from 'fabric';
import { FacialMeshData, FacialPoint, POINT_LABELS, REGION_COLORS, AnatomicalRegion } from '@/types/facialLandmarks';
import { type MeshEditMode } from '@/hooks/useFacialAnalysis';

interface FacialMeshProps {
  canvas: fabric.Canvas | null;
  meshData: FacialMeshData | null;
  visible: boolean;
  opacity: number;
  imageWidth: number;
  imageHeight: number;
  imageLeft: number;
  imageTop: number;
  editMode: MeshEditMode;
  connectingFrom?: string | null;
  onPointMove?: (pointId: string, x: number, y: number) => void;
  onPointAdd?: (x: number, y: number) => void;
  onPointRemove?: (pointId: string) => void;
  onStartConnection?: (fromId: string) => void;
  onAddConnection?: (fromId: string, toId: string) => void;
  onRemoveConnection?: (fromId: string, toId: string) => void;
}

const POINT_RADIUS = 3;
const MIDLINE_COLOR = '#ff6b6b';
const MIDLINE_WIDTH = 2.5;
const HORIZONTAL_COLOR = 'rgba(255, 200, 0, 0.7)';
const VERTICAL_COLOR = 'rgba(255, 100, 100, 0.6)';
const DIAGONAL_COLOR = 'rgba(100, 255, 100, 0.5)';
const CONTOUR_COLOR = 'rgba(200, 100, 255, 0.7)';
const CUSTOM_CONNECTION_COLOR = 'rgba(255, 150, 50, 0.9)';
const POINT_STROKE = '#ffffff';
const CUSTOM_POINT_COLOR = '#ff6b6b';
const CONNECTING_POINT_COLOR = '#ffff00';
const ROI_BORDER_COLOR = 'rgba(0, 200, 255, 0.3)';

export const FacialMesh = ({
  canvas,
  meshData,
  visible,
  opacity,
  imageWidth,
  imageHeight,
  imageLeft,
  imageTop,
  editMode,
  connectingFrom,
  onPointMove,
  onPointAdd,
  onPointRemove,
  onStartConnection,
  onAddConnection,
  onRemoveConnection,
}: FacialMeshProps) => {
  const meshObjectsRef = useRef<fabric.Object[]>([]);
  const pointsMapRef = useRef<Map<string, fabric.Circle>>(new Map());
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; region?: string } | null>(null);

  const clearMesh = useCallback(() => {
    if (!canvas) return;
    meshObjectsRef.current.forEach(obj => {
      canvas.remove(obj);
    });
    meshObjectsRef.current = [];
    pointsMapRef.current.clear();
  }, [canvas]);

  const getLineColor = (type: string, isCustom?: boolean): string => {
    if (isCustom) return CUSTOM_CONNECTION_COLOR;
    switch (type) {
      case 'midline': return MIDLINE_COLOR;
      case 'horizontal': return HORIZONTAL_COLOR;
      case 'vertical': return VERTICAL_COLOR;
      case 'diagonal': return DIAGONAL_COLOR;
      case 'contour': return CONTOUR_COLOR;
      case 'custom': return CUSTOM_CONNECTION_COLOR;
      default: return 'rgba(0, 200, 255, 0.7)';
    }
  };

  const getLineWidth = (type: string, isCustom?: boolean): number => {
    if (type === 'midline') return MIDLINE_WIDTH;
    if (isCustom || type === 'custom') return 2;
    if (type === 'contour') return 1.8;
    return 1.2;
  };

  const getPointColor = (point: FacialPoint, isConnecting: boolean): string => {
    if (isConnecting) return CONNECTING_POINT_COLOR;
    if (point.id.startsWith('custom_')) return CUSTOM_POINT_COLOR;
    
    // Cor baseada na região anatômica
    const region = point.region as AnatomicalRegion;
    return REGION_COLORS[region] || '#00c8ff';
  };

  const drawMesh = useCallback(() => {
    if (!canvas || !meshData || !visible) {
      clearMesh();
      return;
    }

    clearMesh();

    const pointsMap = new Map<string, { x: number; y: number }>();
    
    // Converter coordenadas normalizadas para coordenadas do canvas
    meshData.points.forEach(point => {
      const canvasX = imageLeft + point.x * imageWidth;
      const canvasY = imageTop + point.y * imageHeight;
      pointsMap.set(point.id, { x: canvasX, y: canvasY });
    });

    // Desenhar ROI facial (contorno da área detectada)
    if (meshData.faceROI) {
      const roi = meshData.faceROI;
      const roiRect = new fabric.Rect({
        left: imageLeft + roi.x * imageWidth,
        top: imageTop + roi.y * imageHeight,
        width: roi.width * imageWidth,
        height: roi.height * imageHeight,
        fill: 'transparent',
        stroke: ROI_BORDER_COLOR,
        strokeWidth: 1,
        strokeDashArray: [8, 4],
        selectable: false,
        evented: false,
        opacity: opacity / 100 * 0.5,
      });
      (roiRect as any).customName = 'face_roi';
      canvas.add(roiRect);
      meshObjectsRef.current.push(roiRect);
    }

    // Desenhar as linhas de conexão
    meshData.connections.forEach(conn => {
      const from = pointsMap.get(conn.from);
      const to = pointsMap.get(conn.to);
      
      if (from && to) {
        const isCustomConn = conn.isCustom || conn.type === 'custom';
        const isMidline = conn.type === 'midline';
        
        const line = new fabric.Line([from.x, from.y, to.x, to.y], {
          stroke: getLineColor(conn.type, conn.isCustom),
          strokeWidth: getLineWidth(conn.type, conn.isCustom),
          strokeDashArray: isCustomConn ? [5, 3] : undefined,
          selectable: false,
          evented: isCustomConn && editMode === 'remove',
          opacity: opacity / 100,
          hoverCursor: isCustomConn && editMode === 'remove' ? 'pointer' : 'default',
        });
        
        (line as any).customName = `mesh_line_${conn.from}_${conn.to}`;
        (line as any).isCustomConnection = isCustomConn;
        (line as any).isMidline = isMidline;
        (line as any).connectionFrom = conn.from;
        (line as any).connectionTo = conn.to;
        
        canvas.add(line);
        meshObjectsRef.current.push(line);
      }
    });

    // Desenhar os pontos (por cima das linhas)
    meshData.points.forEach(point => {
      const coords = pointsMap.get(point.id);
      if (!coords) return;

      const isConnectingPoint = connectingFrom === point.id;
      const pointColor = getPointColor(point, isConnectingPoint);
      const isMidlinePoint = meshData.midlinePoints?.includes(point.id);
      
      const circle = new fabric.Circle({
        radius: isConnectingPoint ? POINT_RADIUS + 2 : (isMidlinePoint ? POINT_RADIUS + 1 : POINT_RADIUS),
        fill: pointColor,
        stroke: isConnectingPoint ? '#000000' : (isMidlinePoint ? MIDLINE_COLOR : POINT_STROKE),
        strokeWidth: isConnectingPoint ? 3 : (isMidlinePoint ? 2 : 1.5),
        left: coords.x - (isConnectingPoint ? POINT_RADIUS + 2 : POINT_RADIUS),
        top: coords.y - (isConnectingPoint ? POINT_RADIUS + 2 : POINT_RADIUS),
        selectable: editMode === 'move',
        hasControls: false,
        hasBorders: false,
        opacity: opacity / 100,
        hoverCursor: editMode === 'move' ? 'move' : (editMode === 'remove' || editMode === 'connect') ? 'pointer' : 'default',
      });

      (circle as any).customName = `mesh_point_${point.id}`;
      (circle as any).pointId = point.id;
      (circle as any).pointLabel = POINT_LABELS[point.id] || point.name;
      (circle as any).pointRegion = point.region;

      canvas.add(circle);
      meshObjectsRef.current.push(circle);
      pointsMapRef.current.set(point.id, circle);
    });

    canvas.renderAll();
  }, [canvas, meshData, visible, opacity, imageWidth, imageHeight, imageLeft, imageTop, editMode, connectingFrom, clearMesh]);

  useEffect(() => {
    drawMesh();
  }, [drawMesh]);

  // Configurar eventos
  useEffect(() => {
    if (!canvas) return;

    const handleObjectMoving = (e: any) => {
      if (editMode !== 'move' || !onPointMove) return;
      
      const target = e.target;
      if (!target || !(target as any).pointId) return;

      const pointId = (target as any).pointId;

      meshData?.connections.forEach(conn => {
        if (conn.from === pointId || conn.to === pointId) {
          const lineObj = meshObjectsRef.current.find(
            obj => (obj as any).customName === `mesh_line_${conn.from}_${conn.to}`
          ) as fabric.Line | undefined;

          if (lineObj) {
            const fromPoint = pointsMapRef.current.get(conn.from);
            const toPoint = pointsMapRef.current.get(conn.to);

            if (fromPoint && toPoint) {
              const x1 = fromPoint.left! + POINT_RADIUS;
              const y1 = fromPoint.top! + POINT_RADIUS;
              const x2 = toPoint.left! + POINT_RADIUS;
              const y2 = toPoint.top! + POINT_RADIUS;
              lineObj.set({ x1, y1, x2, y2 });
            }
          }
        }
      });

      canvas.renderAll();
    };

    const handleObjectModified = (e: any) => {
      if (editMode !== 'move' || !onPointMove) return;
      
      const target = e.target;
      if (!target || !(target as any).pointId) return;

      const pointId = (target as any).pointId;
      const newX = (target.left! + POINT_RADIUS - imageLeft) / imageWidth;
      const newY = (target.top! + POINT_RADIUS - imageTop) / imageHeight;

      const clampedX = Math.max(0, Math.min(1, newX));
      const clampedY = Math.max(0, Math.min(1, newY));

      onPointMove(pointId, clampedX, clampedY);
    };

    const handleMouseDown = (e: any) => {
      if (!e.pointer) return;
      
      const pointer = canvas.getPointer(e.e);
      
      const isInImage = 
        pointer.x >= imageLeft && 
        pointer.x <= imageLeft + imageWidth &&
        pointer.y >= imageTop && 
        pointer.y <= imageTop + imageHeight;

      if (editMode === 'add' && onPointAdd && isInImage) {
        const clickedObject = canvas.findTarget(e.e);
        if (clickedObject && (clickedObject as any).pointId) return;
        
        const normalizedX = (pointer.x - imageLeft) / imageWidth;
        const normalizedY = (pointer.y - imageTop) / imageHeight;
        onPointAdd(normalizedX, normalizedY);
      }
      
      if (editMode === 'remove') {
        const clickedObject = canvas.findTarget(e.e);
        if (clickedObject) {
          if ((clickedObject as any).pointId && onPointRemove) {
            onPointRemove((clickedObject as any).pointId);
            return;
          }
          if ((clickedObject as any).isCustomConnection && onRemoveConnection) {
            const fromId = (clickedObject as any).connectionFrom;
            const toId = (clickedObject as any).connectionTo;
            if (fromId && toId) {
              onRemoveConnection(fromId, toId);
              return;
            }
          }
        }
      }
      
      if (editMode === 'connect') {
        const clickedObject = canvas.findTarget(e.e);
        if (clickedObject && (clickedObject as any).pointId) {
          const clickedPointId = (clickedObject as any).pointId;
          
          if (!connectingFrom && onStartConnection) {
            onStartConnection(clickedPointId);
          } else if (connectingFrom && onAddConnection) {
            onAddConnection(connectingFrom, clickedPointId);
          }
        }
      }
    };

    canvas.on('object:moving', handleObjectMoving);
    canvas.on('object:modified', handleObjectModified);
    canvas.on('mouse:down', handleMouseDown);

    return () => {
      canvas.off('object:moving', handleObjectMoving);
      canvas.off('object:modified', handleObjectModified);
      canvas.off('mouse:down', handleMouseDown);
    };
  }, [canvas, meshData, editMode, connectingFrom, imageWidth, imageHeight, imageLeft, imageTop, onPointMove, onPointAdd, onPointRemove, onStartConnection, onAddConnection, onRemoveConnection]);

  // Handle tooltip on hover
  useEffect(() => {
    if (!canvas) return;

    const handleMouseOver = (e: any) => {
      const target = e.target;
      if (target && (target as any).pointId) {
        const pointer = canvas.getPointer(e.e);
        setTooltip({
          x: pointer.x,
          y: pointer.y - 25,
          label: (target as any).pointLabel,
          region: (target as any).pointRegion,
        });
      }
    };

    const handleMouseOut = (e: any) => {
      const target = e.target;
      if (target && (target as any).pointId) {
        setTooltip(null);
      }
    };

    canvas.on('mouse:over', handleMouseOver);
    canvas.on('mouse:out', handleMouseOut);

    return () => {
      canvas.off('mouse:over', handleMouseOver);
      canvas.off('mouse:out', handleMouseOut);
    };
  }, [canvas]);

  useEffect(() => {
    return () => {
      clearMesh();
    };
  }, [clearMesh]);

  if (tooltip) {
    return (
      <div
        className="absolute pointer-events-none z-50 px-2 py-1.5 text-xs font-medium bg-popover text-popover-foreground border border-border rounded-lg shadow-lg"
        style={{
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translateX(-50%)',
        }}
      >
        <div>{tooltip.label}</div>
        {tooltip.region && (
          <div className="text-[10px] text-muted-foreground capitalize">
            {tooltip.region.replace('_', ' ')}
          </div>
        )}
      </div>
    );
  }

  return null;
};
