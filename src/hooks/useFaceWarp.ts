// Estado da deformação facial (PR-4, nível 1).
//
// Guarda os deslocamentos acumulados por landmark e os parâmetros da ferramenta.
// A deformação é geométrica: ver a nota de escopo em src/lib/faceWarp.ts.

import { useState, useCallback, useMemo, useRef } from 'react';
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
  /** Fecha o arraste em curso, transformando-o em um passo do histórico. */
  commitStroke: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

export function useFaceWarp(): UseFaceWarpReturn {
  const [displacements, setDisplacements] = useState<DisplacementMap>(() => new Map());
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);
  const [anchorRegions, setAnchorRegions] = useState<AnchorRegion[]>(DEFAULT_ANCHOR_REGIONS);

  // Um arraste dispara dezenas de chamadas a `pull` — uma por quadro. O passo do histórico
  // é o arraste inteiro, não cada quadro: desfazer devolve ao estado de antes de encostar
  // no rosto, que é o que se espera de um Ctrl+Z.
  const [past, setPast] = useState<DisplacementMap[]>([]);
  const [future, setFuture] = useState<DisplacementMap[]>([]);
  const strokeBaseRef = useRef<DisplacementMap | null>(null);

  const pull = useCallback(
    (landmarks: MediaPipePoint[], pointIndex: number, dx: number, dy: number) => {
      const scale = intensity / 100;
      // A ancoragem anatômica ocupa o parâmetro de rigidez. O nível 2 soma a este a
      // rigidez do tecido lesionado, sem alterar o motor.
      const stiffness = buildAnchorStiffness(anchorRegions);

      // Primeiro quadro do arraste: guarda o estado anterior para virar um passo.
      if (!strokeBaseRef.current) strokeBaseRef.current = displacements;

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
    [displacements, radius, intensity, anchorRegions],
  );

  const commitStroke = useCallback(() => {
    const base = strokeBaseRef.current;
    strokeBaseRef.current = null;
    if (!base) return;

    setPast(current => [...current, base]);
    // Uma ação nova descarta o que havia para refazer, como em qualquer editor.
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;

    strokeBaseRef.current = null;
    setFuture(current => [...current, displacements]);
    setDisplacements(past[past.length - 1]);
    setPast(current => current.slice(0, -1));
  }, [past, displacements]);

  const redo = useCallback(() => {
    if (future.length === 0) return;

    strokeBaseRef.current = null;
    setPast(current => [...current, displacements]);
    setDisplacements(future[future.length - 1]);
    setFuture(current => current.slice(0, -1));
  }, [future, displacements]);

  const toggleAnchorRegion = useCallback((region: AnchorRegion) => {
    setAnchorRegions(current =>
      current.includes(region) ? current.filter(r => r !== region) : [...current, region],
    );
  }, []);

  // Voltar ao original também é um passo: dá para desfazer se tiver sido sem querer.
  const reset = useCallback(() => {
    strokeBaseRef.current = null;
    if (displacements.size === 0) return;

    setPast(current => [...current, displacements]);
    setFuture([]);
    setDisplacements(new Map());
  }, [displacements]);

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
    commitStroke,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    reset,
  };
}
