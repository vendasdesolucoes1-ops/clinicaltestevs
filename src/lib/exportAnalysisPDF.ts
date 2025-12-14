import { jsPDF } from 'jspdf';
import { SymmetryResult } from '@/types/facialLandmarks';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ExportPDFOptions {
  caseName: string;
  photoAngle?: string;
  symmetryResult: SymmetryResult | null;
  canvasImageUrl?: string | null;
  analysisDate?: Date;
}

const ANGLE_LABELS: Record<string, string> = {
  frente: 'Frente',
  perfil_d: 'Perfil Direito',
  perfil_e: 'Perfil Esquerdo',
  tres_quartos: '3/4',
};

export async function exportAnalysisPDF({
  caseName,
  photoAngle,
  symmetryResult,
  canvasImageUrl,
  analysisDate = new Date(),
}: ExportPDFOptions): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = margin;

  // Helper function to add text
  const addText = (text: string, x: number, y: number, options?: { fontSize?: number; fontStyle?: 'normal' | 'bold'; color?: [number, number, number] }) => {
    const { fontSize = 10, fontStyle = 'normal', color = [0, 0, 0] } = options || {};
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', fontStyle);
    doc.setTextColor(...color);
    doc.text(text, x, y);
    return y + (fontSize * 0.4);
  };

  // Header
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório de Análise Facial', margin, 18);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Caso: ${caseName}`, margin, 28);
  doc.text(`Data: ${format(analysisDate, "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}`, pageWidth - margin - 60, 28);
  
  yPos = 50;

  // Photo info
  if (photoAngle) {
    yPos = addText(`Ângulo da Foto: ${ANGLE_LABELS[photoAngle] || photoAngle}`, margin, yPos, { fontSize: 11 });
    yPos += 5;
  }

  // Canvas Image
  if (canvasImageUrl) {
    try {
      const imgWidth = pageWidth - (margin * 2);
      const imgHeight = imgWidth * 0.75; // 4:3 aspect ratio
      
      // Add image
      doc.addImage(canvasImageUrl, 'PNG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 10;
    } catch (error) {
      console.error('Erro ao adicionar imagem:', error);
      yPos = addText('(Imagem não disponível)', margin, yPos, { fontSize: 10, color: [128, 128, 128] });
      yPos += 10;
    }
  }

  // Check if we need a new page
  if (yPos > pageHeight - 100) {
    doc.addPage();
    yPos = margin;
  }

  // Symmetry Analysis Section
  if (symmetryResult) {
    // Section title
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, yPos, pageWidth - (margin * 2), 10, 'F');
    yPos = addText('ANÁLISE DE SIMETRIA', margin + 3, yPos + 7, { fontSize: 12, fontStyle: 'bold' });
    yPos += 8;

    // Overall Score
    const scoreColor: [number, number, number] = symmetryResult.overallScore >= 80 
      ? [34, 197, 94] // green
      : symmetryResult.overallScore >= 60 
        ? [234, 179, 8] // yellow
        : [239, 68, 68]; // red

    yPos = addText('Score Geral de Simetria:', margin, yPos, { fontSize: 11, fontStyle: 'bold' });
    yPos = addText(`${symmetryResult.overallScore.toFixed(1)}%`, margin + 50, yPos - 4, { fontSize: 16, fontStyle: 'bold', color: scoreColor });
    yPos += 5;

    // Interpretation
    const interpretation = symmetryResult.overallScore >= 80 
      ? 'Simetria facial dentro dos parâmetros normais.'
      : symmetryResult.overallScore >= 60 
        ? 'Assimetria facial moderada detectada.'
        : 'Assimetria facial significativa detectada.';
    
    yPos = addText(interpretation, margin, yPos, { fontSize: 10, color: scoreColor });
    yPos += 10;

    // Critical Areas
    if (symmetryResult.criticalAreas.length > 0) {
      yPos = addText('Áreas Críticas (score < 70%):', margin, yPos, { fontSize: 11, fontStyle: 'bold', color: [239, 68, 68] });
      yPos += 2;
      symmetryResult.criticalAreas.forEach(area => {
        yPos = addText(`• ${area}`, margin + 5, yPos, { fontSize: 10 });
        yPos += 1;
      });
      yPos += 5;
    }

    // Check if we need a new page for regional scores
    if (yPos > pageHeight - 80) {
      doc.addPage();
      yPos = margin;
    }

    // Regional Scores Table
    yPos = addText('Scores por Região:', margin, yPos, { fontSize: 11, fontStyle: 'bold' });
    yPos += 5;

    // Table header
    doc.setFillColor(226, 232, 240); // slate-200
    doc.rect(margin, yPos, pageWidth - (margin * 2), 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Região', margin + 3, yPos + 5.5);
    doc.text('Score', margin + 80, yPos + 5.5);
    doc.text('Status', margin + 110, yPos + 5.5);
    yPos += 8;

    // Table rows
    doc.setFont('helvetica', 'normal');
    symmetryResult.regionalScores.forEach((region, index) => {
      if (yPos > pageHeight - 20) {
        doc.addPage();
        yPos = margin;
      }

      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252); // slate-50
        doc.rect(margin, yPos, pageWidth - (margin * 2), 7, 'F');
      }

      doc.setTextColor(0, 0, 0);
      doc.text(region.regionLabel, margin + 3, yPos + 5);
      
      const regionScoreColor: [number, number, number] = region.score >= 70 
        ? [34, 197, 94] 
        : region.score >= 50 
          ? [234, 179, 8] 
          : [239, 68, 68];
      
      doc.setTextColor(...regionScoreColor);
      doc.text(`${region.score.toFixed(1)}%`, margin + 80, yPos + 5);
      
      const status = region.score >= 70 ? 'Normal' : region.score >= 50 ? 'Atenção' : 'Crítico';
      doc.text(status, margin + 110, yPos + 5);
      
      yPos += 7;
    });

    yPos += 10;

    // Check if we need a new page for detailed pairs
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = margin;
    }

    // Top Deviations
    yPos = addText('Maiores Desvios Detectados:', margin, yPos, { fontSize: 11, fontStyle: 'bold' });
    yPos += 5;

    const topDeviations = symmetryResult.pairs.slice(0, 8);
    
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, yPos, pageWidth - (margin * 2), 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Par de Pontos', margin + 3, yPos + 5.5);
    doc.text('Desvio', margin + 80, yPos + 5.5);
    doc.text('Vertical (mm)', margin + 105, yPos + 5.5);
    doc.text('Horizontal (mm)', margin + 135, yPos + 5.5);
    yPos += 8;

    doc.setFont('helvetica', 'normal');
    topDeviations.forEach((pair, index) => {
      if (yPos > pageHeight - 20) {
        doc.addPage();
        yPos = margin;
      }

      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, yPos, pageWidth - (margin * 2), 7, 'F');
      }

      doc.setTextColor(0, 0, 0);
      doc.text(pair.label, margin + 3, yPos + 5);
      
      const deviationColor: [number, number, number] = pair.deviation <= 20 
        ? [34, 197, 94] 
        : pair.deviation <= 40 
          ? [234, 179, 8] 
          : [239, 68, 68];
      
      doc.setTextColor(...deviationColor);
      doc.text(`${pair.deviation.toFixed(1)}%`, margin + 80, yPos + 5);
      
      doc.setTextColor(0, 0, 0);
      doc.text(`${pair.verticalDiff.toFixed(1)}`, margin + 105, yPos + 5);
      doc.text(`${pair.horizontalDiff.toFixed(1)}`, margin + 135, yPos + 5);
      
      yPos += 7;
    });
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      'Simulação para planejamento — não substitui avaliação clínica',
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth - margin,
      pageHeight - 10,
      { align: 'right' }
    );
  }

  // Save the PDF
  const fileName = `analise-facial-${caseName.replace(/\s+/g, '-').toLowerCase()}-${format(analysisDate, 'yyyy-MM-dd-HHmm')}.pdf`;
  doc.save(fileName);
}
