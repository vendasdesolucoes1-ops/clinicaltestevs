// Component to display anatomical measurements with clinical context
import { useMemo } from 'react';
import { Check, AlertTriangle, X, Info, Ruler } from 'lucide-react';
import { AnatomicalMeasurements as MeasurementsType, AnatomicalMeasurement } from '@/types/clinicalTools';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AnatomicalMeasurementsProps {
  measurements: MeasurementsType | null;
  isCalibrated: boolean;
  className?: string;
}

function StatusIcon({ status }: { status: 'normal' | 'warning' | 'critical' }) {
  if (status === 'normal') {
    return <Check className="h-3 w-3 text-green-500" />;
  }
  if (status === 'warning') {
    return <AlertTriangle className="h-3 w-3 text-amber-500" />;
  }
  return <X className="h-3 w-3 text-red-500" />;
}

function MeasurementRow({ measurement }: { measurement: AnatomicalMeasurement }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <StatusIcon status={measurement.status} />
        <span className="text-xs">{measurement.namePt}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-medium">
          {measurement.value}
          {measurement.unit === 'mm' && 'mm'}
          {measurement.unit === 'ratio' && ''}
        </span>
        {measurement.description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="p-0.5 hover:bg-muted rounded">
                <Info className="h-3 w-3 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[200px]">
              <p className="text-xs">{measurement.description}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Ref: {measurement.reference.min}-{measurement.reference.max}
                {measurement.unit === 'mm' && 'mm'}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export function AnatomicalMeasurementsPanel({
  measurements,
  isCalibrated,
  className,
}: AnatomicalMeasurementsProps) {
  // Count status types for summary
  const statusSummary = useMemo(() => {
    if (!measurements) return { normal: 0, warning: 0, critical: 0 };
    
    const items = [
      measurements.intercanthalDistance,
      measurements.nasalWidth,
      measurements.mouthWidth,
      measurements.facialWidth,
      measurements.facialHeight,
      measurements.goldenRatio,
    ].filter(Boolean) as AnatomicalMeasurement[];
    
    return items.reduce(
      (acc, m) => {
        acc[m.status]++;
        return acc;
      },
      { normal: 0, warning: 0, critical: 0 }
    );
  }, [measurements]);

  if (!isCalibrated) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-500">Calibração Necessária</p>
            <p className="text-[10px] text-muted-foreground">
              Calibre a escala (px→mm) para ver medidas em milímetros.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!measurements) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2 p-3 bg-muted/50 border border-border rounded-lg">
          <Ruler className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs font-medium">Aguardando Mesh</p>
            <p className="text-[10px] text-muted-foreground">
              Ative o mesh facial para calcular medidas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Summary Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          Medidas Anatômicas
        </span>
        <div className="flex items-center gap-2">
          {statusSummary.normal > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-500">
              <Check className="h-3 w-3" /> {statusSummary.normal}
            </span>
          )}
          {statusSummary.warning > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
              <AlertTriangle className="h-3 w-3" /> {statusSummary.warning}
            </span>
          )}
          {statusSummary.critical > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-500">
              <X className="h-3 w-3" /> {statusSummary.critical}
            </span>
          )}
        </div>
      </div>

      {/* Measurements List */}
      <div className="space-y-0.5 bg-muted/30 rounded-lg p-2">
        {measurements.intercanthalDistance && (
          <MeasurementRow measurement={measurements.intercanthalDistance} />
        )}
        {measurements.nasalWidth && (
          <MeasurementRow measurement={measurements.nasalWidth} />
        )}
        {measurements.mouthWidth && (
          <MeasurementRow measurement={measurements.mouthWidth} />
        )}
        {measurements.facialWidth && (
          <MeasurementRow measurement={measurements.facialWidth} />
        )}
        {measurements.facialHeight && (
          <MeasurementRow measurement={measurements.facialHeight} />
        )}
        {measurements.goldenRatio && (
          <MeasurementRow measurement={measurements.goldenRatio} />
        )}
      </div>

      {/* Facial Thirds */}
      {measurements.facialThirds && (
        <div className="space-y-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide px-1">
            Terços Faciais
          </span>
          <div className="bg-muted/30 rounded-lg p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs">Terço Superior</span>
              <span className="text-xs font-mono">
                {measurements.facialThirds.upper.value}mm 
                <span className="text-muted-foreground ml-1">
                  ({measurements.facialThirds.upper.percent}%)
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs">Terço Médio</span>
              <span className="text-xs font-mono">
                {measurements.facialThirds.middle.value}mm 
                <span className="text-muted-foreground ml-1">
                  ({measurements.facialThirds.middle.percent}%)
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs">Terço Inferior</span>
              <span className="text-xs font-mono">
                {measurements.facialThirds.lower.value}mm 
                <span className="text-muted-foreground ml-1">
                  ({measurements.facialThirds.lower.percent}%)
                </span>
              </span>
            </div>
            
            {/* Visual bar */}
            <div className="h-3 flex rounded overflow-hidden mt-2">
              <div 
                className={cn(
                  "transition-all",
                  Math.abs(measurements.facialThirds.upper.percent - 33.33) <= 5 
                    ? "bg-green-500/60" 
                    : "bg-amber-500/60"
                )}
                style={{ width: `${measurements.facialThirds.upper.percent}%` }}
              />
              <div 
                className={cn(
                  "transition-all",
                  Math.abs(measurements.facialThirds.middle.percent - 33.33) <= 5 
                    ? "bg-green-500/80" 
                    : "bg-amber-500/80"
                )}
                style={{ width: `${measurements.facialThirds.middle.percent}%` }}
              />
              <div 
                className={cn(
                  "transition-all",
                  Math.abs(measurements.facialThirds.lower.percent - 33.33) <= 5 
                    ? "bg-green-500" 
                    : "bg-amber-500"
                )}
                style={{ width: `${measurements.facialThirds.lower.percent}%` }}
              />
            </div>
            
            <div className="flex items-center gap-1 mt-1">
              {measurements.facialThirds.isProportional ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  <span className="text-[10px] text-green-500">Proporções equilibradas</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <span className="text-[10px] text-amber-500">Desvio na proporção ideal (1:1:1)</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-[9px] text-muted-foreground px-1">
        Valores de referência baseados em médias populacionais. Variações individuais são normais.
      </p>
    </div>
  );
}
