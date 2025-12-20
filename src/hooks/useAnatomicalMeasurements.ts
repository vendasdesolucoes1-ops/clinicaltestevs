// Hook for calculating anatomical measurements from facial landmarks
import { useMemo } from 'react';
import { FacialMeshData, FacialPoint } from '@/types/facialLandmarks';
import { MediaPipeMeshData } from '@/types/mediapipeMesh';
import {
  AnatomicalMeasurements,
  AnatomicalMeasurement,
  FacialThirds,
  MEASUREMENT_REFERENCES,
  PHI,
} from '@/types/clinicalTools';

interface UseAnatomicalMeasurementsOptions {
  meshData?: FacialMeshData | null;
  mediaPipeMeshData?: MediaPipeMeshData | null;
  pixelsPerMm?: number;
  imageWidth?: number;
  imageHeight?: number;
}

// Helper to find point by ID in mesh data
function findPoint(points: FacialPoint[], id: string): FacialPoint | undefined {
  return points.find(p => p.id === id);
}

// Calculate distance between two points in pixels
function calculateDistancePx(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  width: number,
  height: number
): number {
  const dx = (p2.x - p1.x) * width;
  const dy = (p2.y - p1.y) * height;
  return Math.sqrt(dx * dx + dy * dy);
}

// Determine status based on value and reference
function getStatus(value: number, ref: { min: number; max: number }): 'normal' | 'warning' | 'critical' {
  if (value >= ref.min && value <= ref.max) return 'normal';
  const deviation = value < ref.min 
    ? (ref.min - value) / ref.min 
    : (value - ref.max) / ref.max;
  return deviation > 0.15 ? 'critical' : 'warning';
}

// Format deviation percentage
function formatDeviation(value: number, ideal: number): string {
  const deviation = ((value - ideal) / ideal) * 100;
  const sign = deviation > 0 ? '+' : '';
  return `${sign}${deviation.toFixed(1)}%`;
}

export function useAnatomicalMeasurements({
  meshData,
  mediaPipeMeshData,
  pixelsPerMm = 0,
  imageWidth = 1,
  imageHeight = 1,
}: UseAnatomicalMeasurementsOptions): AnatomicalMeasurements | null {
  return useMemo(() => {
    // Need either mesh data and calibration to calculate
    if (!meshData?.points || meshData.points.length < 10 || pixelsPerMm <= 0) {
      return null;
    }

    const points = meshData.points;
    const measurements: AnatomicalMeasurements = {};

    // === INTERCANTHAL DISTANCE ===
    // Distance between inner corners of eyes (medial canthi)
    const leftInner = findPoint(points, 'orbitale_left_inner');
    const rightInner = findPoint(points, 'orbitale_right_inner');
    
    if (leftInner && rightInner) {
      const distPx = calculateDistancePx(leftInner, rightInner, imageWidth, imageHeight);
      const distMm = distPx / pixelsPerMm;
      const ref = MEASUREMENT_REFERENCES.intercanthalDistance;
      
      measurements.intercanthalDistance = {
        id: 'intercanthal',
        name: 'Intercanthal Distance',
        namePt: 'Distância Intercantal',
        value: Math.round(distMm * 10) / 10,
        reference: ref,
        unit: 'mm',
        status: getStatus(distMm, ref),
        description: `Desvio: ${formatDeviation(distMm, ref.ideal)}`,
      };
    }

    // === NASAL WIDTH ===
    // Distance between outer edges of nasal alae
    const leftAlar = findPoint(points, 'alar_left_2');
    const rightAlar = findPoint(points, 'alar_right_2');
    
    if (leftAlar && rightAlar) {
      const distPx = calculateDistancePx(leftAlar, rightAlar, imageWidth, imageHeight);
      const distMm = distPx / pixelsPerMm;
      const ref = MEASUREMENT_REFERENCES.nasalWidth;
      
      // Compare to intercanthal if available
      let description = `Desvio: ${formatDeviation(distMm, ref.ideal)}`;
      if (measurements.intercanthalDistance) {
        const ratio = distMm / measurements.intercanthalDistance.value;
        description += ` | Razão IC: ${ratio.toFixed(2)} (ideal: 1.0)`;
      }
      
      measurements.nasalWidth = {
        id: 'nasal_width',
        name: 'Nasal Width',
        namePt: 'Largura Nasal',
        value: Math.round(distMm * 10) / 10,
        reference: ref,
        unit: 'mm',
        status: getStatus(distMm, ref),
        description,
      };
    }

    // === MOUTH WIDTH ===
    // Distance between oral commissures
    const leftCheilion = findPoint(points, 'cheilion_left');
    const rightCheilion = findPoint(points, 'cheilion_right');
    
    if (leftCheilion && rightCheilion) {
      const distPx = calculateDistancePx(leftCheilion, rightCheilion, imageWidth, imageHeight);
      const distMm = distPx / pixelsPerMm;
      const ref = MEASUREMENT_REFERENCES.mouthWidth;
      
      measurements.mouthWidth = {
        id: 'mouth_width',
        name: 'Mouth Width',
        namePt: 'Largura Oral',
        value: Math.round(distMm * 10) / 10,
        reference: ref,
        unit: 'mm',
        status: getStatus(distMm, ref),
        description: `Desvio: ${formatDeviation(distMm, ref.ideal)}`,
      };
    }

    // === FACIAL WIDTH ===
    // Distance between zygion points (bizygomatic width)
    const leftZygion = findPoint(points, 'zygion_left');
    const rightZygion = findPoint(points, 'zygion_right');
    
    if (leftZygion && rightZygion) {
      const distPx = calculateDistancePx(leftZygion, rightZygion, imageWidth, imageHeight);
      const distMm = distPx / pixelsPerMm;
      const ref = MEASUREMENT_REFERENCES.facialWidth;
      
      measurements.facialWidth = {
        id: 'facial_width',
        name: 'Facial Width',
        namePt: 'Largura Facial',
        value: Math.round(distMm * 10) / 10,
        reference: ref,
        unit: 'mm',
        status: getStatus(distMm, ref),
        description: `Desvio: ${formatDeviation(distMm, ref.ideal)}`,
      };
    }

    // === FACIAL THIRDS ===
    // Upper: trichion to glabella
    // Middle: glabella to subnasale
    // Lower: subnasale to menton
    const trichion = findPoint(points, 'trichion');
    const glabella = findPoint(points, 'glabella');
    const subnasale = findPoint(points, 'subnasale');
    const menton = findPoint(points, 'menton');
    
    if (glabella && subnasale && menton) {
      // Use glabella as top if trichion not available
      const topPoint = trichion || glabella;
      
      const upperPx = trichion 
        ? Math.abs(glabella.y - trichion.y) * imageHeight
        : 0;
      const middlePx = Math.abs(subnasale.y - glabella.y) * imageHeight;
      const lowerPx = Math.abs(menton.y - subnasale.y) * imageHeight;
      
      const totalPx = upperPx + middlePx + lowerPx;
      
      if (totalPx > 0) {
        const upperMm = upperPx / pixelsPerMm;
        const middleMm = middlePx / pixelsPerMm;
        const lowerMm = lowerPx / pixelsPerMm;
        const totalMm = totalPx / pixelsPerMm;
        
        const upperPercent = (upperPx / totalPx) * 100;
        const middlePercent = (middlePx / totalPx) * 100;
        const lowerPercent = (lowerPx / totalPx) * 100;
        
        // Check if proportional (each third should be ~33%)
        const idealPercent = 33.33;
        const tolerance = 5; // ±5%
        const isProportional = 
          (!trichion || Math.abs(upperPercent - idealPercent) <= tolerance) &&
          Math.abs(middlePercent - idealPercent) <= tolerance &&
          Math.abs(lowerPercent - idealPercent) <= tolerance;
        
        measurements.facialThirds = {
          upper: { 
            value: Math.round(upperMm * 10) / 10, 
            percent: Math.round(upperPercent * 10) / 10 
          },
          middle: { 
            value: Math.round(middleMm * 10) / 10, 
            percent: Math.round(middlePercent * 10) / 10 
          },
          lower: { 
            value: Math.round(lowerMm * 10) / 10, 
            percent: Math.round(lowerPercent * 10) / 10 
          },
          isProportional,
        };

        // Also calculate total facial height
        measurements.facialHeight = {
          id: 'facial_height',
          name: 'Facial Height',
          namePt: 'Altura Facial',
          value: Math.round(totalMm * 10) / 10,
          reference: MEASUREMENT_REFERENCES.facialHeight,
          unit: 'mm',
          status: getStatus(totalMm, MEASUREMENT_REFERENCES.facialHeight),
        };
      }
    }

    // === GOLDEN RATIO ===
    // Check facial width to lower facial height ratio (should be close to PHI)
    if (measurements.facialWidth && measurements.facialThirds) {
      const lowerHeight = measurements.facialThirds.middle.value + measurements.facialThirds.lower.value;
      const ratio = measurements.facialWidth.value / lowerHeight;
      const deviation = Math.abs(ratio - PHI) / PHI;
      
      measurements.goldenRatio = {
        id: 'golden_ratio',
        name: 'Golden Ratio',
        namePt: 'Proporção Áurea',
        value: Math.round(ratio * 1000) / 1000,
        reference: { min: PHI - 0.15, max: PHI + 0.15 },
        unit: 'ratio',
        status: deviation <= 0.05 ? 'normal' : deviation <= 0.15 ? 'warning' : 'critical',
        description: `Φ = ${PHI.toFixed(3)} | Desvio: ${(deviation * 100).toFixed(1)}%`,
      };
    }

    return measurements;
  }, [meshData, mediaPipeMeshData, pixelsPerMm, imageWidth, imageHeight]);
}
