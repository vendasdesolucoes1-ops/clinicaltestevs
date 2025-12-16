import { useEffect, useRef, useCallback, useState } from 'react';
import * as fabric from 'fabric';
import { MediaPipeMeshData, MEDIAPIPE_SIMPLIFIED_CONNECTIONS, MEDIAPIPE_DENSE_CONNECTIONS } from '@/types/mediapipeMesh';

interface MediaPipeMeshRendererProps {
  canvas: fabric.Canvas | null;
  meshData: MediaPipeMeshData | null;
  visible: boolean;
  opacity: number;
  density: 'simple' | 'dense';
  imageWidth: number;
  imageHeight: number;
  imageLeft: number;
  imageTop: number;
}

// Cores para visualização
const POINT_COLOR = '#00ff88';
const POINT_STROKE = '#ffffff';
const LINE_COLOR = 'rgba(0, 255, 136, 0.6)';
const LINE_COLOR_DENSE = 'rgba(0, 200, 255, 0.4)';
const POINT_RADIUS = 2;

export const MediaPipeMeshRenderer = ({
  canvas,
  meshData,
  visible,
  opacity,
  density,
  imageWidth,
  imageHeight,
  imageLeft,
  imageTop,
}: MediaPipeMeshRendererProps) => {
  const meshObjectsRef = useRef<fabric.Object[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; id: number } | null>(null);

  const clearMesh = useCallback(() => {
    if (!canvas) return;
    meshObjectsRef.current.forEach(obj => {
      canvas.remove(obj);
    });
    meshObjectsRef.current = [];
  }, [canvas]);

  const drawMesh = useCallback(() => {
    if (!canvas || !meshData || !visible) {
      clearMesh();
      return;
    }

    const points = meshData.points;
    if (!Array.isArray(points) || points.length === 0) {
      clearMesh();
      return;
    }

    clearMesh();

    // Criar mapa de pontos para acesso rápido
    const pointsMap = new Map<number, { x: number; y: number }>();
    
    // Converter coordenadas normalizadas para coordenadas do canvas
    points.forEach(point => {
      const canvasX = imageLeft + point.x * imageWidth;
      const canvasY = imageTop + point.y * imageHeight;
      pointsMap.set(point.id, { x: canvasX, y: canvasY });
    });

    // Determinar quais conexões usar
    const connectionsToUse = meshData.connections && meshData.connections.length > 0
      ? meshData.connections
      : (density === 'dense' ? MEDIAPIPE_DENSE_CONNECTIONS : MEDIAPIPE_SIMPLIFIED_CONNECTIONS);

    // Desenhar as linhas de conexão
    connectionsToUse.forEach(([fromId, toId]) => {
      const from = pointsMap.get(fromId);
      const to = pointsMap.get(toId);
      
      if (from && to) {
        const line = new fabric.Line([from.x, from.y, to.x, to.y], {
          stroke: density === 'dense' ? LINE_COLOR_DENSE : LINE_COLOR,
          strokeWidth: density === 'dense' ? 0.8 : 1.2,
          selectable: false,
          evented: false,
          opacity: opacity / 100,
        });
        
        (line as any).customName = `mediapipe_line_${fromId}_${toId}`;
        canvas.add(line);
        meshObjectsRef.current.push(line);
      }
    });

    // Desenhar os pontos (por cima das linhas)
    points.forEach(point => {
      const coords = pointsMap.get(point.id);
      if (!coords) return;

      const circle = new fabric.Circle({
        radius: POINT_RADIUS,
        fill: POINT_COLOR,
        stroke: POINT_STROKE,
        strokeWidth: 1,
        left: coords.x - POINT_RADIUS,
        top: coords.y - POINT_RADIUS,
        selectable: false,
        hasControls: false,
        hasBorders: false,
        opacity: opacity / 100,
        hoverCursor: 'default',
      });

      (circle as any).customName = `mediapipe_point_${point.id}`;
      (circle as any).pointId = point.id;

      canvas.add(circle);
      meshObjectsRef.current.push(circle);
    });

    canvas.renderAll();
  }, [canvas, meshData, visible, opacity, density, imageWidth, imageHeight, imageLeft, imageTop, clearMesh]);

  useEffect(() => {
    drawMesh();
  }, [drawMesh]);

  // Tooltip on hover
  useEffect(() => {
    if (!canvas) return;

    const handleMouseOver = (e: any) => {
      const target = e.target;
      if (target && typeof (target as any).pointId === 'number') {
        const pointer = canvas.getPointer(e.e);
        setTooltip({
          x: pointer.x,
          y: pointer.y - 25,
          id: (target as any).pointId,
        });
      }
    };

    const handleMouseOut = (e: any) => {
      const target = e.target;
      if (target && typeof (target as any).pointId === 'number') {
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearMesh();
    };
  }, [clearMesh]);

  if (tooltip) {
    return (
      <div
        className="absolute pointer-events-none z-50 px-2 py-1 text-xs font-medium bg-popover text-popover-foreground border border-border rounded shadow-lg"
        style={{
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translateX(-50%)',
        }}
      >
        Ponto #{tooltip.id}
      </div>
    );
  }

  return null;
};
