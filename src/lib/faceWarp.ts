// Deformação geométrica da face por malha triangular (PR-4, nível 1).
//
// ATENÇÃO — ESCOPO: isto é deformação GEOMÉTRICA, não simulação física. Mostra como a
// imagem ficaria se a pele se movesse de determinada forma; não prediz o resultado de uma
// intervenção. Não há rigidez de tecido, tensão de sutura nem comportamento de cicatriz.
// A predição biomecânica é o nível 2 (massa-mola com rigidez diferenciada por tecido).
//
// Técnica: afim por triângulo (piecewise affine warp). Cada um dos 870 triângulos da
// tesselação do MediaPipe é redesenhado da posição original para a deslocada, com recorte.
// Fora da região facial a imagem permanece intacta.

import { geodesicDistancesFrom } from '@/lib/faceGeodesic';
import type { MediaPipePoint } from '@/types/mediapipeMesh';

/** Ponto em coordenadas de pixel dentro da imagem de origem. */
interface PixelPoint {
  x: number;
  y: number;
}

/** Deslocamento em coordenadas normalizadas (mesma escala dos landmarks). */
export interface Displacement {
  dx: number;
  dy: number;
  /**
   * Profundidade, na convenção do MediaPipe (mais negativo é mais perto da câmera).
   *
   * Opcional porque a ferramenta de pele não produz profundidade: um arraste sobre a foto
   * é paralelo à tela. Quem preenche é a manobra óssea, onde a projeção é justamente o
   * que muda. `warpFace` ignora este campo DE PROPÓSITO — uma foto não mostra o que se
   * move para dentro dela; o efeito aparece na malha 3D e, quando a foto é de perfil,
   * já vem convertido em dx por `viewAxes.ts`.
   */
  dz?: number;
}

export type DisplacementMap = Map<number, Displacement>;

/**
 * Aplica um triângulo de origem sobre um de destino usando transformação afim.
 *
 * A matriz é derivada da correspondência entre os três vértices. O recorte garante que
 * cada triângulo pinte apenas a própria área — sem ele, a transformação vazaria sobre os
 * vizinhos e o rosto viraria um borrão.
 */
function drawWarpedTriangle(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  source: [PixelPoint, PixelPoint, PixelPoint],
  target: [PixelPoint, PixelPoint, PixelPoint],
): void {
  const [s0, s1, s2] = source;
  const [t0, t1, t2] = target;

  const denominator = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  // Triângulo degenerado (vértices colineares): não há transformação afim válida.
  if (Math.abs(denominator) < 1e-9) return;

  const a = ((t1.x - t0.x) * (s2.y - s0.y) - (t2.x - t0.x) * (s1.y - s0.y)) / denominator;
  const b = ((t2.x - t0.x) * (s1.x - s0.x) - (t1.x - t0.x) * (s2.x - s0.x)) / denominator;
  const c = ((t1.y - t0.y) * (s2.y - s0.y) - (t2.y - t0.y) * (s1.y - s0.y)) / denominator;
  const d = ((t2.y - t0.y) * (s1.x - s0.x) - (t1.y - t0.y) * (s2.x - s0.x)) / denominator;
  const e = t0.x - a * s0.x - b * s0.y;
  const f = t0.y - c * s0.x - d * s0.y;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(t0.x, t0.y);
  ctx.lineTo(t1.x, t1.y);
  ctx.lineTo(t2.x, t2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, c, b, d, e, f);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

/**
 * Expande levemente cada triângulo a partir do seu centro.
 *
 * Triângulos adjacentes recortados na borda exata deixam costuras de subpixel entre si,
 * que aparecem como uma teia de linhas claras sobre o rosto. A sobreposição mínima cobre
 * essas junções sem deslocar o conteúdo de forma perceptível.
 */
function expandTriangle(
  triangle: [PixelPoint, PixelPoint, PixelPoint],
  amount: number,
): [PixelPoint, PixelPoint, PixelPoint] {
  const cx = (triangle[0].x + triangle[1].x + triangle[2].x) / 3;
  const cy = (triangle[0].y + triangle[1].y + triangle[2].y) / 3;

  return triangle.map(vertex => {
    const dx = vertex.x - cx;
    const dy = vertex.y - cy;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: vertex.x + (dx / length) * amount,
      y: vertex.y + (dy / length) * amount,
    };
  }) as [PixelPoint, PixelPoint, PixelPoint];
}

export interface WarpFaceOptions {
  /** Imagem de origem, já carregada. */
  image: HTMLImageElement | HTMLCanvasElement;
  /** Landmarks detectados, em coordenadas normalizadas (0-1). */
  landmarks: MediaPipePoint[];
  /** Deslocamentos por índice de landmark, em coordenadas normalizadas. */
  displacements: DisplacementMap;
  /** Triângulos da tesselação, por índice de landmark. */
  triangles: [number, number, number][];
  /** Canvas reaproveitado entre quadros, para não realocar durante o arraste. */
  target?: HTMLCanvasElement;
}

/**
 * Devolve um canvas com a face deformada composta sobre a imagem original.
 *
 * Sem deslocamentos, o resultado é pixel a pixel igual à entrada — o que torna a
 * ferramenta segura de ativar sem alterar nada.
 */
export function warpFace({
  image,
  landmarks,
  displacements,
  triangles,
  target,
}: WarpFaceOptions): HTMLCanvasElement {
  const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;

  const canvas = target ?? document.createElement('canvas');
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, width, height);
  // A imagem original é o fundo: tudo fora da malha facial permanece intocado.
  ctx.drawImage(image, 0, 0, width, height);

  if (displacements.size === 0) return canvas;

  const sourcePixels: PixelPoint[] = landmarks.map(point => ({
    x: point.x * width,
    y: point.y * height,
  }));

  const targetPixels: PixelPoint[] = landmarks.map((point, index) => {
    const displacement = displacements.get(index);
    return {
      x: (point.x + (displacement?.dx ?? 0)) * width,
      y: (point.y + (displacement?.dy ?? 0)) * height,
    };
  });

  const seamOverlap = Math.max(width, height) * 0.0015;

  for (const [i0, i1, i2] of triangles) {
    if (i0 >= landmarks.length || i1 >= landmarks.length || i2 >= landmarks.length) continue;

    drawWarpedTriangle(
      ctx,
      image,
      [sourcePixels[i0], sourcePixels[i1], sourcePixels[i2]],
      expandTriangle([targetPixels[i0], targetPixels[i1], targetPixels[i2]], seamOverlap),
    );
  }

  return canvas;
}

export interface PullOptions {
  /** Índice do landmark arrastado. */
  pointIndex: number;
  /** Deslocamento do ponto arrastado, em coordenadas normalizadas. */
  dx: number;
  dy: number;
  /** Raio de influência em coordenadas normalizadas (0-1). */
  radius: number;
  /**
   * Rigidez por landmark (1 = pele saudável). Valores maiores resistem mais ao
   * deslocamento. Ponto de entrada para o nível 2, onde tecido cicatricial ou queimado
   * recebe rigidez maior que a pele ao redor; hoje todos valem 1.
   */
  stiffness?: (pointIndex: number) => number;
}

/**
 * Calcula os deslocamentos resultantes de puxar um ponto, propagando aos vizinhos com
 * atenuação suave por distância.
 *
 * É a atenuação que produz a sensação de puxar tecido em vez de mover um vértice isolado.
 *
 * A distância é medida ANDANDO PELA PELE, não em linha reta: ver `faceGeodesic.ts`. Em
 * tecido contínuo as duas coincidem, mas a linha reta atravessa as aberturas da face, e
 * era isso que fazia o lábio inferior acompanhar uma manobra no superior.
 */
export function computePull(
  landmarks: MediaPipePoint[],
  current: DisplacementMap,
  { pointIndex, dx, dy, radius, stiffness }: PullOptions,
): DisplacementMap {
  const anchor = landmarks[pointIndex];
  if (!anchor) return current;

  // Pontos de íris não fazem parte da superfície tesselada e não têm caminho pela pele.
  // Nesse caso a distância volta a ser a euclidiana, preservando o comportamento antigo
  // em vez de deixar a ferramenta inerte ali.
  const surfaceDistances = geodesicDistancesFrom(landmarks, pointIndex);

  const next: DisplacementMap = new Map(current);

  landmarks.forEach((point, index) => {
    const distance = surfaceDistances
      ? surfaceDistances.get(index)
      : Math.hypot(point.x - anchor.x, point.y - anchor.y);

    // Sem caminho pela pele até aqui (do outro lado de uma abertura, ou fora da malha):
    // a manobra não alcança este ponto.
    if (distance === undefined || distance > radius) return;

    // Atenuação suave (cosseno elevado): 1 no ponto arrastado, 0 na borda do raio,
    // sem transição abrupta que produziria dobras visíveis na pele.
    const falloff = (Math.cos((distance / radius) * Math.PI) + 1) / 2;
    const resistance = stiffness?.(index) ?? 1;
    const weight = falloff / Math.max(resistance, 0.01);

    const previous = next.get(index) ?? { dx: 0, dy: 0 };
    next.set(index, {
      dx: previous.dx + dx * weight,
      dy: previous.dy + dy * weight,
    });
  });

  return next;
}
