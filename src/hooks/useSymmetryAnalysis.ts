import { useMemo } from 'react';
import { FacialMeshData, MIRRORED_POINT_PAIRS, SymmetryResult } from '@/types/facialLandmarks';

export const useSymmetryAnalysis = (meshData: FacialMeshData | null): SymmetryResult | null => {
  return useMemo(() => {
    if (!meshData || meshData.points.length === 0) return null;

    const pointsMap = new Map(meshData.points.map(p => [p.id, p]));
    
    // Encontrar o eixo central (média dos pontos centrais: glabella, nasion, pronasale, subnasale, gnathion)
    const centralPoints = ['glabella', 'nasion', 'pronasale', 'subnasale', 'labiale_superius', 'labiale_inferius', 'gnathion'];
    const centralXValues: number[] = [];
    
    centralPoints.forEach(id => {
      const point = pointsMap.get(id);
      if (point) {
        centralXValues.push(point.x);
      }
    });
    
    // Eixo central é a média dos pontos centrais
    const centerX = centralXValues.length > 0 
      ? centralXValues.reduce((a, b) => a + b, 0) / centralXValues.length 
      : 0.5;

    const pairResults: SymmetryResult['pairs'] = [];
    
    MIRRORED_POINT_PAIRS.forEach(pair => {
      const leftPoint = pointsMap.get(pair.left);
      const rightPoint = pointsMap.get(pair.right);
      
      if (!leftPoint || !rightPoint) return;
      
      // Calcular diferença vertical (Y deve ser igual para pontos simétricos)
      const verticalDiff = Math.abs(leftPoint.y - rightPoint.y);
      
      // Calcular diferença horizontal (distância do eixo central deve ser igual)
      const leftDistFromCenter = Math.abs(leftPoint.x - centerX);
      const rightDistFromCenter = Math.abs(rightPoint.x - centerX);
      const horizontalDiff = Math.abs(leftDistFromCenter - rightDistFromCenter);
      
      // Calcular desvio total (combinação de vertical e horizontal)
      // Normalizado para 0-100 onde 0 é perfeito
      // Assumindo que uma diferença de 0.1 (10% da face) é "muito assimétrico"
      const maxDeviation = 0.15; // 15% da dimensão da face como máximo
      const totalDeviation = Math.sqrt(verticalDiff ** 2 + horizontalDiff ** 2);
      const normalizedDeviation = Math.min(100, (totalDeviation / maxDeviation) * 100);
      
      pairResults.push({
        label: pair.label,
        leftPoint: pair.left,
        rightPoint: pair.right,
        deviation: Math.round(normalizedDeviation * 10) / 10,
        verticalDiff: Math.round(verticalDiff * 1000) / 10, // em % da altura
        horizontalDiff: Math.round(horizontalDiff * 1000) / 10, // em % da largura
      });
    });
    
    // Calcular score geral (100 - média das deviações)
    const avgDeviation = pairResults.length > 0 
      ? pairResults.reduce((sum, p) => sum + p.deviation, 0) / pairResults.length 
      : 0;
    
    const overallScore = Math.max(0, Math.round((100 - avgDeviation) * 10) / 10);
    
    return {
      overallScore,
      pairs: pairResults.sort((a, b) => b.deviation - a.deviation), // Ordenar por maior desvio
    };
  }, [meshData]);
};
