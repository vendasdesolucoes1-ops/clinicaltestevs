// Distância pela superfície da pele, para a deformação facial.
//
// A deformação media distância em linha reta na imagem. O problema é que a linha reta
// entre o lábio superior e o inferior atravessa a ABERTURA DA BOCA — que não é pele.
// O resultado era puxar o lábio superior e ver o inferior acompanhar.
//
// Medido nos landmarks de uma foto real, com o raio padrão da ferramenta em 0,080:
//
//   lábio sup. interno -> lábio inf. interno   reta 0,017   pela pele 0,117   6,9x
//   vermelhão sup.     -> vermelhão inf.       reta 0,037   pela pele 0,127   3,4x
//   vermelhão sup.     -> comissura            reta 0,061   pela pele 0,062   1,0x
//   vermelhão sup.     -> ponta do nariz       reta 0,034   pela pele 0,034   1,0x
//
// Onde a pele é contínua a distância é a mesma e nada muda; a diferença aparece só onde
// existe uma abertura anatômica separando os tecidos. É o comportamento que se quer: a
// manobra propaga pelo tecido, não pelo ar.
//
// O caminho é medido sobre as arestas da malha do MediaPipe, cujos contornos são os do
// rosto — boca e olhos são buracos de verdade na superfície, então o caminho é obrigado
// a contorná-los.

import { getFaceTessellation } from '@/types/mediapipeTessellation';
import type { MediaPipePoint } from '@/types/mediapipeMesh';

type Neighbors = Map<number, { index: number; weight: number }[]>;

interface SurfaceCache {
  neighbors: Neighbors;
  /** Distâncias já calculadas, por ponto de origem. Um arraste reusa a mesma origem. */
  bySource: Map<number, Map<number, number>>;
  /** O mesmo, para origens múltiplas (regiões ósseas), chaveado pelo conjunto. */
  bySet: Map<string, Map<number, number>>;
}

// Chaveado pelo próprio array de landmarks: cada foto analisada tem o seu, e ele não muda
// depois de detectado (os deslocamentos vivem à parte).
const cacheByLandmarks = new WeakMap<MediaPipePoint[], SurfaceCache>();

function buildNeighbors(landmarks: MediaPipePoint[]): Neighbors {
  const neighbors: Neighbors = new Map();

  const connect = (a: number, b: number) => {
    const from = landmarks[a];
    const to = landmarks[b];
    if (!from || !to) return;

    let list = neighbors.get(a);
    if (!list) neighbors.set(a, (list = []));
    if (list.some(entry => entry.index === b)) return;

    // O peso é a distância real entre os dois pontos, então o caminho acumula
    // comprimento de pele percorrida, não número de arestas.
    list.push({ index: b, weight: Math.hypot(from.x - to.x, from.y - to.y) });
  };

  for (const [a, b, c] of getFaceTessellation()) {
    connect(a, b); connect(b, a);
    connect(b, c); connect(c, b);
    connect(a, c); connect(c, a);
  }

  return neighbors;
}

function getCache(landmarks: MediaPipePoint[]): SurfaceCache {
  let cache = cacheByLandmarks.get(landmarks);
  if (!cache) {
    cache = { neighbors: buildNeighbors(landmarks), bySource: new Map(), bySet: new Map() };
    cacheByLandmarks.set(landmarks, cache);
  }
  return cache;
}

/** Fila de prioridade mínima sobre um heap binário. */
class MinHeap {
  private items: { index: number; distance: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(index: number, distance: number): void {
    this.items.push({ index, distance });
    let child = this.items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.items[parent].distance <= this.items[child].distance) break;
      [this.items[parent], this.items[child]] = [this.items[child], this.items[parent]];
      child = parent;
    }
  }

  pop(): { index: number; distance: number } | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < this.items.length && this.items[left].distance < this.items[smallest].distance) smallest = left;
        if (right < this.items.length && this.items[right].distance < this.items[smallest].distance) smallest = right;
        if (smallest === parent) break;
        [this.items[parent], this.items[smallest]] = [this.items[smallest], this.items[parent]];
        parent = smallest;
      }
    }
    return top;
  }
}

/**
 * Distâncias, medidas sobre a pele, do ponto de origem a todos os que ele alcança.
 *
 * Devolve `null` quando a origem não faz parte da superfície — é o caso dos pontos de
 * íris (468 em diante), que a tesselação não cobre. O chamador decide o que fazer.
 */
export function geodesicDistancesFrom(
  landmarks: MediaPipePoint[],
  sourceIndex: number,
): Map<number, number> | null {
  const cache = getCache(landmarks);

  const known = cache.bySource.get(sourceIndex);
  if (known) return known;

  if (!cache.neighbors.has(sourceIndex)) return null;

  const distances = new Map<number, number>([[sourceIndex, 0]]);
  const settled = new Set<number>();
  const queue = new MinHeap();
  queue.push(sourceIndex, 0);

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current || settled.has(current.index)) continue;
    settled.add(current.index);

    for (const { index, weight } of cache.neighbors.get(current.index) ?? []) {
      const candidate = current.distance + weight;
      if (candidate < (distances.get(index) ?? Infinity)) {
        distances.set(index, candidate);
        queue.push(index, candidate);
      }
    }
  }

  cache.bySource.set(sourceIndex, distances);
  return distances;
}

/**
 * Distâncias, medidas sobre a pele, de um CONJUNTO de pontos a todos os que ele alcança.
 *
 * É o mesmo Dijkstra acima com a fila semeada por todas as origens a distância zero, o
 * que devolve, para cada ponto, a distância até a ORIGEM MAIS PRÓXIMA do conjunto — ou
 * seja, a distância até a borda da região.
 *
 * É o que uma manobra óssea precisa: os pontos da região ficam todos a zero e se movem em
 * bloco, e a atenuação só começa fora dela. Medir a partir de um ponto central, como faz
 * a ferramenta de pele, deformaria o próprio bloco.
 *
 * Devolve `null` se nenhuma das origens pertence à superfície tesselada.
 */
export function geodesicDistancesFromSet(
  landmarks: MediaPipePoint[],
  sourceIndices: readonly number[],
): Map<number, number> | null {
  const cache = getCache(landmarks);

  const sources = sourceIndices.filter(index => cache.neighbors.has(index));
  if (sources.length === 0) return null;

  // As regiões são fixas e poucas; a chave ordenada basta para reusar entre quadros.
  const key = [...sources].sort((a, b) => a - b).join(',');
  const known = cache.bySet.get(key);
  if (known) return known;

  const distances = new Map<number, number>();
  const settled = new Set<number>();
  const queue = new MinHeap();

  for (const index of sources) {
    distances.set(index, 0);
    queue.push(index, 0);
  }

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current || settled.has(current.index)) continue;
    settled.add(current.index);

    for (const { index, weight } of cache.neighbors.get(current.index) ?? []) {
      const candidate = current.distance + weight;
      if (candidate < (distances.get(index) ?? Infinity)) {
        distances.set(index, candidate);
        queue.push(index, candidate);
      }
    }
  }

  cache.bySet.set(key, distances);
  return distances;
}
