// Estado da deformação facial (PR-4, nível 1).
//
// Guarda os deslocamentos acumulados por landmark e os parâmetros da ferramenta.
// A deformação é geométrica: ver a nota de escopo em src/lib/faceWarp.ts.

import { useState, useCallback, useMemo } from 'react';
import { computePull, type DisplacementMap } from '@/lib/faceWarp';
import {
  buildAnchorStiffness,
  countAnchoredLandmarks,
  DEFAULT_ANCHOR_REGIONS,
  type AnchorRegion,
} from '@/lib/facialAnchors';
import type { MediaPipePoint } from '@/types/mediapipeMesh';

// Raio em coordenadas normalizadas: 0,08 cobre aproximadamente uma sub-região facial
// (queixo, asa do nariz), que é a escala em que se pensa uma manobra local.
const DEFAULT_RADIUS = 0.08;
const DEFAULT_INTENSITY = 100;

interface UseFaceWarpReturn {
  displacements: DisplacementMap;
  hasWarp: boolean;
  displacedPointCount: number;

  radius: number;
  setRadius: (radius: number) => void;
  intensity: number;
  setIntensity: (intensity: number) => void;

  /** Regiões anatômicas que resistem ao deslocamento. */
  anchorRegions: AnchorRegion[];
  toggleAnchorRegion: (region: AnchorRegion) => void;
  anchoredLandmarkCount: number;

  /** Maior deslocamento aplicado, em coordenadas normalizadas. */
  maxDisplacement: number;

  /** Puxa um landmark, propagando aos vizinhos dentro do raio. */
  pull: (landmarks: MediaPipePoint[], pointIndex: number, dx: number, dy: number) => void;
  reset: () => void;
}

export function useFaceWarp(): UseFaceWarpReturn {
  const [displacements, setDisplacements] = useState<DisplacementMap>(() => new Map());
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);
  const [anchorRegions, setAnchorRegions] = useState<AnchorRegion[]>(DEFAULT_ANCHOR_REGIONS);

  const pull = useCallback(
    (landmarks: MediaPipePoint[], pointIndex: number, dx: number, dy: number) => {
      const scale = intensity / 100;
      // A ancoragem anatômica ocupa o parâmetro de rigidez. O nível 2 soma a este a
      // rigidez do tecido lesionado, sem alterar o motor.
      const stiffness = buildAnchorStiffness(anchorRegions);

      setDisplacements(current =>
        computePull(landmarks, current, {
          pointIndex,
          dx: dx * scale,
          dy: dy * scale,
          radius,
          stiffness,
        }),
      );
    },
    [radius, intensity, anchorRegions],
  );

  const toggleAnchorRegion = useCallback((region: AnchorRegion) => {
    setAnchorRegions(current =>
      current.includes(region) ? current.filter(r => r !== region) : [...current, region],
    );
  }, []);

  const reset = useCallback(() => setDisplacements(new Map()), []);

  const hasWarp = displacements.size > 0;
  const displacedPointCount = useMemo(() => displacements.size, [displacements]);

  const anchoredLandmarkCount = useMemo(
    () => countAnchoredLandmarks(anchorRegions),
    [anchorRegions],
  );

  // O maior deslocamento é o número que descreve a manobra: é ele que vira milímetros
  // quando a foto está calibrada.
  const maxDisplacement = useMemo(() => {
    let largest = 0;
    displacements.forEach(({ dx, dy }) => {
      largest = Math.max(largest, Math.hypot(dx, dy));
    });
    return largest;
  }, [displacements]);

  return {
    displacements,
    hasWarp,
    displacedPointCount,
    radius,
    setRadius,
    intensity,
    setIntensity,
    anchorRegions,
    toggleAnchorRegion,
    anchoredLandmarkCount,
    maxDisplacement,
    pull,
    reset,
  };
}
