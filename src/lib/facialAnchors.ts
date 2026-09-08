// Ancoragem anatômica da deformação facial (PR-4, calibração do nível 1).
//
// Pele facial não é uma folha uniforme: está fixada ao esqueleto e aos ligamentos de
// retenção. Sem isso, puxar a bochecha arrasta a margem palpebral e o contorno mandibular
// junto — suave ao olho, mas anatomicamente impossível.
//
// As regiões vêm dos agrupamentos oficiais do MediaPipe, não de índices escolhidos por
// nós: `FACE_LANDMARKS_FACE_OVAL`, `_LEFT_EYE`, `_RIGHT_EYE`, `_LIPS`, `_EYEBROW`.
//
// A ancoragem usa o mesmo parâmetro de rigidez previsto para o nível 2 (tecido
// cicatricial resistindo mais que pele saudável). Aqui ele é validado com um caso de
// anatomia conhecida, antes de sustentar o caso clínico.

import { FaceLandmarker } from '@mediapipe/tasks-vision';

export type AnchorRegion = 'face_oval' | 'eyes' | 'eyebrows' | 'lips';

export const ANCHOR_REGION_LABELS: Record<AnchorRegion, string> = {
  face_oval: 'Contorno facial',
  eyes: 'Olhos',
  eyebrows: 'Sobrancelhas',
  lips: 'Boca',
};

export const ANCHOR_REGION_HINTS: Record<AnchorRegion, string> = {
  face_oval: 'Impede que a manobra arraste o contorno mandibular e a linha de implantação.',
  eyes: 'Preserva a margem palpebral, que não acompanha um deslocamento local de pele.',
  eyebrows: 'Mantém a posição do supercílio durante manobras na fronte.',
  lips: 'Fixa o vermelhão. Desative para planejar retalhos periorais.',
};

/**
 * Padrão: contorno e olhos fixos, boca livre.
 *
 * A escolha depende do procedimento — num retalho perioral a boca precisa se mover —
 * por isso é configurável na interface em vez de fixa aqui.
 */
export const DEFAULT_ANCHOR_REGIONS: AnchorRegion[] = ['face_oval', 'eyes'];

/**
 * Resistência de um landmark ancorado.
 *
 * Não é imobilidade absoluta: tecido ancorado ainda cede um pouco, e travar por completo
 * produziria dobras abruptas na borda da região. Este valor deixa a região responder a
 * cerca de 8% do deslocamento aplicado ao redor.
 */
const ANCHOR_STIFFNESS = 12;

type Connection = { start: number; end: number };

function indicesFromConnections(connections: readonly Connection[]): number[] {
  const indices = new Set<number>();
  for (const { start, end } of connections) {
    indices.add(start);
    indices.add(end);
  }
  return [...indices];
}

// Os agrupamentos do MediaPipe só existem depois que o módulo carrega; resolvemos sob
// demanda e memoizamos, para não pagar o custo a cada quadro do arraste.
let cachedRegions: Record<AnchorRegion, number[]> | null = null;

function getRegionIndices(): Record<AnchorRegion, number[]> {
  if (!cachedRegions) {
    cachedRegions = {
      face_oval: indicesFromConnections(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL),
      eyes: [
        ...indicesFromConnections(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE),
        ...indicesFromConnections(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE),
      ],
      eyebrows: [
        ...indicesFromConnections(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW),
        ...indicesFromConnections(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW),
      ],
      lips: indicesFromConnections(FaceLandmarker.FACE_LANDMARKS_LIPS),
    };
  }
  return cachedRegions;
}

/** Quantidade de landmarks que uma região ancora, para exibir na interface. */
export function countAnchoredLandmarks(regions: AnchorRegion[]): number {
  const byRegion = getRegionIndices();
  const anchored = new Set<number>();
  for (const region of regions) {
    for (const index of byRegion[region]) anchored.add(index);
  }
  return anchored.size;
}

/**
 * Monta a função de rigidez consumida por `computePull`.
 *
 * Sem regiões ativas devolve `undefined`, e a deformação volta a ser uniforme — o
 * comportamento anterior à ancoragem, preservado para comparação.
 */
export function buildAnchorStiffness(
  regions: AnchorRegion[],
): ((pointIndex: number) => number) | undefined {
  if (regions.length === 0) return undefined;

  const byRegion = getRegionIndices();
  const anchored = new Set<number>();
  for (const region of regions) {
    for (const index of byRegion[region]) anchored.add(index);
  }

  return (pointIndex: number) => (anchored.has(pointIndex) ? ANCHOR_STIFFNESS : 1);
}
