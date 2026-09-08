// Detecção de landmarks faciais rodando no próprio navegador, via MediaPipe Face Landmarker.
//
// Substitui o pipeline externo em n8n: não há webhook, fila, polling nem servidor
// intermediário — o modelo roda no cliente e devolve os 478 landmarks em milissegundos.

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import type { MediaPipeMeshData, MediaPipePoint } from '@/types/mediapipeMesh';

// Preferência: artefatos servidos pela própria aplicação (copiados para public/mediapipe
// pelo prebuild). Se o build do host não executar esse passo, os arquivos não existem e
// a detecção falharia por completo — daí o fallback para as fontes oficiais.
const LOCAL_WASM_PATH = '/mediapipe/wasm';
const LOCAL_MODEL_PATH = '/mediapipe/face_landmarker.task';
const CDN_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm';
const CDN_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// O FilesetResolver busca este arquivo dentro do diretório de WASM: serve de sonda.
const WASM_PROBE_FILE = 'vision_wasm_internal.js';

export class NoFaceDetectedError extends Error {
  constructor() {
    super('Nenhum rosto detectado na imagem.');
    this.name = 'NoFaceDetectedError';
  }
}

export class LandmarkerUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'LandmarkerUnavailableError';
  }
}

/** O MediaPipe às vezes lança strings ou objetos do runtime WASM em vez de Error. */
function describeThrown(thrown: unknown): string {
  if (thrown instanceof Error) return thrown.message;
  if (typeof thrown === 'string') return thrown;
  try {
    return JSON.stringify(thrown);
  } catch {
    return String(thrown);
  }
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/** Decide entre artefatos locais e as fontes oficiais, preferindo os locais. */
async function resolveAssetSources(): Promise<{ wasmPath: string; modelPath: string; source: string }> {
  const [wasmLocal, modelLocal] = await Promise.all([
    isReachable(`${LOCAL_WASM_PATH}/${WASM_PROBE_FILE}`),
    isReachable(LOCAL_MODEL_PATH),
  ]);

  if (wasmLocal && modelLocal) {
    return { wasmPath: LOCAL_WASM_PATH, modelPath: LOCAL_MODEL_PATH, source: 'local' };
  }

  console.warn(
    '[MediaPipe] Artefatos locais indisponíveis ' +
      `(wasm: ${wasmLocal ? 'ok' : 'ausente'}, modelo: ${modelLocal ? 'ok' : 'ausente'}). ` +
      'Usando as fontes oficiais. Verifique se o build executou o passo "prebuild".',
  );

  return {
    wasmPath: wasmLocal ? LOCAL_WASM_PATH : CDN_WASM_PATH,
    modelPath: modelLocal ? LOCAL_MODEL_PATH : CDN_MODEL_PATH,
    source: 'remoto',
  };
}

// O carregamento custa alguns segundos e vale para toda a sessão: mantemos uma única
// instância e reaproveitamos entre análises.
let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function createLandmarker(): Promise<FaceLandmarker> {
  const { wasmPath, modelPath, source } = await resolveAssetSources();

  let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
  try {
    fileset = await FilesetResolver.forVisionTasks(wasmPath);
  } catch (thrown) {
    throw new LandmarkerUnavailableError(
      `Falha ao carregar o runtime do MediaPipe (${source}): ${describeThrown(thrown)}`,
      thrown,
    );
  }

  // O delegate de GPU exige WebGL2, que nem sempre está disponível (iframes restritos,
  // máquinas sem aceleração). A CPU é mais lenta, mas roda em qualquer lugar.
  for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelPath, delegate },
        runningMode: 'IMAGE',
        numFaces: 1,
      });
      console.info(`[MediaPipe] Detector pronto (artefatos: ${source}, delegate: ${delegate}).`);
      return landmarker;
    } catch (thrown) {
      const detail = describeThrown(thrown);
      if (delegate === 'GPU') {
        console.warn(`[MediaPipe] Delegate GPU indisponível (${detail}). Tentando CPU.`);
        continue;
      }
      throw new LandmarkerUnavailableError(
        `Falha ao inicializar o detector facial (${source}): ${detail}`,
        thrown,
      );
    }
  }

  throw new LandmarkerUnavailableError('Não foi possível inicializar o detector facial.');
}

function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker().catch(error => {
      // Sem isto uma falha ficaria memoizada e toda tentativa seguinte falharia sem
      // nem tentar de novo — inclusive depois de o problema ser corrigido.
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
    image.onerror = () =>
      reject(new Error('Não foi possível carregar a imagem para análise (verifique o acesso à foto).'));
    image.src = imageUrl;
  });
}

/**
 * Detecta os landmarks faciais de uma imagem e devolve no formato que o app já usa.
 * Lança `NoFaceDetectedError` quando não há rosto reconhecível e
 * `LandmarkerUnavailableError` quando o detector não pôde ser carregado.
 */
export async function detectFaceLandmarks(imageUrl: string): Promise<MediaPipeMeshData> {
  const [landmarker, image] = await Promise.all([getLandmarker(), loadImage(imageUrl)]);

  let result: ReturnType<FaceLandmarker['detect']>;
  try {
    result = landmarker.detect(image);
  } catch (thrown) {
    throw new LandmarkerUnavailableError(
      `Erro ao processar a imagem: ${describeThrown(thrown)}`,
      thrown,
    );
  }

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
