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
import { DEFAULT_DRAPE } from '@/lib/facialSkeleton';

/** Sobe quando o formato mudar de forma incompatível. */
export const VERSION_STATE_SCHEMA = 1;

export interface VersionWarpState {
  displacements: DisplacementMap;
  radius: number;
  intensity: number;
  anchorRegions: AnchorRegion[];
  /** Transição da manobra óssea. Ver `DEFAULT_DRAPE` em `facialSkeleton.ts`. */
  drape: number;
}

/**
 * Quadro de referência em que as marcações foram desenhadas.
 *
 * O canvas do Fabric tem o tamanho do CONTÊINER, então a mesma coordenada cai em pontos
 * diferentes do rosto conforme o tamanho da janela. Guardar a coordenada crua faria as
 * marcações reaparecerem fora de lugar numa tela de outro tamanho — pior que perdê-las,
 * porque parece certo e não é. Com o quadro salvo, a leitura reposiciona pela razão entre
 * ele e o quadro atual.
 */
export interface VersionFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface VersionState {
  warp: VersionWarpState | null;
  /** Objetos de anotação, como o Fabric os serializa. */
  markings: unknown[];
  frame: VersionFrame | null;
}

const ANCHOR_REGIONS: AnchorRegion[] = ['face_oval', 'eyes', 'eyebrows', 'lips'];

/**
 * JSON não transporta `Map`: os deslocamentos viajam como lista de pares.
 *
 * `dz` só existe quando a manobra óssea o produziu. Gravá-lo como `undefined` o faria
 * sumir do JSON de qualquer forma; omitir é explícito e mantém pequenas as versões que só
 * têm deformação de pele.
 */
type SerializedDisplacement = [number, { dx: number; dy: number; dz?: number }];

interface SerializedState {
  schema: number;
  warp?: {
    displacements: SerializedDisplacement[];
    radius: number;
    intensity: number;
    anchorRegions: AnchorRegion[];
    /** Ausente nas versões gravadas antes da ferramenta de osso; a leitura repõe o padrão. */
    drape?: number;
  };
  /**
   * Campo acrescentado depois, mantendo `schema: 1` de propósito: acrescentar campo
   * opcional é mudança compatível. Subir o schema invalidaria as versões já gravadas —
   * o leitor abaixo descarta schema desconhecido —, e elas perderiam a deformação.
   */
  markings?: unknown[];
  frame?: VersionFrame;
}

export function serializeVersionState(state: VersionState): SerializedState {
  return {
    schema: VERSION_STATE_SCHEMA,
    markings: state.markings.length > 0 ? state.markings : undefined,
    frame: state.markings.length > 0 && state.frame ? state.frame : undefined,
    warp: state.warp
      ? {
          displacements: [...state.warp.displacements.entries()].map(
            ([index, { dx, dy, dz }]) => [index, dz ? { dx, dy, dz } : { dx, dy }],
          ),
          radius: state.warp.radius,
          intensity: state.warp.intensity,
          anchorRegions: state.warp.anchorRegions,
          drape: state.warp.drape,
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

    const { dx, dy, dz } = (displacement ?? {}) as {
      dx?: unknown;
      dy?: unknown;
      dz?: unknown;
    };
    if (!isFiniteNumber(dx) || !isFiniteNumber(dy)) continue;

    // Versão gravada antes da ferramenta de osso não tem `dz`, e isso é válido: significa
    // deformação sem componente de profundidade.
    map.set(index, isFiniteNumber(dz) ? { dx, dy, dz } : { dx, dy });
  }
  return map;
}

function parseFrame(raw: unknown): VersionFrame | null {
  if (!raw || typeof raw !== 'object') return null;
  const { left, top, width, height } = raw as Record<string, unknown>;
  if (!isFiniteNumber(left) || !isFiniteNumber(top)) return null;
  // Largura ou altura zero tornaria a razão de reposicionamento indefinida.
  if (!isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

function parseWarp(raw: SerializedState['warp']): VersionWarpState | null {
  if (!raw || typeof raw !== 'object') return null;

  const displacements = parseDisplacements(raw.displacements);
  if (displacements.size === 0) return null;

  const anchorRegions = Array.isArray(raw.anchorRegions)
    ? raw.anchorRegions.filter((region): region is AnchorRegion => ANCHOR_REGIONS.includes(region))
    : [];

  return {
    displacements,
    radius: isFiniteNumber(raw.radius) && raw.radius > 0 ? raw.radius : 0.08,
    intensity: isFiniteNumber(raw.intensity) && raw.intensity > 0 ? raw.intensity : 100,
    anchorRegions,
    drape: isFiniteNumber(raw.drape) && raw.drape > 0 ? raw.drape : DEFAULT_DRAPE,
  };
}

/** Lê o `canvas_state` gravado. Nunca lança: o que não for reconhecido é descartado. */
export function parseVersionState(raw: unknown): VersionState {
  const empty: VersionState = { warp: null, markings: [], frame: null };
  if (!raw || typeof raw !== 'object') return empty;

  const state = raw as Partial<SerializedState>;
  // Um schema mais novo pode ter significados diferentes para os mesmos campos; abrir o
  // caso sem o conteúdo é melhor que reconstruí-lo errado.
  if (state.schema !== VERSION_STATE_SCHEMA) return empty;

  const frame = parseFrame(state.frame);
  // Sem o quadro de referência não há como reposicionar: desenhar as marcações em
  // coordenadas de outra tela as colocaria sobre a parte errada do rosto.
  const markings = frame && Array.isArray(state.markings)
    ? state.markings.filter(entry => !!entry && typeof entry === 'object')
    : [];

  return { warp: parseWarp(state.warp), markings, frame: markings.length > 0 ? frame : null };
}

/**
 * As duas deformações descrevem a mesma coisa?
 *
 * Usado para saber se há trabalho não salvo, o que é verificado a cada quadro do arraste.
 * Serializar para comparar custaria dezenas de kilobytes de string por quadro; aqui a
 * comparação é numérica e não aloca. Precisa ser exata: um falso "sem alterações" faria a
 * troca de versão descartar a deformação sem perguntar.
 *
 * As marcações ficam de fora por o mesmo motivo de custo — serializá-las por quadro seria
 * ainda mais caro. Alteração nelas é detectada pelos eventos do canvas, que é informação
 * que o Fabric já emite.
 */
export function warpStatesEqual(a: VersionState, b: VersionState): boolean {
  if (!a.warp || !b.warp) return !a.warp && !b.warp;

  if (
    a.warp.radius !== b.warp.radius ||
    a.warp.intensity !== b.warp.intensity ||
    a.warp.drape !== b.warp.drape ||
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
    if ((other.dz ?? 0) !== (displacement.dz ?? 0)) return false;
  }

  return true;
}
