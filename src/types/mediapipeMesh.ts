// Tipos para o formato de dados MediaPipe retornado pelo backend

export interface MediaPipePoint {
  id: number;
  x: number;  // 0-1 normalizado
  y: number;  // 0-1 normalizado
  z?: number; // profundidade (opcional para renderização 2D)
}

export interface MediaPipeMeshData {
  points: MediaPipePoint[];
  connections: [number, number][]; // Array de pares [from_id, to_id]
}

export interface MediaPipeWebhookResponse {
  job_id?: string;
  case_id?: string;
  status: 'success' | 'completed' | 'failed';
  image_url?: string;
  error_message?: string;
  
  // Wrapped format (preferred)
  face_mesh?: MediaPipeMeshData;
  
  // Formato plano (compatibilidade com resultados já gravados)
  landmarks?: MediaPipePoint[];
  points?: MediaPipePoint[];
  connections?: [number, number][];
  landmarks_count?: number;
}

// Conexões padrão do MediaPipe Face Mesh (468 pontos)
// Subconjunto simplificado para visualização
export const MEDIAPIPE_SIMPLIFIED_CONNECTIONS: [number, number][] = [
  // Contorno do rosto
  [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389],
  [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397],
  [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152],
  [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172],
  [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162],
  [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10],
  
  // Olho esquerdo
  [33, 7], [7, 163], [163, 144], [144, 145], [145, 153], [153, 154],
  [154, 155], [155, 133], [133, 173], [173, 157], [157, 158], [158, 159],
  [159, 160], [160, 161], [161, 246], [246, 33],
  
  // Olho direito
  [263, 249], [249, 390], [390, 373], [373, 374], [374, 380], [380, 381],
  [381, 382], [382, 362], [362, 398], [398, 384], [384, 385], [385, 386],
  [386, 387], [387, 388], [388, 466], [466, 263],
  
  // Sobrancelha esquerda
  [70, 63], [63, 105], [105, 66], [66, 107],
  
  // Sobrancelha direita
  [300, 293], [293, 334], [334, 296], [296, 336],
  
  // Nariz
  [168, 6], [6, 197], [197, 195], [195, 5],
  [4, 1], [1, 19], [19, 94], [94, 2],
  
  // Lábios externos
  [61, 146], [146, 91], [91, 181], [181, 84], [84, 17], [17, 314],
  [314, 405], [405, 321], [321, 375], [375, 291], [291, 409], [409, 270],
  [270, 269], [269, 267], [267, 0], [0, 37], [37, 39], [39, 40], [40, 185], [185, 61],
  
  // Lábios internos
  [78, 95], [95, 88], [88, 178], [178, 87], [87, 14], [14, 317],
  [317, 402], [402, 318], [318, 324], [324, 308], [308, 415], [415, 310],
  [310, 311], [311, 312], [312, 13], [13, 82], [82, 81], [81, 80], [80, 191], [191, 78],
];

// Conexões densas para modo completo
export const MEDIAPIPE_DENSE_CONNECTIONS: [number, number][] = [
  ...MEDIAPIPE_SIMPLIFIED_CONNECTIONS,
  // Conexões adicionais entre olhos e nariz
  [33, 168], [263, 168],
  [133, 6], [362, 6],
  // Conexões bochecha-mandíbula
  [234, 93], [454, 323],
  [132, 58], [361, 288],
];

// Tessellação (triângulos) para renderização 3D - subconjunto do MediaPipe Face Mesh
// Cada tupla [a, b, c] representa um triângulo conectando os pontos a, b e c
export const MEDIAPIPE_TESSELLATION: [number, number, number][] = [
  // Testa
  [10, 338, 297], [10, 297, 21], [21, 297, 332], [21, 332, 54],
  [54, 332, 284], [54, 284, 103], [103, 284, 251], [103, 251, 67],
  [67, 251, 389], [67, 389, 109], [109, 389, 356],
  
  // Olho esquerdo região
  [33, 7, 163], [33, 163, 246], [246, 163, 161], [161, 163, 144],
  [161, 144, 160], [160, 144, 145], [160, 145, 159], [159, 145, 153],
  [159, 153, 158], [158, 153, 154], [158, 154, 157], [157, 154, 155],
  [157, 155, 173], [173, 155, 133],
  
  // Olho direito região
  [263, 249, 390], [263, 390, 466], [466, 390, 388], [388, 390, 373],
  [388, 373, 387], [387, 373, 374], [387, 374, 386], [386, 374, 380],
  [386, 380, 385], [385, 380, 381], [385, 381, 384], [384, 381, 382],
  [384, 382, 398], [398, 382, 362],
  
  // Nariz
  [168, 6, 197], [6, 197, 195], [195, 197, 5], [5, 4, 1],
  [1, 19, 94], [94, 19, 2],
  
  // Bochecha esquerda
  [93, 234, 132], [132, 234, 127], [127, 234, 162], [162, 127, 21],
  [132, 127, 172], [172, 127, 136], [136, 127, 150], [150, 127, 149],
  
  // Bochecha direita  
  [323, 454, 361], [361, 454, 356], [356, 454, 389], [389, 356, 109],
  [361, 356, 288], [288, 356, 397], [397, 356, 365], [365, 356, 379],
  
  // Lábios e queixo
  [61, 146, 91], [91, 146, 181], [181, 146, 84], [84, 17, 314],
  [314, 17, 405], [405, 17, 321], [321, 17, 375], [375, 291, 409],
  [152, 148, 176], [176, 148, 149], [149, 148, 150],
  [377, 152, 400], [400, 152, 378], [378, 152, 379],
  
  // Centro do rosto
  [168, 33, 133], [168, 133, 6], [168, 263, 362], [168, 362, 6],
  [6, 133, 197], [6, 362, 197],
];
