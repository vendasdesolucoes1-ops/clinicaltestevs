import { useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import { FacialMeshData, FacialPoint, POINT_LABELS } from '@/types/facialLandmarks';

interface FacialMeshProps {
  canvas: fabric.Canvas | null;
  meshData: FacialMeshData | null;
  visible: boolean;
  opacity: number;
  imageWidth: number;
  imageHeight: number;
  imageLeft: number;
  imageTop: number;
  onPointMove?: (pointId: string, x: number, y: number) => void;
}

const POINT_RADIUS = 6;
const LINE_COLOR = 'rgba(0, 200, 255, 0.7)';
const POINT_COLOR = '#00c8ff';
const POINT_STROKE = '#ffffff';
const HORIZONTAL_COLOR = 'rgba(255, 200, 0, 0.6)';
const VERTICAL_COLOR = 'rgba(255, 100, 100, 0.6)';
const DIAGONAL_COLOR = 'rgba(100, 255, 100, 0.5)';
const CONTOUR_COLOR = 'rgba(200, 100, 255, 0.6)';

export const FacialMesh = ({
  canvas,
  meshData,
  visible,
  opacity,
  imageWidth,
  imageHeight,
  imageLeft,
  imageTop,
  onPointMove,
}: FacialMeshProps) => {
  const meshObjectsRef = useRef<fabric.Object[]>([]);
  const pointsMapRef = useRef<Map<string, fabric.Circle>>(new Map());

  const clearMesh = useCallback(() => {
    if (!canvas) return;
    
    meshObjectsRef.current.forEach(obj => {
      canvas.remove(obj);
    });
    meshObjectsRef.current = [];
    pointsMapRef.current.clear();
  }, [canvas]);

  const getLineColor = (type: string): string => {
    switch (type) {
      case 'horizontal': return HORIZONTAL_COLOR;
      case 'vertical': return VERTICAL_COLOR;
      case 'diagonal': return DIAGONAL_COLOR;
      case 'contour': return CONTOUR_COLOR;
      default: return LINE_COLOR;
    }
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

    // Desenhar as linhas de conexão
    meshData.connections.forEach(conn => {
      const from = pointsMap.get(conn.from);
      const to = pointsMap.get(conn.to);
      
      if (from && to) {
        const line = new fabric.Line([from.x, from.y, to.x, to.y], {
          stroke: getLineColor(conn.type),
          strokeWidth: conn.type === 'contour' ? 2 : 1.5,
          selectable: false,
          evented: false,
          opacity: opacity / 100,
        });
        (line as any).customName = `mesh_line_${conn.from}_${conn.to}`;
        canvas.add(line);
        meshObjectsRef.current.push(line);
      }
    });

    // Desenhar os pontos (por cima das linhas)
    meshData.points.forEach(point => {
      const coords = pointsMap.get(point.id);
      if (!coords) return;

      const circle = new fabric.Circle({
        radius: POINT_RADIUS,
        fill: POINT_COLOR,
        stroke: POINT_STROKE,
        strokeWidth: 2,
        left: coords.x - POINT_RADIUS,
        top: coords.y - POINT_RADIUS,
        selectable: true,
        hasControls: false,
        hasBorders: false,
        opacity: opacity / 100,
        hoverCursor: 'move',
      });

      (circle as any).customName = `mesh_point_${point.id}`;
      (circle as any).pointId = point.id;
      (circle as any).pointLabel = POINT_LABELS[point.id] || point.name;

      canvas.add(circle);
      meshObjectsRef.current.push(circle);
      pointsMapRef.current.set(point.id, circle);
    });

    canvas.renderAll();
  }, [canvas, meshData, visible, opacity, imageWidth, imageHeight, imageLeft, imageTop, clearMesh]);

  // Desenhar/atualizar o mesh quando os dados mudarem
  useEffect(() => {
    drawMesh();
  }, [drawMesh]);

  // Configurar evento de arrastar pontos
  useEffect(() => {
    if (!canvas || !onPointMove) return;

    const handleObjectMoving = (e: any) => {
      const target = e.target;
      if (!target || !(target as any).pointId) return;

      const pointId = (target as any).pointId;
      const newX = (target.left! + POINT_RADIUS - imageLeft) / imageWidth;
      const newY = (target.top! + POINT_RADIUS - imageTop) / imageHeight;

      // Atualizar as linhas conectadas
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
      const target = e.target;
      if (!target || !(target as any).pointId) return;

      const pointId = (target as any).pointId;
      const newX = (target.left! + POINT_RADIUS - imageLeft) / imageWidth;
      const newY = (target.top! + POINT_RADIUS - imageTop) / imageHeight;

      // Clamp entre 0 e 1
      const clampedX = Math.max(0, Math.min(1, newX));
      const clampedY = Math.max(0, Math.min(1, newY));

      onPointMove(pointId, clampedX, clampedY);
    };

    canvas.on('object:moving', handleObjectMoving);
    canvas.on('object:modified', handleObjectModified);

    return () => {
      canvas.off('object:moving', handleObjectMoving);
      canvas.off('object:modified', handleObjectModified);
    };
  }, [canvas, meshData, imageWidth, imageHeight, imageLeft, imageTop, onPointMove]);

  // Limpar ao desmontar
  useEffect(() => {
    return () => {
      clearMesh();
    };
  }, [clearMesh]);

  return null; // Componente não renderiza DOM, manipula o canvas diretamente
};
