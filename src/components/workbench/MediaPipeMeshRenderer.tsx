import { useEffect, useRef, useCallback, useState } from 'react';
import * as fabric from 'fabric';
import { MediaPipeMeshData, MEDIAPIPE_SIMPLIFIED_CONNECTIONS, MEDIAPIPE_DENSE_CONNECTIONS } from '@/types/mediapipeMesh';

export type MeshVisualStyle = 'minimal' | 'standard' | 'detailed';

interface MediaPipeMeshRendererProps {
  canvas: fabric.Canvas | null;
  meshData: MediaPipeMeshData | null;
  visible: boolean;
  opacity: number;
  density: 'simple' | 'dense';
  visualStyle: MeshVisualStyle;
  imageWidth: number;
  imageHeight: number;
  imageLeft: number;
  imageTop: number;
}

// Estilos minimalistas - tons de azul clínico sutis
const MESH_STYLES = {
  minimal: {
    pointRadius: 0.8,
    pointColor: 'rgba(120, 180, 220, 0.6)',
    pointStroke: 'transparent',
    pointStrokeWidth: 0,
    lineWidth: 0.3,
    lineColor: 'rgba(120, 180, 220, 0.18)',
    lineColorDense: 'rgba(100, 160, 200, 0.12)',
  },
  standard: {
    pointRadius: 1.2,
    pointColor: 'rgba(100, 170, 210, 0.7)',
    pointStroke: 'rgba(255, 255, 255, 0.2)',
    pointStrokeWidth: 0.5,
    lineWidth: 0.5,
    lineColor: 'rgba(100, 170, 210, 0.25)',
    lineColorDense: 'rgba(80, 150, 190, 0.18)',
  },
  detailed: {
    pointRadius: 1.6,
    pointColor: 'rgba(80, 160, 200, 0.8)',
    pointStroke: 'rgba(255, 255, 255, 0.35)',
    pointStrokeWidth: 0.8,
    lineWidth: 0.7,
    lineColor: 'rgba(80, 160, 200, 0.35)',
    lineColorDense: 'rgba(60, 140, 180, 0.25)',
  },
};

export const MediaPipeMeshRenderer = ({
  canvas,
  meshData,
  visible,
  opacity,
  density,
  visualStyle,
  imageWidth,
  imageHeight,
  imageLeft,
  imageTop,
}: MediaPipeMeshRendererProps) => {
  const meshObjectsRef = useRef<fabric.Object[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; id: number } | null>(null);

  const style = MESH_STYLES[visualStyle];

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

    const lineColor = density === 'dense' ? style.lineColorDense : style.lineColor;

    // Desenhar as linhas de conexão primeiro (pontos ficam por cima)
    connectionsToUse.forEach(([fromId, toId]) => {
      const from = pointsMap.get(fromId);
      const to = pointsMap.get(toId);
      
      if (from && to) {
        const line = new fabric.Line([from.x, from.y, to.x, to.y], {
          stroke: lineColor,
          strokeWidth: style.lineWidth,
          strokeLineCap: 'round',
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
        radius: style.pointRadius,
        fill: style.pointColor,
        stroke: style.pointStroke,
        strokeWidth: style.pointStrokeWidth,
        left: coords.x - style.pointRadius,
        top: coords.y - style.pointRadius,
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
  }, [canvas, meshData, visible, opacity, density, visualStyle, style, imageWidth, imageHeight, imageLeft, imageTop, clearMesh]);

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
          y: pointer.y - 20,
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
        className="absolute pointer-events-none z-50 px-1.5 py-0.5 text-[10px] font-mono bg-popover/90 text-popover-foreground border border-border/50 rounded shadow-sm backdrop-blur-sm"
        style={{
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translateX(-50%)',
        }}
      >
        #{tooltip.id}
      </div>
    );
  }

  return null;
};
