// Deslocamento de um bloco ósseo, com o tecido mole drapejando por cima.
//
// ATENÇÃO — ESCOPO: como em `faceWarp.ts`, isto é geometria, não predição cirúrgica. Não
// há osteotomia, fixação, reabsorção nem comportamento de tecido mole ao longo do tempo.
// Mostra como a superfície ficaria se o suporte ósseo se deslocasse desse jeito.
//
// A DIFERENÇA PARA PUXAR PELE, que é o que justifica um motor separado:
//
//   puxar pele  um ponto se move, os vizinhos cedem em proporção decrescente
//   osso        uma REGIÃO INTEIRA se move junta, rígida, e só fora dela há atenuação
//
// Daí a distância ser medida a partir do CONJUNTO da região (ver
// `geodesicDistancesFromSet`) e não de um ponto central: todo landmark do bloco fica a
// distância zero, recebe peso 1 e acompanha o deslocamento integralmente. Medir de um
// centro deformaria o próprio bloco, que é exatamente o que osso não faz.

import { geodesicDistancesFromSet } from '@/lib/faceGeodesic';
import type { DisplacementMap } from '@/lib/faceWarp';
import type { CameraShift } from '@/lib/viewAxes';
import type { MediaPipePoint } from '@/types/mediapipeMesh';

export interface BoneShiftOptions {
  /** Landmarks que formam o bloco. Todos se movem juntos. */
  regionIndices: readonly number[];
  /** Deslocamento do bloco, já convertido para o referencial da câmera. */
  shift: CameraShift;
  /** Largura da transição fora do bloco, em coordenadas normalizadas. */
  drape: number;
  /**
   * Quanto do deslocamento a pele reproduz, por landmark (1 = acompanha integralmente).
   * Mesmo papel do `stiffness` em `computePull`: é o ponto de entrada para espessura de
   * tecido mole variável, sem alterar o motor.
   */
  follow?: (pointIndex: number) => number;
}

/**
 * Acumula sobre os deslocamentos existentes o efeito de mover um bloco ósseo.
 *
 * Soma ao que já houver no mapa — uma manobra óssea sob uma pele já deformada compõe com
 * ela, que é o comportamento fisicamente correto.
 */
export function computeBoneShift(
  landmarks: MediaPipePoint[],
  current: DisplacementMap,
  { regionIndices, shift, drape, follow }: BoneShiftOptions,
): DisplacementMap {
  if (regionIndices.length === 0) return current;
  if (shift.dx === 0 && shift.dy === 0 && shift.dz === 0) return current;

  const distances = geodesicDistancesFromSet(landmarks, regionIndices);
  if (!distances) return current;

  const next: DisplacementMap = new Map(current);
  const transition = Math.max(drape, 1e-6);

  for (const [index, distance] of distances) {
    if (distance > transition) continue;

    // Mesma atenuação por cosseno da ferramenta de pele, mas medida a partir da BORDA do
    // bloco: dentro dele a distância é zero e o peso é 1, então a região anda inteira.
    const falloff = (Math.cos((distance / transition) * Math.PI) + 1) / 2;
    const weight = falloff * (follow?.(index) ?? 1);
    if (weight === 0) continue;

    const previous = next.get(index) ?? { dx: 0, dy: 0, dz: 0 };
    next.set(index, {
      dx: previous.dx + shift.dx * weight,
      dy: previous.dy + shift.dy * weight,
      dz: (previous.dz ?? 0) + shift.dz * weight,
    });
  }

  return next;
}
