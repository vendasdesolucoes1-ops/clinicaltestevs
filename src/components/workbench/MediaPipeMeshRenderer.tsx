import { useEffect, useRef, useCallback, useState } from 'react';
import * as fabric from 'fabric';
import { MediaPipeMeshData, MEDIAPIPE_SIMPLIFIED_CONNECTIONS, MEDIAPIPE_DENSE_CONNECTIONS } from '@/types/mediapipeMesh';
import { type MeshDensity, MESH_PRESETS } from '@/types/facialLandmarks';
import { ToolType } from './ToolPanel';

export type MeshVisualStyle = 'minimal' | 'standard' | 'detailed';

export interface MeshMeasurement {
  id: string;
  point1Id: number;
  point2Id: number;
  point1: { x: number; y: number };
  point2: { x: number; y: number };
  distancePx: number;
}

export interface MeshAngleMeasurement {
  id: string;
  point1Id: number;
  point2Id: number; // vertex
  point3Id: number;
  point1: { x: number; y: number };
  point2: { x: number; y: number }; // vertex
  point3: { x: number; y: number };
  angleDegrees: number;
}

interface MediaPipeMeshRendererProps {
  canvas: fabric.Canvas | null;
  meshData: MediaPipeMeshData | null;
  visible: boolean;
  opacity: number;
  density: MeshDensity;
  visualStyle: MeshVisualStyle;
  imageWidth: number;
  imageHeight: number;
  imageLeft: number;
  imageTop: number;
  activeTool?: ToolType;
  onMeshPointClick?: (pointId: number, canvasX: number, canvasY: number) => void;
}

// Estilos minimalistas - tons de azul clínico sutis
const MESH_STYLES = {
  minimal: {
    pointRadius: 0.8,
    pointRadiusMeasure: 3,
    pointColor: 'rgba(120, 180, 220, 0.6)',
    pointColorMeasure: 'rgba(6, 182, 212, 0.9)',
    pointStroke: 'transparent',
    pointStrokeWidth: 0,
    lineWidth: 0.3,
    lineColor: 'rgba(120, 180, 220, 0.18)',
    lineColorDense: 'rgba(100, 160, 200, 0.12)',
  },
  standard: {
    pointRadius: 1.2,
    pointRadiusMeasure: 4,
    pointColor: 'rgba(100, 170, 210, 0.7)',
    pointColorMeasure: 'rgba(6, 182, 212, 0.9)',
    pointStroke: 'rgba(255, 255, 255, 0.2)',
    pointStrokeWidth: 0.5,
    lineWidth: 0.5,
    lineColor: 'rgba(100, 170, 210, 0.25)',
    lineColorDense: 'rgba(80, 150, 190, 0.18)',
  },
  detailed: {
    pointRadius: 1.6,
    pointRadiusMeasure: 5,
    pointColor: 'rgba(80, 160, 200, 0.8)',
    pointColorMeasure: 'rgba(6, 182, 212, 0.9)',
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
  activeTool,
  onMeshPointClick,
}: MediaPipeMeshRendererProps) => {
  const meshObjectsRef = useRef<fabric.Object[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; id: number } | null>(null);

  const style = MESH_STYLES[visualStyle];
  // Only angle tool needs interactive mesh points (measure works on any canvas point now)
  const isInteractiveMode = activeTool === 'angle';

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

    // Determinar quais conexões usar (use dense for clinico, avancado, completo)
    const useDenseConnections = density !== 'simetria';
    const connectionsToUse = meshData.connections && meshData.connections.length > 0
      ? meshData.connections
      : (useDenseConnections ? MEDIAPIPE_DENSE_CONNECTIONS : MEDIAPIPE_SIMPLIFIED_CONNECTIONS);

    const lineColor = useDenseConnections ? style.lineColorDense : style.lineColor;

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
    // Em modo measure/angle, pontos são maiores e clicáveis
    const pointRadius = isInteractiveMode ? style.pointRadiusMeasure : style.pointRadius;
    const pointColor = isInteractiveMode ? style.pointColorMeasure : style.pointColor;
    const interactiveStroke = activeTool === 'angle' ? '#f97316' : '#06b6d4';
    
    points.forEach(point => {
      const coords = pointsMap.get(point.id);
      if (!coords) return;

      const circle = new fabric.Circle({
        radius: pointRadius,
        fill: pointColor,
        stroke: isInteractiveMode ? interactiveStroke : style.pointStroke,
        strokeWidth: isInteractiveMode ? 1 : style.pointStrokeWidth,
        left: coords.x - pointRadius,
        top: coords.y - pointRadius,
        selectable: false,
        hasControls: false,
        hasBorders: false,
        opacity: opacity / 100,
        hoverCursor: isInteractiveMode ? 'pointer' : 'default',
        evented: isInteractiveMode, // Enable events in measure/angle mode
      });

      (circle as any).customName = `mediapipe_point_${point.id}`;
      (circle as any).pointId = point.id;
      (circle as any).pointCoords = coords;

      canvas.add(circle);
      meshObjectsRef.current.push(circle);
    });

    canvas.renderAll();
  }, [canvas, meshData, visible, opacity, density, visualStyle, style, imageWidth, imageHeight, imageLeft, imageTop, clearMesh, isInteractiveMode, activeTool]);

  useEffect(() => {
    drawMesh();
  }, [drawMesh]);

  // Tooltip on hover and click handler for measure mode
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

    const handleMouseDown = (e: any) => {
      const target = e.target;
      if (isInteractiveMode && target && typeof (target as any).pointId === 'number') {
        const pointId = (target as any).pointId;
        const coords = (target as any).pointCoords;
        if (coords && onMeshPointClick) {
          onMeshPointClick(pointId, coords.x, coords.y);
        }
      }
    };

    canvas.on('mouse:over', handleMouseOver);
    canvas.on('mouse:out', handleMouseOut);
    canvas.on('mouse:down', handleMouseDown);

    return () => {
      canvas.off('mouse:over', handleMouseOver);
      canvas.off('mouse:out', handleMouseOut);
      canvas.off('mouse:down', handleMouseDown);
    };
  }, [canvas, isInteractiveMode, onMeshPointClick]);

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
