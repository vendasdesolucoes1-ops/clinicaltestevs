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
  isCalibrated?: boolean;
  pixelsPerMm?: number | null;
  onCalibrate?: () => void;
}

const RULER_SIZE = 24;

export function CanvasRuler({
  visible,
  zoom,
  panX,
  panY,
  containerWidth,
  containerHeight,
  isCalibrated = false,
  pixelsPerMm = null,
  onCalibrate,
}: CanvasRulerProps) {
  // Determine tick intervals based on calibration
  const { majorInterval, minorInterval, smallInterval, unit } = useMemo(() => {
    if (isCalibrated && pixelsPerMm) {
      // Use mm-based intervals when calibrated
      // 10mm major, 5mm minor, 1mm small
      return {
        majorInterval: 10 * pixelsPerMm,
        minorInterval: 5 * pixelsPerMm,
        smallInterval: 1 * pixelsPerMm,
        unit: 'mm',
      };
    }
    // Default pixel intervals
    return {
      majorInterval: 100,
      minorInterval: 50,
      smallInterval: 10,
      unit: 'px',
    };
  }, [isCalibrated, pixelsPerMm]);

  // Generate horizontal ruler marks
  const horizontalMarks = useMemo(() => {
    if (!visible || containerWidth <= 0) return [];
    
    const marks: { x: number; label: string | null; height: number }[] = [];
    const step = smallInterval * zoom;
    
    // Skip if step is too small
    if (step < 3) return [];
    
    const startOffset = panX % (majorInterval * zoom);
    const startValue = Math.floor(-panX / zoom / smallInterval) * smallInterval;
    
    for (let i = 0; i < containerWidth / step + 2; i++) {
      const x = startOffset + i * step;
      const value = startValue + i * smallInterval;
      
      if (x < RULER_SIZE || x > containerWidth) continue;
      
      // Check for major/minor ticks with small tolerance for float comparison
      const isMajor = Math.abs(value % majorInterval) < 0.01;
      const isMinor = Math.abs(value % minorInterval) < 0.01;
      
      // Convert pixel value to display value
      const displayValue = isCalibrated && pixelsPerMm 
        ? value / pixelsPerMm 
        : value;
      
      marks.push({
        x,
        label: isMajor ? displayValue.toFixed(isCalibrated ? 0 : 0) : null,
        height: isMajor ? 12 : isMinor ? 8 : 4,
      });
    }
    
    return marks;
  }, [visible, zoom, panX, containerWidth, majorInterval, minorInterval, smallInterval, isCalibrated, pixelsPerMm]);

  // Generate vertical ruler marks
  const verticalMarks = useMemo(() => {
    if (!visible || containerHeight <= 0) return [];
    
    const marks: { y: number; label: string | null; width: number }[] = [];
    const step = smallInterval * zoom;
    
    if (step < 3) return [];
    
    const startOffset = panY % (majorInterval * zoom);
    const startValue = Math.floor(-panY / zoom / smallInterval) * smallInterval;
    
    for (let i = 0; i < containerHeight / step + 2; i++) {
      const y = startOffset + i * step;
      const value = startValue + i * smallInterval;
      
      if (y < RULER_SIZE || y > containerHeight) continue;
      
      const isMajor = Math.abs(value % majorInterval) < 0.01;
      const isMinor = Math.abs(value % minorInterval) < 0.01;
      
      const displayValue = isCalibrated && pixelsPerMm 
        ? value / pixelsPerMm 
        : value;
      
      marks.push({
        y,
        label: isMajor ? displayValue.toFixed(isCalibrated ? 0 : 0) : null,
        width: isMajor ? 12 : isMinor ? 8 : 4,
      });
    }
    
    return marks;
  }, [visible, zoom, panY, containerHeight, majorInterval, minorInterval, smallInterval, isCalibrated, pixelsPerMm]);

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

      {/* Corner square - clickable for calibration */}
      <div 
        className={cn(
          "absolute top-0 left-0 w-6 h-6 bg-muted/90 backdrop-blur-sm border-r border-b border-border z-30 flex items-center justify-center transition-colors",
          onCalibrate && "cursor-pointer hover:bg-primary/20 pointer-events-auto",
          isCalibrated && "text-emerald-500"
        )}
        onClick={onCalibrate}
        title={isCalibrated ? `Calibrado: ${pixelsPerMm?.toFixed(2)} px/mm` : 'Clique para calibrar'}
      >
        <span className={cn(
          "text-[8px] font-mono font-medium",
          isCalibrated ? "text-emerald-500" : "text-muted-foreground"
        )}>
          {unit}
        </span>
      </div>
    </>
  );
}
