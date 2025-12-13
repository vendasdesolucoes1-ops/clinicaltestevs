import { useMemo } from 'react';
import { FacialMeshData, MIRRORED_POINT_PAIRS, SymmetryResult, RegionalSymmetry } from '@/types/facialLandmarks';

const REGION_LABELS: Record<string, string> = {
  forehead: 'Testa',
  eyebrows: 'Sobrancelhas',
  eyes: 'Olhos',
  nose: 'Nariz',
  mouth: 'Boca',
  zygomatic: 'Zigomático',
  cheeks: 'Bochechas',
  mandible: 'Mandíbula',
};

export const useSymmetryAnalysis = (meshData: FacialMeshData | null): SymmetryResult | null => {
  return useMemo(() => {
    if (!meshData || meshData.points.length === 0) return null;

    const pointsMap = new Map(meshData.points.map(p => [p.id, p]));
    
    // Encontrar o eixo central usando pontos da linha média se disponíveis
    let centerX = 0.5;
    
    if (meshData.midlinePoints && meshData.midlinePoints.length > 0) {
      const midlineXValues: number[] = [];
      meshData.midlinePoints.forEach(id => {
        const point = pointsMap.get(id);
        if (point) {
          midlineXValues.push(point.x);
        }
      });
      if (midlineXValues.length > 0) {
        centerX = midlineXValues.reduce((a, b) => a + b, 0) / midlineXValues.length;
      }
    } else {
      // Fallback para pontos centrais conhecidos
      const centralPoints = ['glabella', 'nasion', 'pronasale', 'subnasale', 'labiale_superius', 'labiale_inferius', 'gnathion', 'menton'];
      const centralXValues: number[] = [];
      centralPoints.forEach(id => {
        const point = pointsMap.get(id);
        if (point) {
          centralXValues.push(point.x);
        }
      });
      if (centralXValues.length > 0) {
        centerX = centralXValues.reduce((a, b) => a + b, 0) / centralXValues.length;
      }
    }

    const pairResults: SymmetryResult['pairs'] = [];
    const regionalData: Record<string, RegionalSymmetry['pairs']> = {};
    
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
      
      // Calcular desvio total normalizado para 0-100
      const maxDeviation = 0.15;
      const totalDeviation = Math.sqrt(verticalDiff ** 2 + horizontalDiff ** 2);
      const normalizedDeviation = Math.min(100, (totalDeviation / maxDeviation) * 100);
      
      const pairResult = {
        label: pair.label,
        leftPoint: pair.left,
        rightPoint: pair.right,
        deviation: Math.round(normalizedDeviation * 10) / 10,
        verticalDiff: Math.round(verticalDiff * 1000) / 10,
        horizontalDiff: Math.round(horizontalDiff * 1000) / 10,
      };
      
      pairResults.push(pairResult);
      
      // Agrupar por região
      const region = pair.region;
      if (!regionalData[region]) {
        regionalData[region] = [];
      }
      regionalData[region].push({
        label: pair.label,
        deviation: pairResult.deviation,
        verticalDiff: pairResult.verticalDiff,
        horizontalDiff: pairResult.horizontalDiff,
      });
    });
    
    // Calcular score por região
    const regionalScores: RegionalSymmetry[] = Object.entries(regionalData).map(([region, pairs]) => {
      const avgDeviation = pairs.reduce((sum, p) => sum + p.deviation, 0) / pairs.length;
      const score = Math.max(0, Math.round((100 - avgDeviation) * 10) / 10);
      return {
        region,
        regionLabel: REGION_LABELS[region] || region,
        score,
        pairs,
      };
    }).sort((a, b) => a.score - b.score); // Ordenar por menor score (mais problemático primeiro)
    
    // Identificar áreas críticas (score < 70)
    const criticalAreas = regionalScores
      .filter(r => r.score < 70)
      .map(r => r.regionLabel);
    
    // Calcular score geral
    const avgDeviation = pairResults.length > 0 
      ? pairResults.reduce((sum, p) => sum + p.deviation, 0) / pairResults.length 
      : 0;
    
    const overallScore = Math.max(0, Math.round((100 - avgDeviation) * 10) / 10);
    
    return {
      overallScore,
      pairs: pairResults.sort((a, b) => b.deviation - a.deviation),
      regionalScores,
      criticalAreas,
    };
  }, [meshData]);
};
