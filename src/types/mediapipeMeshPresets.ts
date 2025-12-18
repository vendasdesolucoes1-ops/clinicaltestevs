// MediaPipe Face Mesh Point Indices by Preset
// Based on the 468-point MediaPipe Face Landmark model
// Reference: https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png

import { type MeshDensity } from './facialLandmarks';

// ============= SIMETRIA (30 pontos) =============
// Pontos clássicos de Farkas para análise de simetria
export const SIMETRIA_INDICES = [
  // Linha média (10 pontos)
  10,   // Testa superior (trichion)
  151,  // Glabela
  6,    // Nasion
  4,    // Ponta do nariz
  1,    // Subnasale
  0,    // Centro do lábio superior
  17,   // Centro do lábio inferior
  18,   // Pogonion
  152,  // Menton
  
  // Olhos - cantos (8 pontos)
  33,   // Canto externo olho esquerdo
  133,  // Canto interno olho esquerdo
  362,  // Canto interno olho direito
  263,  // Canto externo olho direito
  159,  // Centro pálpebra superior esquerda
  386,  // Centro pálpebra superior direita
  145,  // Centro pálpebra inferior esquerda
  374,  // Centro pálpebra inferior direita
  
  // Boca - comissuras (2 pontos)
  61,   // Comissura esquerda
  291,  // Comissura direita
  
  // Contorno facial (10 pontos)
  234,  // Têmpora esquerda
  454,  // Têmpora direita
  93,   // Zigomático esquerdo
  323,  // Zigomático direito
  58,   // Mandíbula esquerda
  288,  // Mandíbula direita
  172,  // Gônio esquerdo
  397,  // Gônio direito
  132,  // Bochecha esquerda
  361,  // Bochecha direita
];

// ============= CLÍNICO (120 pontos) =============
// Pontos para planejamento cirúrgico padrão
export const CLINICO_INDICES = [
  // Linha média completa
  10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 0, 17, 18, 200, 199, 175, 152,
  
  // Sobrancelhas (esquerda e direita)
  70, 63, 105, 66, 107, 55, 65, 52, 53, 46,  // Esquerda
  300, 293, 334, 296, 336, 285, 295, 282, 283, 276,  // Direita
  
  // Olhos completos
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,  // Esquerdo
  263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,  // Direito
  
  // Nariz completo
  6, 197, 195, 5, 4, 1, 19, 94, 2, 326, 327, 278,
  129, 49, 131, 134, 51, 5, 281, 363, 360, 279,
  
  // Boca completa
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308,
  95, 88, 178, 87, 14, 317, 402, 318, 324,
  
  // Contorno facial
  234, 127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356, 454,
  93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323,
];

// ============= AVANÇADO (200 pontos) =============
// Análise detalhada incluindo bochechas e detalhes
export const AVANCADO_INDICES = [
  // Todos os pontos do Clínico +
  ...CLINICO_INDICES,
  
  // Detalhes periorbitais adicionais
  56, 28, 27, 29, 30, 247, 130, 25, 110, 24, 23, 22, 26, 112, 243, 190, 
  286, 258, 257, 259, 260, 467, 359, 255, 339, 254, 253, 252, 256, 341, 463, 414,
  
  // Detalhes do nariz
  168, 122, 188, 114, 217, 126, 142, 97, 98, 219, 166,
  351, 412, 343, 437, 355, 371, 327, 326, 2, 439, 393,
  
  // Detalhes da boca
  57, 186, 92, 165, 167, 164, 393, 391, 322, 410, 287,
  43, 106, 182, 83, 18, 313, 406, 335, 273, 
  
  // Bochechas detalhadas
  123, 116, 117, 118, 119, 120, 121, 128, 229, 230, 231,
  352, 345, 346, 347, 348, 349, 350, 357, 449, 450, 451,
];

// ============= COMPLETO (468 pontos) =============
// Todos os pontos do MediaPipe
export const COMPLETO_INDICES: number[] = Array.from({ length: 468 }, (_, i) => i);

// ============= EXPORT MAP =============
export const PRESET_POINT_INDICES: Record<MeshDensity, number[]> = {
  simetria: SIMETRIA_INDICES,
  clinico: CLINICO_INDICES,
  avancado: [...new Set(AVANCADO_INDICES)], // Remove duplicates
  completo: COMPLETO_INDICES,
};

// ============= HELPER FUNCTIONS =============

/**
 * Filters MediaPipe landmarks based on the selected preset
 */
export function filterLandmarksByPreset<T extends { id?: number; index?: number }>(
  landmarks: T[],
  preset: MeshDensity
): T[] {
  if (preset === 'completo') return landmarks;
  
  const indices = PRESET_POINT_INDICES[preset];
  const indexSet = new Set(indices);
  
  return landmarks.filter((lm, i) => {
    const index = lm.index ?? lm.id ?? i;
    return indexSet.has(index);
  });
}

/**
 * Checks if a landmark index should be visible for the given preset
 */
export function isLandmarkVisible(index: number, preset: MeshDensity): boolean {
  if (preset === 'completo') return true;
  const indices = PRESET_POINT_INDICES[preset];
  if (!indices) return true; // Fallback for unknown presets - show all points
  return indices.includes(index);
}

/**
 * Gets the number of points for a given preset
 */
export function getPresetPointCount(preset: MeshDensity): number {
  return PRESET_POINT_INDICES[preset].length;
}

// Tessellation connections - subset for each preset
// These define which triangles to render based on visible points

export const SIMETRIA_CONNECTIONS: [number, number][] = [
  // Linha média vertical
  [10, 151], [151, 6], [6, 4], [4, 1], [1, 0], [0, 17], [17, 18], [18, 152],
  // Conexões horizontais de simetria
  [33, 263], [133, 362], [159, 386], [145, 374], [61, 291],
  [234, 454], [93, 323], [58, 288], [172, 397], [132, 361],
  // Contorno facial
  [234, 93], [93, 132], [132, 58], [58, 172], [172, 152],
  [454, 323], [323, 361], [361, 288], [288, 397], [397, 152],
];

export const CLINICO_CONNECTIONS: [number, number][] = [
  ...SIMETRIA_CONNECTIONS,
  // Mais conexões para mesh clínico
  // Olhos
  [33, 7], [7, 163], [163, 144], [144, 145], [145, 153], [153, 154], [154, 155], [155, 133],
  [133, 173], [173, 157], [157, 158], [158, 159], [159, 160], [160, 161], [161, 246], [246, 33],
  // Boca
  [61, 185], [185, 40], [40, 39], [39, 37], [37, 0], [0, 267], [267, 269], [269, 270], [270, 409], [409, 291],
  [61, 78], [78, 191], [191, 80], [80, 81], [81, 82], [82, 13], [13, 312], [312, 311], [311, 310], [310, 415], [415, 308], [308, 291],
];
