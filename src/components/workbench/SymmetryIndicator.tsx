import { SymmetryResult } from '@/types/facialLandmarks';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

interface SymmetryIndicatorProps {
  symmetryResult: SymmetryResult | null;
  isAnalyzing: boolean;
}

export function SymmetryIndicator({ symmetryResult, isAnalyzing }: SymmetryIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = useCallback(async () => {
    if (!symmetryResult) return;
    
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let y = margin;

      // Header
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Relatório de Análise de Simetria Facial', margin, y);
      y += 10;

      // Date
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin, y);
      y += 15;

      // Disclaimer
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Simulação para planejamento — não substitui avaliação clínica', margin, y);
      doc.setTextColor(0, 0, 0);
      y += 15;

      // Overall Score Section
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Pontuação Geral de Simetria', margin, y);
      y += 8;

      doc.setFontSize(28);
      const scoreColor = symmetryResult.overallScore >= 90 ? [34, 197, 94] : 
                         symmetryResult.overallScore >= 75 ? [234, 179, 8] :
                         symmetryResult.overallScore >= 60 ? [249, 115, 22] : [239, 68, 68];
      doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
      doc.text(`${symmetryResult.overallScore}%`, margin, y);
      doc.setTextColor(0, 0, 0);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const interpretation = symmetryResult.overallScore >= 90 ? 'Excelente simetria facial' :
                            symmetryResult.overallScore >= 75 ? 'Boa simetria com pequenas variações' :
                            symmetryResult.overallScore >= 60 ? 'Assimetria moderada detectada' :
                            'Assimetria significativa requer atenção';
      doc.text(interpretation, margin, y);
      y += 20;

      // Detailed Analysis Table
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Análise por Região Anatômica', margin, y);
      y += 10;

      // Table Header
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y - 4, pageWidth - 2 * margin, 8, 'F');
      doc.text('Região', margin + 2, y);
      doc.text('Desvio', margin + 80, y);
      doc.text('Dif. Vertical', margin + 110, y);
      doc.text('Dif. Horizontal', margin + 145, y);
      y += 8;

      // Table Content
      doc.setFont('helvetica', 'normal');
      symmetryResult.pairs.forEach((pair, index) => {
        if (y > 270) {
          doc.addPage();
          y = margin;
        }

        if (index % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(margin, y - 4, pageWidth - 2 * margin, 7, 'F');
        }

        doc.text(pair.label, margin + 2, y);
        
        const deviationColor = pair.deviation <= 10 ? [34, 197, 94] : 
                               pair.deviation <= 25 ? [234, 179, 8] :
                               pair.deviation <= 50 ? [249, 115, 22] : [239, 68, 68];
        doc.setTextColor(deviationColor[0], deviationColor[1], deviationColor[2]);
        doc.text(`${pair.deviation.toFixed(1)}%`, margin + 80, y);
        doc.setTextColor(0, 0, 0);
        
        doc.text(`${pair.verticalDiff}%`, margin + 110, y);
        doc.text(`${pair.horizontalDiff}%`, margin + 145, y);
        y += 7;
      });

      y += 10;

      // Legend
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Legenda: Dif. Vertical = diferença de altura entre pontos espelhados', margin, y);
      y += 5;
      doc.text('Dif. Horizontal = diferença de distância do eixo central', margin, y);
      y += 10;

      // Footer
      doc.setFontSize(8);
      doc.text('Gerado por InsightsCirurgic — Ferramenta de Planejamento Cirúrgico', margin, 285);

      // Save
      doc.save(`relatorio-simetria-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Relatório PDF exportado com sucesso');
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toast.error('Erro ao gerar relatório PDF');
    } finally {
      setIsExporting(false);
    }
  }, [symmetryResult]);

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

      {/* Expand/Collapse Details */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-6 text-xs justify-between px-2"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>Detalhes por região</span>
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
