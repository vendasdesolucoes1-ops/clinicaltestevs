// Tessellação da malha facial do MediaPipe.
//
// Derivada de `FaceLandmarker.FACE_LANDMARKS_TESSELATION` — a mesma lista de 2556
// conexões que o próprio detector publica — em vez de uma cópia escrita à mão. Uma
// cópia envelhece em silêncio: a lista anterior tinha 74,8% dos triângulos ligando
// pontos que não são vizinhos no rosto, além de 101 duplicados. O sintoma era um
// polígono gigante atravessando a face no 3D e a deformação do warp saindo com a
// topologia errada.
//
// A tessellação oficial é publicada como arestas, não como faces. Os triângulos são os
// ciclos de 3 do grafo, e a topologia resultante é verificável:
//
//   852 triângulos, 1234 arestas internas (2 triângulos cada) e 88 de borda (1 cada);
//   4 contornos abertos — 36 vértices no contorno facial, 20 na boca, 16 em cada olho;
//   característica de Euler 468 − 1322 + 852 = −2, que é exatamente 2 − 4 contornos.
//
// Ou seja: superfície manifold, sem buraco nem aresta solta, com os contornos que um
// rosto de fato tem.

import { FaceLandmarker } from '@mediapipe/tasks-vision';

export type FaceTriangle = [number, number, number];

/**
 * Dois ciclos de 3 do grafo não são faces da superfície: `[49,64,129]` e `[279,294,358]`,
 * simétricos, na asa do nariz. Reconhecemos os dois pela topologia, não por índice fixo —
 * são os únicos triângulos cujas TRÊS arestas aparecem em mais de dois triângulos, o que
 * só acontece quando o triângulo atravessa a superfície em vez de compor a malha.
 */
function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function triangleEdges([a, b, c]: FaceTriangle): [string, string, string] {
  return [edgeKey(a, b), edgeKey(b, c), edgeKey(a, c)];
}

function deriveTessellation(): FaceTriangle[] {
  const neighbors = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    let set = neighbors.get(a);
    if (!set) neighbors.set(a, (set = new Set()));
    set.add(b);
  };

  for (const { start, end } of FaceLandmarker.FACE_LANDMARKS_TESSELATION) {
    link(start, end);
    link(end, start);
  }

  // Ciclos de 3 com a < b < c, para que cada triângulo apareça uma única vez.
  const candidates: FaceTriangle[] = [];
  for (const [a, adjacentToA] of neighbors) {
    for (const b of adjacentToA) {
      if (b <= a) continue;
      for (const c of neighbors.get(b) ?? []) {
        if (c <= b) continue;
        if (adjacentToA.has(c)) candidates.push([a, b, c]);
      }
    }
  }

  const usage = new Map<string, number>();
  for (const triangle of candidates) {
    for (const edge of triangleEdges(triangle)) {
      usage.set(edge, (usage.get(edge) ?? 0) + 1);
    }
  }

  return candidates.filter(
    triangle => !triangleEdges(triangle).every(edge => (usage.get(edge) ?? 0) > 2),
  );
}

// Os agrupamentos do MediaPipe só existem depois que o módulo carrega, e a derivação
// custa alguns milissegundos: resolvemos sob demanda e memoizamos.
let cached: FaceTriangle[] | null = null;

/** Triângulos da superfície facial. A lista é compartilhada — não mutar. */
export function getFaceTessellation(): FaceTriangle[] {
  if (!cached) cached = deriveTessellation();
  return cached;
}
