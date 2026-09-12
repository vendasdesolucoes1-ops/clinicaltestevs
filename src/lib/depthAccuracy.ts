// A profundidade que o sistema usa é DESTE paciente, ou um molde genérico?
//
// Toda a ferramenta óssea repousa sobre o `z` que o MediaPipe estima a partir de UMA
// foto. Já foi medido que esse `z` é repetível a cerca de 1 mm entre variações da mesma
// imagem (ver o comentário de `mesh3DData` em Workbench.tsx). Repetível não é correto: um
// molde genérico aplicado a todo rosto seria perfeitamente repetível e ainda assim errado
// para o caso.
//
// A única forma de separar as duas coisas é olhar a mesma pessoa de lado. Numa foto de
// perfil o eixo ântero-posterior do rosto DEITA no plano da imagem: a coordenada x de cada
// ponto passa a ser uma observação direta da profundidade, não uma estimativa.
//
// Esta medição confronta as duas e devolve dois números que querem dizer coisas
// diferentes:
//
//   ESCALA    quanto o relevo estimado precisa ser multiplicado para bater com o
//             observado. 1,00 é acerto. 0,70 significa que a projeção da face é 30%
//             maior do que o sistema pensa — erro sistemático, corrigível por um fator.
//
//   RESÍDUO   o que sobra DEPOIS de corrigir a escala. É o erro de FORMA: o perfil
//             estimado tem um contorno diferente do real. Um fator não conserta isso;
//             só a fusão das duas vistas conserta.
//
// A conta roda inteira no navegador do cirurgião. Nenhuma foto sai da máquina.

import type { MediaPipePoint } from '@/types/mediapipeMesh';

/**
 * Perfil sagital: os únicos landmarks cuja profundidade uma foto de perfil realmente
 * mostra.
 *
 * Fora da linha média, metade do rosto está oculta e o MediaPipe extrapola aqueles
 * pontos — compará-los mediria a extrapolação, não a anatomia. Da linha do cabelo, pela
 * fronte, dorso nasal, lábios e mento: é exatamente a silhueta que aparece de lado.
 */
const SAGITTAL_MIDLINE: readonly number[] = [
  10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 13, 14, 15, 16,
  17, 18, 200, 199, 175, 152,
];

// Extremos da referência vertical. A distância entre eles é IN-PLANE nas duas vistas —
// uma medida vertical não muda quando a cabeça gira em torno do eixo vertical —, então
// serve de régua comum para pôr as duas fotos na mesma escala.
const NASION = 168;
const MENTON = 152;
const SUBNASALE = 2;
const NOSE_TIP = 1;
const OVAL_LEFT = 234;
const OVAL_RIGHT = 454;

/**
 * Altura násio–mento de um adulto, em milímetros.
 *
 * Usada SÓ quando a foto não está calibrada, para que os números saiam numa unidade que
 * se possa julgar em vez de fração. É média populacional, não medida deste paciente: com
 * a foto calibrada, a calibração manda.
 */
const ASSUMED_NASION_MENTON_MM = 120;

/**
 * Espalhamento mínimo da linha média, em alturas násio–mento, para a foto ser aceita como
 * perfil. Medido: um perfil real fica perto de 0,24; uma foto de frente, de 0,01.
 */
const MINIMUM_PROFILE_SPREAD = 0.08;

export interface DepthAccuracyPoint {
  index: number;
  /** Profundidade que o sistema previu, em mm, com o ponto anterior positivo. */
  predictedMm: number;
  /** Profundidade observada no perfil, em mm. */
  observedMm: number;
}

export interface DepthAccuracyResult {
  /** Quantos pontos da linha média entraram na conta. */
  pointCount: number;
  /** Fator que leva o relevo estimado ao observado. 1 é acerto. */
  scale: number;
  /** Erro de forma que sobra depois de corrigir a escala, em mm. */
  residualMm: number;
  /** O mesmo resíduo como fração do relevo observado. */
  residualFraction: number;
  /** Amplitude da projeção observada no perfil, em mm. */
  observedReliefMm: number;
  /**
   * A foto do perfil não parece um perfil.
   *
   * De lado, a silhueta sagital se espalha bastante no eixo horizontal da imagem; de
   * frente ela colapsa numa linha. Sem esta checagem, uma foto frontal guardada no campo
   * de perfil produzia um laudo confiante e completamente errado — medido: escala 0,01x
   * e "a projeção real é 99% menor, funda as vistas". Errar o campo no cadastro é fácil,
   * e o rótulo da foto já é sabidamente frágil.
   */
  profileLooksFrontal: boolean;
  /** Os milímetros vieram da calibração da foto, ou de média populacional? */
  millimetresAreCalibrated: boolean;
  /**
   * As duas fotos discordam sobre as proporções verticais do rosto, o que quase sempre
   * significa inclinação de cabeça diferente entre elas. A medição continua válida em
   * ordem de grandeza, mas perde precisão.
   */
  verticalMismatch: number;
  points: DepthAccuracyPoint[];
}

export interface DepthAccuracyInput {
  /** Landmarks da foto frontal, de onde vem o `z` estimado. */
  frontal: MediaPipePoint[];
  /** Landmarks da foto de perfil, de onde vem a profundidade observada. */
  profile: MediaPipePoint[];
  /** Pixels por milímetro da foto frontal, quando ela estiver calibrada. */
  pixelsPerMm?: number | null;
  /**
   * ALTURA da foto frontal em pixels de canvas, necessária para usar a calibração.
   * Altura, não largura: a régua desta medição é a distância vertical násio–mento, e
   * coordenada y normalizada é fração da altura.
   */
  frontalHeightPx?: number | null;
}

function verticalSpan(points: MediaPipePoint[], a: number, b: number): number {
  const from = points[a];
  const to = points[b];
  if (!from || !to) return 0;
  return Math.abs(from.y - to.y);
}

/**
 * Para que lado o rosto aponta na foto de perfil, lido dos próprios landmarks.
 *
 * Não se deduz do rótulo: "perfil direito" sai com o nariz para qualquer lado conforme
 * como a foto foi tirada, e errar o sinal trocaria projeção por retrusão.
 */
function facingSign(points: MediaPipePoint[]): 1 | -1 {
  const nose = points[NOSE_TIP];
  const left = points[OVAL_LEFT];
  const right = points[OVAL_RIGHT];
  if (!nose || !left || !right) return 1;
  return nose.x >= (left.x + right.x) / 2 ? 1 : -1;
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / (values.length || 1);
}

/**
 * Confronta o relevo estimado na frontal com o observado no perfil.
 *
 * Devolve `null` quando não há pontos suficientes — é melhor não dar número nenhum do que
 * dar um número que não se sustenta.
 */
export function measureDepthAccuracy({
  frontal,
  profile,
  pixelsPerMm,
  frontalHeightPx,
}: DepthAccuracyInput): DepthAccuracyResult | null {
  const usable = SAGITTAL_MIDLINE.filter(index => {
    const f = frontal[index];
    const p = profile[index];
    return f && p && typeof f.z === 'number' && Number.isFinite(f.z);
  });
  if (usable.length < 8) return null;

  const frontalRuler = verticalSpan(frontal, NASION, MENTON);
  const profileRuler = verticalSpan(profile, NASION, MENTON);
  if (frontalRuler <= 0 || profileRuler <= 0) return null;

  // Segunda razão vertical, independente da primeira: se as duas vistas discordarem
  // sobre ela, a cabeça estava inclinada de forma diferente e a régua comum vale menos.
  const frontalUpper = verticalSpan(frontal, NASION, SUBNASALE) / frontalRuler;
  const profileUpper = verticalSpan(profile, NASION, SUBNASALE) / profileRuler;
  const verticalMismatch = Math.abs(frontalUpper - profileUpper) / Math.max(frontalUpper, 1e-6);

  // Tudo passa para a escala da foto frontal, medida em alturas násio–mento.
  const facing = facingSign(profile);
  const predictedRaw = usable.map(index => -(frontal[index].z as number) / frontalRuler);
  const observedRaw = usable.map(index => (facing * profile[index].x) / profileRuler);

  // A origem do eixo é arbitrária nas duas medidas: só as DIFERENÇAS entre pontos têm
  // sentido, então cada série é centrada antes de comparar.
  const predictedMean = mean(predictedRaw);
  const observedMean = mean(observedRaw);
  const predicted = predictedRaw.map(value => value - predictedMean);
  const observed = observedRaw.map(value => value - observedMean);

  // Fator de mínimos quadrados que melhor leva o previsto ao observado.
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < predicted.length; i++) {
    numerator += predicted[i] * observed[i];
    denominator += predicted[i] * predicted[i];
  }
  if (denominator <= 0) return null;
  const scale = numerator / denominator;

  let squaredError = 0;
  for (let i = 0; i < predicted.length; i++) {
    const residual = observed[i] - scale * predicted[i];
    squaredError += residual * residual;
  }
  const residual = Math.sqrt(squaredError / predicted.length);

  const observedRelief = Math.max(...observed) - Math.min(...observed);

  // Um perfil de verdade espalha a linha média por uma fração respeitável da altura
  // násio–mento; uma foto de frente fica em torno de 0,01. O limiar separa os dois casos
  // com folga larga dos dois lados.
  const profileLooksFrontal = observedRelief < MINIMUM_PROFILE_SPREAD;

  // Um valor em alturas násio–mento vira milímetros pela calibração da foto, quando ela
  // existe; senão pela média populacional, e o chamador avisa qual dos dois foi.
  const calibrated = Boolean(pixelsPerMm && frontalHeightPx);
  const rulerMm = calibrated
    ? (frontalRuler * (frontalHeightPx as number)) / (pixelsPerMm as number)
    : ASSUMED_NASION_MENTON_MM;
  const toMm = (value: number) => value * rulerMm;

  return {
    pointCount: usable.length,
    scale,
    residualMm: toMm(residual),
    residualFraction: observedRelief > 0 ? residual / observedRelief : 0,
    observedReliefMm: toMm(observedRelief),
    profileLooksFrontal,
    millimetresAreCalibrated: calibrated,
    verticalMismatch,
    points: usable.map((index, i) => ({
      index,
      predictedMm: toMm(scale * predicted[i]),
      observedMm: toMm(observed[i]),
    })),
  };
}
