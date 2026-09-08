// Estado da deformação facial (PR-4, nível 1).
//
// Guarda os deslocamentos acumulados por landmark e os parâmetros da ferramenta.
// A deformação é geométrica: ver a nota de escopo em src/lib/faceWarp.ts.

import { useState, useCallback, useMemo } from 'react';
import { computePull, type DisplacementMap } from '@/lib/faceWarp';
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

  /** Puxa um landmark, propagando aos vizinhos dentro do raio. */
  pull: (landmarks: MediaPipePoint[], pointIndex: number, dx: number, dy: number) => void;
  reset: () => void;
}

export function useFaceWarp(): UseFaceWarpReturn {
  const [displacements, setDisplacements] = useState<DisplacementMap>(() => new Map());
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);

  const pull = useCallback(
    (landmarks: MediaPipePoint[], pointIndex: number, dx: number, dy: number) => {
      const scale = intensity / 100;
      setDisplacements(current =>
        computePull(landmarks, current, {
          pointIndex,
          dx: dx * scale,
          dy: dy * scale,
          radius,
          // Nível 2 entra aqui: rigidez por tecido (cicatriz/queimadura resistindo mais
          // que a pele saudável ao redor). Hoje uniforme.
        }),
      );
    },
    [radius, intensity],
  );

  const reset = useCallback(() => setDisplacements(new Map()), []);

  const hasWarp = displacements.size > 0;
  const displacedPointCount = useMemo(() => displacements.size, [displacements]);

  return {
    displacements,
    hasWarp,
    displacedPointCount,
    radius,
    setRadius,
    intensity,
    setIntensity,
    pull,
    reset,
  };
}
