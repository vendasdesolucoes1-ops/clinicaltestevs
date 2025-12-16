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
  job_id: string;
  case_id: string;
  status: 'success' | 'failed';
  image_url?: string;
  face_mesh?: MediaPipeMeshData;
  error_message?: string;
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
