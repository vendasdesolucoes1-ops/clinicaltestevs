// Calibration Overlay - Shows calibration line and input dialog
import { useState, useEffect } from 'react';
import { useCalibration } from '@/hooks/useCalibration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Ruler, X, Check, RotateCcw } from 'lucide-react';

interface CalibrationOverlayProps {
  containerWidth: number;
  containerHeight: number;
  zoom: number;
  panX: number;
  panY: number;
}

export function CalibrationOverlay({
  containerWidth,
  containerHeight,
  zoom,
  panX,
  panY,
}: CalibrationOverlayProps) {
  const {
    isCalibrating,
    calibrationStep,
    point1,
    point2,
    knownDistanceMm,
    setKnownDistance,
    completeCalibration,
    cancelCalibration,
  } = useCalibration();

  const [inputValue, setInputValue] = useState(String(knownDistanceMm));

  useEffect(() => {
    setInputValue(String(knownDistanceMm));
  }, [knownDistanceMm]);

  if (!isCalibrating) return null;

  // Convert canvas coordinates to screen coordinates
  const toScreen = (x: number, y: number) => ({
    x: x * zoom + panX,
    y: y * zoom + panY,
  });

  const screenPoint1 = point1 ? toScreen(point1.x, point1.y) : null;
  const screenPoint2 = point2 ? toScreen(point2.x, point2.y) : null;

  // Calculate pixel distance for display
  const pixelDistance = point1 && point2
    ? Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2))
    : 0;

  const handleConfirm = () => {
    const value = parseFloat(inputValue);
    if (value > 0) {
      setKnownDistance(value);
      completeCalibration();
    }
  };

  return (
    <>
      {/* Instructions banner */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-3">
        <Ruler className="h-4 w-4" />
        <span className="text-sm font-medium">
          {calibrationStep === 'point1' && 'Clique no primeiro ponto da referência conhecida'}
          {calibrationStep === 'point2' && 'Clique no segundo ponto da referência'}
          {calibrationStep === 'input' && 'Insira a distância real em milímetros'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20"
          onClick={cancelCalibration}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Calibration line SVG overlay */}
      <svg
        className="absolute inset-0 z-20 pointer-events-none"
        width={containerWidth}
        height={containerHeight}
      >
        {/* Point 1 */}
        {screenPoint1 && (
          <g>
            <circle
              cx={screenPoint1.x}
              cy={screenPoint1.y}
              r={8}
              className="fill-primary/20 stroke-primary"
              strokeWidth={2}
            />
            <circle
              cx={screenPoint1.x}
              cy={screenPoint1.y}
              r={3}
              className="fill-primary"
            />
          </g>
        )}

        {/* Point 2 */}
        {screenPoint2 && (
          <g>
            <circle
              cx={screenPoint2.x}
              cy={screenPoint2.y}
              r={8}
              className="fill-primary/20 stroke-primary"
              strokeWidth={2}
            />
            <circle
              cx={screenPoint2.x}
              cy={screenPoint2.y}
              r={3}
              className="fill-primary"
            />
          </g>
        )}

        {/* Line between points */}
        {screenPoint1 && screenPoint2 && (
          <g>
            {/* Dashed line */}
            <line
              x1={screenPoint1.x}
              y1={screenPoint1.y}
              x2={screenPoint2.x}
              y2={screenPoint2.y}
              className="stroke-primary"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            
            {/* Distance label */}
            <text
              x={(screenPoint1.x + screenPoint2.x) / 2}
              y={(screenPoint1.y + screenPoint2.y) / 2 - 10}
              textAnchor="middle"
              className="fill-primary text-xs font-mono font-bold"
              style={{ textShadow: '0 0 4px hsl(var(--background))' }}
            >
              {pixelDistance.toFixed(1)} px
            </text>
          </g>
        )}
      </svg>

      {/* Input dialog */}
      <Dialog open={calibrationStep === 'input'} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Calibração de Medidas
            </DialogTitle>
            <DialogDescription>
              Você marcou uma distância de <strong>{pixelDistance.toFixed(1)} pixels</strong>.
              Informe a distância real em milímetros.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="distance">Distância conhecida (mm)</Label>
              <div className="flex gap-2">
                <Input
                  id="distance"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ex: 10"
                  className="font-mono"
                  autoFocus
                />
                <span className="flex items-center text-muted-foreground">mm</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Use uma régua física ou objeto de tamanho conhecido como referência
              </p>
            </div>

            {inputValue && parseFloat(inputValue) > 0 && (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-sm text-muted-foreground">
                  Escala calculada: <strong className="text-foreground">
                    {(pixelDistance / parseFloat(inputValue)).toFixed(2)} px/mm
                  </strong>
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelCalibration}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={!inputValue || parseFloat(inputValue) <= 0}>
              <Check className="h-4 w-4 mr-2" />
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
