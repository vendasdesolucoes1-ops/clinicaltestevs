import { SymmetryResult } from '@/types/facialLandmarks';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, FileText, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { exportAnalysisPDF } from '@/lib/exportAnalysisPDF';

interface SymmetryIndicatorProps {
  symmetryResult: SymmetryResult | null;
  isAnalyzing: boolean;
  onGetCanvasImage?: () => string | null;
  caseName?: string;
  photoAngle?: string;
}

export function SymmetryIndicator({ symmetryResult, isAnalyzing, onGetCanvasImage, caseName, photoAngle }: SymmetryIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRegions, setShowRegions] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [includeImage, setIncludeImage] = useState(true);

  const handleExportPDF = useCallback(async () => {
    if (!symmetryResult) return;
    
    setIsExporting(true);
    try {
      const canvasImageUrl = includeImage && onGetCanvasImage ? onGetCanvasImage() : null;
      
      await exportAnalysisPDF({
        caseName: caseName || 'Caso',
        photoAngle,
        symmetryResult,
        canvasImageUrl,
        analysisDate: new Date(),
      });
      
      toast.success('Relatório PDF exportado com sucesso');
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toast.error('Erro ao gerar relatório PDF');
    } finally {
      setIsExporting(false);
    }
  }, [symmetryResult, includeImage, onGetCanvasImage, caseName, photoAngle]);

  if (isAnalyzing) {
    return (
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-foreground">Análise de Simetria</span>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!symmetryResult) {
    return (
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-foreground">Análise de Simetria</span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Faça upload de uma foto para analisar a simetria facial
        </p>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 75) return 'text-yellow-500';
    if (score >= 60) return 'text-orange-500';
    return 'text-red-500';
  };

  const getProgressColor = (score: number) => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 75) return 'bg-yellow-500';
    if (score >= 60) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getDeviationColor = (deviation: number) => {
    if (deviation <= 10) return 'text-green-500';
    if (deviation <= 25) return 'text-yellow-500';
    if (deviation <= 50) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-foreground">Análise de Simetria</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleExportPDF}
            disabled={isExporting}
            title="Exportar relatório PDF"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
          </Button>
          <div className="flex items-center gap-1.5">
            {symmetryResult.overallScore >= 75 ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
            )}
            <span className={cn('text-sm font-bold', getScoreColor(symmetryResult.overallScore))}>
              {symmetryResult.overallScore}%
            </span>
          </div>
        </div>
      </div>

      {/* Critical Areas Alert */}
      {symmetryResult.criticalAreas && symmetryResult.criticalAreas.length > 0 && (
        <div className="flex items-start gap-2 p-2 mb-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] font-medium text-destructive">Áreas Críticas</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {symmetryResult.criticalAreas.map((area) => (
                <Badge key={area} variant="destructive" className="text-[9px] h-4 px-1.5">
                  {area}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Export options */}
      {onGetCanvasImage && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <Checkbox 
            id="includeImage" 
            checked={includeImage} 
            onCheckedChange={(checked) => setIncludeImage(checked === true)}
          />
          <Label htmlFor="includeImage" className="text-[10px] text-muted-foreground cursor-pointer flex items-center gap-1">
            <ImageIcon className="h-3 w-3" />
            Incluir imagem com mesh no PDF
          </Label>
        </div>
      )}

      {/* Overall Score Bar */}
      <div className="space-y-1 mb-3">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Assimétrico</span>
          <span>Simétrico</span>
        </div>
        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className={cn('h-full rounded-full transition-all', getProgressColor(symmetryResult.overallScore))}
            style={{ width: `${symmetryResult.overallScore}%` }}
          />
        </div>
      </div>

      {/* Regional Scores */}
      {symmetryResult.regionalScores && symmetryResult.regionalScores.length > 0 && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-6 text-xs justify-between px-2 mb-2"
            onClick={() => setShowRegions(!showRegions)}
          >
            <span>Análise por Região</span>
            {showRegions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>

          {showRegions && (
            <div className="space-y-1.5 mb-3">
              {symmetryResult.regionalScores.map((region) => (
                <div key={region.region} className="flex items-center justify-between py-1 px-2 bg-muted/30 rounded">
                  <span className="text-[10px] text-foreground">{region.regionLabel}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={cn('h-full rounded-full', getProgressColor(region.score))}
                        style={{ width: `${region.score}%` }}
                      />
                    </div>
                    <span className={cn('text-[10px] font-mono w-10 text-right', getScoreColor(region.score))}>
                      {region.score}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Expand/Collapse Details */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-6 text-xs justify-between px-2"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>Detalhes por pares</span>
        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </Button>

      {/* Detailed Pairs */}
      {isExpanded && (
        <div className="mt-2 space-y-2">
          {symmetryResult.pairs.map((pair) => (
            <div key={pair.label} className="flex items-center justify-between py-1 border-t border-border/50">
              <div className="flex-1">
                <span className="text-[10px] text-foreground">{pair.label}</span>
                <div className="flex gap-2 text-[9px] text-muted-foreground">
                  <span>V: {pair.verticalDiff}%</span>
                  <span>H: {pair.horizontalDiff}%</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn('h-full rounded-full', getProgressColor(100 - pair.deviation))}
                    style={{ width: `${100 - pair.deviation}%` }}
                  />
                </div>
                <span className={cn('text-[10px] font-mono w-10 text-right', getDeviationColor(pair.deviation))}>
                  {pair.deviation <= 10 ? 'OK' : `-${pair.deviation.toFixed(0)}%`}
                </span>
              </div>
            </div>
          ))}
          
          <p className="text-[9px] text-muted-foreground pt-1 border-t border-border/50">
            V = diferença vertical • H = diferença horizontal do eixo central
          </p>
        </div>
      )}
    </div>
  );
}
