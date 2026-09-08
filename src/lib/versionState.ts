// Conteúdo de `case_versions.canvas_state`.
//
// A coluna existe desde a criação da tabela e nunca recebeu um byte: uma "versão" guardava
// nome, tipo, status e data, e nada do que o cirurgião tinha feito. Fechar a aba jogava
// fora a deformação, e comparar Técnica A com Técnica B comparava dois registros vazios.
//
// A leitura é deliberadamente defensiva. O que vier daqui foi gravado por alguma versão do
// app — inclusive versões futuras, ou nenhuma — e um caso antigo não pode falhar ao abrir
// por causa de um campo que mudou de forma. Qualquer coisa inesperada vira estado vazio.

import type { DisplacementMap } from '@/lib/faceWarp';
import type { AnchorRegion } from '@/lib/facialAnchors';

/** Sobe quando o formato mudar de forma incompatível. */
export const VERSION_STATE_SCHEMA = 1;

export interface VersionWarpState {
  displacements: DisplacementMap;
  radius: number;
  intensity: number;
  anchorRegions: AnchorRegion[];
}

export interface VersionState {
  warp: VersionWarpState | null;
}

const ANCHOR_REGIONS: AnchorRegion[] = ['face_oval', 'eyes', 'eyebrows', 'lips'];

/** JSON não transporta `Map`: os deslocamentos viajam como lista de pares. */
type SerializedDisplacement = [number, { dx: number; dy: number }];

interface SerializedState {
  schema: number;
  warp?: {
    displacements: SerializedDisplacement[];
    radius: number;
    intensity: number;
    anchorRegions: AnchorRegion[];
  };
}

export function serializeVersionState(state: VersionState): SerializedState {
  return {
    schema: VERSION_STATE_SCHEMA,
    warp: state.warp
      ? {
          displacements: [...state.warp.displacements.entries()].map(
            ([index, { dx, dy }]) => [index, { dx, dy }],
          ),
          radius: state.warp.radius,
          intensity: state.warp.intensity,
          anchorRegions: state.warp.anchorRegions,
        }
      : undefined,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseDisplacements(raw: unknown): DisplacementMap {
  const map: DisplacementMap = new Map();
  if (!Array.isArray(raw)) return map;

  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [index, displacement] = entry as [unknown, unknown];
    if (!isFiniteNumber(index) || index < 0) continue;

    const { dx, dy } = (displacement ?? {}) as { dx?: unknown; dy?: unknown };
    if (!isFiniteNumber(dx) || !isFiniteNumber(dy)) continue;

    map.set(index, { dx, dy });
  }
  return map;
}

/** Lê o `canvas_state` gravado. Nunca lança: o que não for reconhecido é descartado. */
export function parseVersionState(raw: unknown): VersionState {
  const empty: VersionState = { warp: null };
  if (!raw || typeof raw !== 'object') return empty;

  const state = raw as Partial<SerializedState>;
  // Um schema mais novo pode ter significados diferentes para os mesmos campos; abrir o
  // caso sem a deformação é melhor que reconstruí-la errado.
  if (state.schema !== VERSION_STATE_SCHEMA) return empty;

  const warp = state.warp;
  if (!warp || typeof warp !== 'object') return empty;

  const displacements = parseDisplacements(warp.displacements);
  if (displacements.size === 0) return empty;

  const anchorRegions = Array.isArray(warp.anchorRegions)
    ? warp.anchorRegions.filter((region): region is AnchorRegion => ANCHOR_REGIONS.includes(region))
    : [];

  return {
    warp: {
      displacements,
      radius: isFiniteNumber(warp.radius) && warp.radius > 0 ? warp.radius : 0.08,
      intensity: isFiniteNumber(warp.intensity) && warp.intensity > 0 ? warp.intensity : 100,
      anchorRegions,
    },
  };
}

/**
 * Dois estados descrevem a mesma coisa?
 *
 * Usado para saber se há trabalho não salvo, o que é verificado a cada quadro do arraste.
 * Serializar para comparar custaria dezenas de kilobytes de string por quadro; aqui a
 * comparação é numérica e não aloca. Precisa ser exata: um falso "sem alterações" faria a
 * troca de versão descartar a deformação sem perguntar.
 */
export function versionStatesEqual(a: VersionState, b: VersionState): boolean {
  if (!a.warp || !b.warp) return !a.warp && !b.warp;

  if (
    a.warp.radius !== b.warp.radius ||
    a.warp.intensity !== b.warp.intensity ||
    a.warp.anchorRegions.length !== b.warp.anchorRegions.length ||
    a.warp.displacements.size !== b.warp.displacements.size
  ) {
    return false;
  }

  for (const region of a.warp.anchorRegions) {
    if (!b.warp.anchorRegions.includes(region)) return false;
  }

  for (const [index, displacement] of a.warp.displacements) {
    const other = b.warp.displacements.get(index);
    if (!other || other.dx !== displacement.dx || other.dy !== displacement.dy) return false;
  }

  return true;
}
