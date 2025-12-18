// Canvas Ruler Component - Renders measurement rulers on edges of canvas
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface CanvasRulerProps {
  visible: boolean;
  zoom: number;
  panX: number;
  panY: number;
  containerWidth: number;
  containerHeight: number;
}

const RULER_SIZE = 24;
const MAJOR_TICK_INTERVAL = 100; // pixels in original scale
const MINOR_TICK_INTERVAL = 50;
const SMALL_TICK_INTERVAL = 10;

export function CanvasRuler({
  visible,
  zoom,
  panX,
  panY,
  containerWidth,
  containerHeight,
}: CanvasRulerProps) {
  // Generate horizontal ruler marks
  const horizontalMarks = useMemo(() => {
    if (!visible || containerWidth <= 0) return [];
    
    const marks: { x: number; label: string | null; height: number }[] = [];
    const step = SMALL_TICK_INTERVAL * zoom;
    
    // Calculate the starting point considering pan
    const startOffset = panX % (MAJOR_TICK_INTERVAL * zoom);
    const startValue = Math.floor(-panX / zoom / SMALL_TICK_INTERVAL) * SMALL_TICK_INTERVAL;
    
    for (let i = 0; i < containerWidth / step + 2; i++) {
      const x = startOffset + i * step;
      const value = startValue + i * SMALL_TICK_INTERVAL;
      
      if (x < RULER_SIZE || x > containerWidth) continue;
      
      const isMajor = value % MAJOR_TICK_INTERVAL === 0;
      const isMinor = value % MINOR_TICK_INTERVAL === 0;
      
      marks.push({
        x,
        label: isMajor ? String(value) : null,
        height: isMajor ? 12 : isMinor ? 8 : 4,
      });
    }
    
    return marks;
  }, [visible, zoom, panX, containerWidth]);

  // Generate vertical ruler marks
  const verticalMarks = useMemo(() => {
    if (!visible || containerHeight <= 0) return [];
    
    const marks: { y: number; label: string | null; width: number }[] = [];
    const step = SMALL_TICK_INTERVAL * zoom;
    
    const startOffset = panY % (MAJOR_TICK_INTERVAL * zoom);
    const startValue = Math.floor(-panY / zoom / SMALL_TICK_INTERVAL) * SMALL_TICK_INTERVAL;
    
    for (let i = 0; i < containerHeight / step + 2; i++) {
      const y = startOffset + i * step;
      const value = startValue + i * SMALL_TICK_INTERVAL;
      
      if (y < RULER_SIZE || y > containerHeight) continue;
      
      const isMajor = value % MAJOR_TICK_INTERVAL === 0;
      const isMinor = value % MINOR_TICK_INTERVAL === 0;
      
      marks.push({
        y,
        label: isMajor ? String(value) : null,
        width: isMajor ? 12 : isMinor ? 8 : 4,
      });
    }
    
    return marks;
  }, [visible, zoom, panY, containerHeight]);

  if (!visible) return null;

  return (
    <>
      {/* Horizontal ruler (top) */}
      <div 
        className="absolute top-0 left-0 right-0 h-6 bg-muted/90 backdrop-blur-sm border-b border-border z-20 pointer-events-none"
        style={{ paddingLeft: RULER_SIZE }}
      >
        <svg 
          className="w-full h-full overflow-visible"
          style={{ marginLeft: -RULER_SIZE }}
        >
          {horizontalMarks.map((mark, i) => (
            <g key={i}>
              <line
                x1={mark.x}
                y1={RULER_SIZE}
                x2={mark.x}
                y2={RULER_SIZE - mark.height}
                className="stroke-muted-foreground"
                strokeWidth={1}
              />
              {mark.label && (
                <text
                  x={mark.x + 2}
                  y={10}
                  className="fill-muted-foreground text-[9px] font-mono"
                >
                  {mark.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Vertical ruler (left) */}
      <div 
        className="absolute top-0 left-0 bottom-0 w-6 bg-muted/90 backdrop-blur-sm border-r border-border z-20 pointer-events-none"
        style={{ paddingTop: RULER_SIZE }}
      >
        <svg 
          className="w-full h-full overflow-visible"
          style={{ marginTop: -RULER_SIZE }}
        >
          {verticalMarks.map((mark, i) => (
            <g key={i}>
              <line
                x1={RULER_SIZE}
                y1={mark.y}
                x2={RULER_SIZE - mark.width}
                y2={mark.y}
                className="stroke-muted-foreground"
                strokeWidth={1}
              />
              {mark.label && (
                <text
                  x={2}
                  y={mark.y + 3}
                  className="fill-muted-foreground text-[9px] font-mono"
                >
                  {mark.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Corner square */}
      <div 
        className="absolute top-0 left-0 w-6 h-6 bg-muted/90 backdrop-blur-sm border-r border-b border-border z-30 pointer-events-none flex items-center justify-center"
      >
        <span className="text-[8px] text-muted-foreground font-mono">px</span>
      </div>
    </>
  );
}
