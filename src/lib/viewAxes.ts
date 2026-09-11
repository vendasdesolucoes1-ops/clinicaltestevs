// Tradução entre o que o cirurgião QUER (anatomia) e o que a foto MOSTRA (câmera).
//
// A malha do MediaPipe é sempre relativa à câmera: x e y são a imagem, z é a profundidade
// vista dali. Numa foto de frente a profundidade é o eixo ântero-posterior do rosto; numa
// foto de perfil o rosto girou, e a mesma profundidade da imagem passa a ser o eixo
// LATERAL da anatomia. Sem essa tradução, "avançar o mento" significaria coisas
// diferentes em cada foto do mesmo caso.
//
// A consequência prática, que é o ponto todo:
//
//   avanço de mento na FOTO DE FRENTE  -> deslocamento puro em profundidade
//                                          (invisível no 2D, visível na malha 3D)
//   avanço de mento na FOTO DE PERFIL  -> deslocamento horizontal na imagem
//                                          (plenamente visível no 2D)
//
// Não ver o avanço na frontal não é defeito: é o que uma foto de frente faz com um
// movimento que aponta para dentro da tela.

import type { MediaPipePoint } from '@/types/mediapipeMesh';

/** Deslocamento no referencial da ANATOMIA, que é como a manobra é pensada. */
export interface AnatomicalShift {
  /** Para a frente do rosto (avanço). Negativo recua. */
  advance: number;
  /** Para o lado, no plano frontal. */
  lateral: number;
  /** Para baixo na imagem. */
  vertical: number;
}

/** Deslocamento no referencial da CÂMERA, que é o que a foto e a malha consomem. */
export interface CameraShift {
  dx: number;
  dy: number;
  /** Profundidade na convenção do MediaPipe: mais negativo é mais perto da câmera. */
  dz: number;
}

export interface ViewGeometry {
  /** Rotação da cabeça em relação à câmera, em radianos. 0 de frente, π/2 de perfil. */
  yaw: number;
  /** +1 se o rosto aponta para a direita da imagem, -1 para a esquerda. */
  facing: 1 | -1;
}

// Índice do ápice nasal e dos dois extremos laterais do contorno facial. São topológicos:
// valem para qualquer rosto detectado.
const NOSE_TIP = 1;
const OVAL_LEFT = 234;
const OVAL_RIGHT = 454;

/**
 * Rotação declarada pelo ângulo da foto.
 *
 * LIMITE CONHECIDO: vem do rótulo escolhido no cadastro, não da imagem. Uma foto de
 * perfil salva no campo "frente" é tratada como frontal, e o avanço deixa de aparecer.
 * Estimar o yaw a partir dos próprios landmarks — e avisar quando discordar do rótulo —
 * é trabalho da etapa 2.
 */
function yawFromPhotoAngle(photoAngle: string | undefined): number {
  switch (photoAngle) {
    case 'perfil_d':
    case 'perfil_e':
      return Math.PI / 2;
    case 'tres_quartos':
      return Math.PI / 4;
    default:
      return 0;
  }
}

/**
 * Para que lado o rosto aponta, lido dos landmarks.
 *
 * Deliberadamente NÃO deduzido do rótulo: "perfil direito" pode sair com o nariz para
 * qualquer lado dependendo de como a foto foi tirada, e errar o sinal transformaria um
 * avanço em recuo. O ápice nasal contra o centro do contorno facial resolve isso sem
 * depender de convenção nenhuma.
 */
function facingFromLandmarks(landmarks: MediaPipePoint[]): 1 | -1 {
  const nose = landmarks[NOSE_TIP];
  const left = landmarks[OVAL_LEFT];
  const right = landmarks[OVAL_RIGHT];
  if (!nose || !left || !right) return 1;

  return nose.x >= (left.x + right.x) / 2 ? 1 : -1;
}

export function resolveViewGeometry(
  landmarks: MediaPipePoint[],
  photoAngle: string | undefined,
): ViewGeometry {
  return { yaw: yawFromPhotoAngle(photoAngle), facing: facingFromLandmarks(landmarks) };
}

/**
 * Anatomia -> câmera.
 *
 * Girar a cabeça de `yaw` em torno do eixo vertical leva o eixo anterior a
 * `(facing·sen yaw, 0, −cos yaw)` e o lateral a `(cos yaw, 0, facing·sen yaw)`, na
 * convenção de z do MediaPipe (frente = z menor). O vertical não participa da rotação.
 */
export function anatomicalToCamera(
  { advance, lateral, vertical }: AnatomicalShift,
  { yaw, facing }: ViewGeometry,
): CameraShift {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);

  return {
    dx: advance * facing * sin + lateral * cos,
    dy: vertical,
    dz: -advance * cos + lateral * facing * sin,
  };
}

/**
 * Câmera -> anatomia, para um arraste sobre a foto.
 *
 * O arraste é sempre paralelo à tela, então não carrega profundidade: é a decomposição
 * inversa da acima com dz = 0. De frente um arraste horizontal é lateral puro; de perfil
 * é avanço puro; em 3/4 é os dois.
 */
export function dragToAnatomical(
  dx: number,
  dy: number,
  { yaw, facing }: ViewGeometry,
): AnatomicalShift {
  return {
    advance: dx * facing * Math.sin(yaw),
    lateral: dx * Math.cos(yaw),
    vertical: dy,
  };
}

/**
 * Quanto de um avanço aparece na imagem, de 0 (nada, foto de frente) a 1 (tudo, perfil).
 *
 * Serve para avisar na interface antes que o cirurgião conclua que a ferramenta quebrou.
 */
export function advanceVisibility({ yaw }: ViewGeometry): number {
  return Math.abs(Math.sin(yaw));
}
