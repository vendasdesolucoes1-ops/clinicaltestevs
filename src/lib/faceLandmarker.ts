// Detecção de landmarks faciais rodando no próprio navegador, via MediaPipe Face Landmarker.
//
// Substitui o pipeline externo em n8n: não há webhook, fila, polling nem servidor
// intermediário — o modelo roda no cliente e devolve os 478 landmarks em milissegundos.
// O WASM e o modelo são servidos pela própria aplicação (public/mediapipe), então não há
// dependência de terceiros em runtime.

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import type { MediaPipeMeshData, MediaPipePoint } from '@/types/mediapipeMesh';

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/face_landmarker.task';

// O carregamento do modelo custa alguns segundos e vale para toda a sessão: mantemos uma
// única instância e reaproveitamos entre análises.
let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
      });
    })().catch(error => {
      // Sem isto uma falha de carregamento ficaria memoizada e toda tentativa seguinte
      // falharia sem nem tentar de novo.
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

/** Carrega a imagem respeitando CORS, para que o canvas do MediaPipe possa lê-la. */
function loadImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem para análise.'));
    image.src = imageUrl;
  });
}

export class NoFaceDetectedError extends Error {
  constructor() {
    super('Nenhum rosto detectado na imagem.');
    this.name = 'NoFaceDetectedError';
  }
}

/**
 * Detecta os landmarks faciais de uma imagem e devolve no formato que o app já usa.
 * Lança `NoFaceDetectedError` quando não há rosto reconhecível.
 */
export async function detectFaceLandmarks(imageUrl: string): Promise<MediaPipeMeshData> {
  const [landmarker, image] = await Promise.all([getLandmarker(), loadImage(imageUrl)]);

  const result = landmarker.detect(image);
  const face = result.faceLandmarks?.[0];

  if (!face || face.length === 0) {
    throw new NoFaceDetectedError();
  }

  // O MediaPipe já entrega coordenadas normalizadas (0-1), que é o que o renderizador
  // do workbench espera. O índice do ponto é o próprio id usado pelas conexões.
  const points: MediaPipePoint[] = face.map((landmark, index) => ({
    id: index,
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
  }));

  return {
    points,
    connections: FaceLandmarker.FACE_LANDMARKS_TESSELATION.map(
      ({ start, end }) => [start, end] as [number, number],
    ),
  };
}
