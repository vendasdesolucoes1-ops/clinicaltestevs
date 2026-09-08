// Tipos para os landmarks faciais e mesh de simetria anatômico

// ============= REGIÕES ANATÔMICAS =============

export type AnatomicalRegion = 
  | 'midline'           // Linha média (eixo de simetria)
  | 'forehead'          // Testa
  | 'eyebrow_left' | 'eyebrow_right'
  | 'eye_left' | 'eye_right'
  | 'nose_upper' | 'nose_lower'
  | 'mouth_upper' | 'mouth_lower' | 'mouth_perioral'
  | 'cheek_left' | 'cheek_right'
  | 'zygomatic_left' | 'zygomatic_right'
  | 'mandible_left' | 'mandible_right'
  | 'chin';

// Matriz de adjacência - define quais regiões podem ser conectadas
export const ADJACENT_REGIONS: Record<AnatomicalRegion, AnatomicalRegion[]> = {
  'midline': ['forehead', 'nose_upper', 'nose_lower', 'mouth_upper', 'mouth_lower', 'chin'],
  'forehead': ['midline', 'eyebrow_left', 'eyebrow_right'],
  'eyebrow_left': ['forehead', 'eye_left', 'nose_upper'],
  'eyebrow_right': ['forehead', 'eye_right', 'nose_upper'],
  'eye_left': ['eyebrow_left', 'nose_upper', 'cheek_left', 'zygomatic_left'],
  'eye_right': ['eyebrow_right', 'nose_upper', 'cheek_right', 'zygomatic_right'],
  'nose_upper': ['midline', 'eyebrow_left', 'eyebrow_right', 'eye_left', 'eye_right', 'nose_lower'],
  'nose_lower': ['midline', 'nose_upper', 'mouth_upper', 'cheek_left', 'cheek_right'],
  'mouth_upper': ['midline', 'nose_lower', 'mouth_lower', 'mouth_perioral'],
  'mouth_lower': ['midline', 'mouth_upper', 'mouth_perioral', 'chin'],
  'mouth_perioral': ['mouth_upper', 'mouth_lower', 'cheek_left', 'cheek_right'],
  'cheek_left': ['eye_left', 'nose_lower', 'mouth_perioral', 'zygomatic_left', 'mandible_left'],
  'cheek_right': ['eye_right', 'nose_lower', 'mouth_perioral', 'zygomatic_right', 'mandible_right'],
  'zygomatic_left': ['eye_left', 'cheek_left', 'mandible_left'],
  'zygomatic_right': ['eye_right', 'cheek_right', 'mandible_right'],
  'mandible_left': ['cheek_left', 'zygomatic_left', 'chin'],
  'mandible_right': ['cheek_right', 'zygomatic_right', 'chin'],
  'chin': ['midline', 'mouth_lower', 'mandible_left', 'mandible_right'],
};

// Cores por região anatômica para visualização
export const REGION_COLORS: Record<AnatomicalRegion, string> = {
  'midline': '#ff6b6b',        // Vermelho - linha de simetria
  'forehead': '#4ecdc4',       // Teal
  'eyebrow_left': '#45b7d1',   // Azul claro
  'eyebrow_right': '#45b7d1',
  'eye_left': '#96ceb4',       // Verde menta
  'eye_right': '#96ceb4',
  'nose_upper': '#ffeaa7',     // Amarelo
  'nose_lower': '#fdcb6e',     // Laranja claro
  'mouth_upper': '#e17055',    // Coral
  'mouth_lower': '#d63031',    // Vermelho
  'mouth_perioral': '#fab1a0', // Pêssego
  'cheek_left': '#a29bfe',     // Lavanda
  'cheek_right': '#a29bfe',
  'zygomatic_left': '#74b9ff', // Azul
  'zygomatic_right': '#74b9ff',
  'mandible_left': '#fd79a8',  // Rosa
  'mandible_right': '#fd79a8',
  'chin': '#e84393',           // Magenta
};

// ============= INTERFACES PRINCIPAIS =============

export interface FaceROI {
  x: number;      // 0-1 normalizado
  y: number;      // 0-1 normalizado
  width: number;  // 0-1 normalizado
  height: number; // 0-1 normalizado
}

export interface FacialPoint {
  id: string;
  name: string;
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  region: AnatomicalRegion;
  adjacentRegions?: AnatomicalRegion[];
  // AI-1: confiança do detector neste ponto (0-1). `undefined` = escore não informado
  // (ex.: o mesh geométrico do MediaPipe), que não é o mesmo que confiança baixa.
  confidence?: number;
  category?: 'forehead' | 'eyebrows' | 'eyes' | 'nose' | 'mouth' | 'chin' | 'contour' | 'cheeks' | 'ears'; // legacy
}

// Abaixo deste valor o ponto é sinalizado na interface para revisão manual do cirurgião.
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export interface FacialConnection {
  from: string;
  to: string;
  type: 'horizontal' | 'vertical' | 'diagonal' | 'contour' | 'custom' | 'midline';
  isCustom?: boolean;
}

// ============= MESH DENSITY PRESETS =============

export type MeshDensity = 'simetria' | 'clinico' | 'avancado' | 'completo';

// Legacy type for backwards compatibility
export type LegacyMeshDensity = 'simple' | 'dense';

export interface MeshPresetConfig {
  label: string;
  points: number;
  description: string;
  useCase: string;
  icon: string;
  color: string;
}

export const MESH_PRESETS: Record<MeshDensity, MeshPresetConfig> = {
  simetria: {
    label: 'Simetria',
    points: 30,
    description: 'Análise básica de simetria facial',
    useCase: 'Triagem, avaliação inicial',
    icon: '🎯',
    color: 'hsl(var(--primary))',
  },
  clinico: {
    label: 'Clínico',
    points: 120,
    description: 'Padrão para planejamento cirúrgico',
    useCase: 'Queimaduras, trauma, reconstrução',
    icon: '📐',
    color: 'hsl(var(--chart-2))',
  },
  avancado: {
    label: 'Avançado',
    points: 200,
    description: 'Análise detalhada por região',
    useCase: 'Periorbital, perioral, complexo',
    icon: '🔬',
    color: 'hsl(var(--chart-3))',
  },
  completo: {
    label: 'Completo',
    points: 468,
    description: 'Máxima precisão (MediaPipe Full)',
    useCase: 'Pesquisa, casos muito complexos',
    icon: '⚡',
    color: 'hsl(var(--chart-4))',
  },
};

// Helper to convert legacy density to new presets
export function legacyToNewDensity(legacy: LegacyMeshDensity): MeshDensity {
  return legacy === 'simple' ? 'simetria' : 'clinico';
}

// Helper to convert new density to legacy (for backwards compatibility)
export function newToLegacyDensity(density: MeshDensity): LegacyMeshDensity {
  return density === 'simetria' ? 'simple' : 'dense';
}

export interface FacialMeshData {
  points: FacialPoint[];
  connections: FacialConnection[];
  faceROI?: FaceROI;
  midlinePoints?: string[];
}

// ============= VALIDAÇÃO DE CONEXÕES =============

// Verifica se dois pontos podem ser conectados baseado em suas regiões
export const canConnect = (point1: FacialPoint, point2: FacialPoint): boolean => {
  // Mesma região sempre pode conectar
  if (point1.region === point2.region) return true;
  
  // Verifica adjacência
  const adjacentToPoint1 = ADJACENT_REGIONS[point1.region] || [];
  const adjacentToPoint2 = ADJACENT_REGIONS[point2.region] || [];
  
  return adjacentToPoint1.includes(point2.region) || adjacentToPoint2.includes(point1.region);
};

// Verifica se um ponto está dentro da ROI facial
export const isPointInROI = (point: { x: number; y: number }, roi: FaceROI): boolean => {
  return point.x >= roi.x && 
         point.x <= roi.x + roi.width &&
         point.y >= roi.y && 
         point.y <= roi.y + roi.height;
};

// ============= GERAÇÃO DE CONEXÕES INTELIGENTES =============

export const generateSmartConnections = (
  points: FacialPoint[], 
  density: MeshDensity,
  midlinePoints: string[] = []
): FacialConnection[] => {
  const connections: FacialConnection[] = [];
  const pointsMap = new Map(points.map(p => [p.id, p]));
  const pointIds = new Set(points.map(p => p.id));
  const addedConnections = new Set<string>();
  
  const addConnection = (from: string, to: string, type: FacialConnection['type']) => {
    if (!pointIds.has(from) || !pointIds.has(to)) return;
    
    const key = [from, to].sort().join('_');
    if (addedConnections.has(key)) return;
    
    const point1 = pointsMap.get(from);
    const point2 = pointsMap.get(to);
    
    if (!point1 || !point2) return;
    
    // Validar que as regiões podem ser conectadas
    if (!canConnect(point1, point2)) {
      return; // Conexão inválida entre regiões não adjacentes
    }
    
    addedConnections.add(key);
    connections.push({ from, to, type });
  };

  // === LINHA MÉDIA (Eixo de Simetria) ===
  const midlineSequence = midlinePoints.length > 0 ? midlinePoints : [
    'trichion', 'metopion', 'glabella', 'nasion', 'rhinion', 
    'pronasale', 'subnasale', 'labiale_superius', 'stomion',
    'labiale_inferius', 'pogonion', 'gnathion', 'menton'
  ];
  
  for (let i = 0; i < midlineSequence.length - 1; i++) {
    addConnection(midlineSequence[i], midlineSequence[i + 1], 'midline');
  }

  // === SOBRANCELHAS (conexões dentro da mesma região) ===
  for (let i = 1; i <= 4; i++) {
    addConnection(`supercilium_left_${i}`, `supercilium_left_${i + 1}`, 'contour');
    addConnection(`supercilium_right_${i}`, `supercilium_right_${i + 1}`, 'contour');
  }
  
  // Conexão horizontal entre sobrancelhas (via pontos próximos à linha média)
  addConnection('supercilium_left_1', 'glabella', 'horizontal');
  addConnection('glabella', 'supercilium_right_1', 'horizontal');

  // === OLHOS (contorno fechado) ===
  // Olho esquerdo
  const leftEyeSequence = [
    'orbitale_left_inner', 'palpebra_sup_left_1', 'palpebra_sup_left_2', 
    'palpebra_sup_left_3', 'orbitale_left_outer', 'palpebra_inf_left_3',
    'palpebra_inf_left_2', 'palpebra_inf_left_1', 'orbitale_left_inner'
  ];
  for (let i = 0; i < leftEyeSequence.length - 1; i++) {
    addConnection(leftEyeSequence[i], leftEyeSequence[i + 1], 'contour');
  }
  
  // Olho direito
  const rightEyeSequence = [
    'orbitale_right_inner', 'palpebra_sup_right_1', 'palpebra_sup_right_2', 
    'palpebra_sup_right_3', 'orbitale_right_outer', 'palpebra_inf_right_3',
    'palpebra_inf_right_2', 'palpebra_inf_right_1', 'orbitale_right_inner'
  ];
  for (let i = 0; i < rightEyeSequence.length - 1; i++) {
    addConnection(rightEyeSequence[i], rightEyeSequence[i + 1], 'contour');
  }
  
  // Conexão horizontal entre olhos
  addConnection('orbitale_left_inner', 'nasion', 'diagonal');
  addConnection('nasion', 'orbitale_right_inner', 'diagonal');
  addConnection('orbitale_left_inner', 'orbitale_right_inner', 'horizontal');
  addConnection('orbitale_left_outer', 'orbitale_right_outer', 'horizontal');
  addConnection('pupil_left', 'pupil_right', 'horizontal');

  // === NARIZ ===
  addConnection('alar_left_1', 'alar_left_2', 'contour');
  addConnection('alar_right_1', 'alar_right_2', 'contour');
  addConnection('pronasale', 'alar_left_2', 'diagonal');
  addConnection('pronasale', 'alar_right_2', 'diagonal');
  addConnection('alar_left_2', 'alar_right_2', 'horizontal');
  
  // === BOCA (contorno) ===
  // Lábio superior
  addConnection('cheilion_left', 'vermillion_sup_left_1', 'contour');
  addConnection('vermillion_sup_left_1', 'cupid_bow_left', 'contour');
  addConnection('cupid_bow_left', 'cupid_bow_center', 'contour');
  addConnection('cupid_bow_center', 'cupid_bow_right', 'contour');
  addConnection('cupid_bow_right', 'vermillion_sup_right_1', 'contour');
  addConnection('vermillion_sup_right_1', 'cheilion_right', 'contour');
  
  // Lábio inferior (fecha o contorno)
  addConnection('cheilion_left', 'labiale_inferius', 'contour');
  addConnection('labiale_inferius', 'cheilion_right', 'contour');
  
  // Conexão horizontal boca
  addConnection('cheilion_left', 'cheilion_right', 'horizontal');
  addConnection('philtrum_left', 'philtrum_right', 'horizontal');

  // === MANDÍBULA/CONTORNO FACIAL ===
  // Contorno esquerdo
  addConnection('temple_left', 'orbitale_left_outer', 'contour');
  addConnection('orbitale_left_outer', 'zygion_left', 'contour');
  addConnection('zygion_left', 'cheek_left_1', 'contour');
  addConnection('cheek_left_1', 'gonion_left', 'contour');
  addConnection('gonion_left', 'mandible_left_1', 'contour');
  addConnection('mandible_left_1', 'mandible_left_2', 'contour');
  addConnection('mandible_left_2', 'menton', 'contour');
  
  // Contorno direito
  addConnection('temple_right', 'orbitale_right_outer', 'contour');
  addConnection('orbitale_right_outer', 'zygion_right', 'contour');
  addConnection('zygion_right', 'cheek_right_1', 'contour');
  addConnection('cheek_right_1', 'gonion_right', 'contour');
  addConnection('gonion_right', 'mandible_right_1', 'contour');
  addConnection('mandible_right_1', 'mandible_right_2', 'contour');
  addConnection('mandible_right_2', 'menton', 'contour');
  
  // Conexões horizontais de simetria
  addConnection('temple_left', 'temple_right', 'horizontal');
  addConnection('zygion_left', 'zygion_right', 'horizontal');
  addConnection('malar_left', 'malar_right', 'horizontal');
  addConnection('gonion_left', 'gonion_right', 'horizontal');

  // === CONEXÕES DENSAS (para densidades maiores) ===
  if (density === 'clinico' || density === 'avancado' || density === 'completo') {
    // Testa → Olhos (conexões diagonais válidas)
    addConnection('metopion', 'supercilium_left_3', 'diagonal');
    addConnection('metopion', 'supercilium_right_3', 'diagonal');
    addConnection('glabella', 'orbitale_left_inner', 'diagonal');
    addConnection('glabella', 'orbitale_right_inner', 'diagonal');
    
    // Olhos → Zigomático (adjacentes)
    addConnection('orbitale_left_outer', 'zygion_left', 'diagonal');
    addConnection('orbitale_right_outer', 'zygion_right', 'diagonal');
    
    // Nariz → Boca (adjacentes)
    addConnection('subnasale', 'philtrum_left', 'diagonal');
    addConnection('subnasale', 'philtrum_right', 'diagonal');
    
    // Boca → Mandíbula (via regiões adjacentes cheek)
    addConnection('cheilion_left', 'cheek_left_1', 'diagonal');
    addConnection('cheilion_right', 'cheek_right_1', 'diagonal');
    
    // Zigomático → Boca (via cheek)
    addConnection('zygion_left', 'malar_left', 'diagonal');
    addConnection('zygion_right', 'malar_right', 'diagonal');
    addConnection('malar_left', 'cheilion_left', 'diagonal');
    addConnection('malar_right', 'cheilion_right', 'diagonal');
    
    // Queixo
    addConnection('labiale_inferius', 'pogonion', 'vertical');
    addConnection('gnathion', 'gonion_left', 'diagonal');
    addConnection('gnathion', 'gonion_right', 'diagonal');
  }

  return connections;
};

// ============= LEGACY FUNCTIONS (compatibilidade) =============

export const generateConnectionsFromPoints = (points: FacialPoint[], density: MeshDensity): FacialConnection[] => {
  return generateSmartConnections(points, density);
};

export const getConnectionsByDensity = (density: MeshDensity, points?: FacialPoint[], midlinePoints?: string[]): FacialConnection[] => {
  if (points && points.length > 10) {
    return generateSmartConnections(points, density, midlinePoints);
  }
  // Use simple connections for 'simetria', dense for others
  return density === 'simetria' ? SIMPLE_CONNECTIONS : DENSE_CONNECTIONS;
};

// ============= CONEXÕES ESTÁTICAS (FALLBACK) =============

export const SIMPLE_CONNECTIONS: FacialConnection[] = [
  { from: 'glabella', to: 'nasion', type: 'midline' },
  { from: 'nasion', to: 'pronasale', type: 'midline' },
  { from: 'pronasale', to: 'subnasale', type: 'midline' },
  { from: 'subnasale', to: 'labiale_superius', type: 'midline' },
  { from: 'labiale_superius', to: 'labiale_inferius', type: 'midline' },
  { from: 'labiale_inferius', to: 'gnathion', type: 'midline' },
  { from: 'orbitale_left_inner', to: 'orbitale_right_inner', type: 'horizontal' },
  { from: 'orbitale_left_outer', to: 'orbitale_right_outer', type: 'horizontal' },
  { from: 'cheilion_left', to: 'cheilion_right', type: 'horizontal' },
  { from: 'zygion_left', to: 'zygion_right', type: 'horizontal' },
  { from: 'gonion_left', to: 'gonion_right', type: 'horizontal' },
  { from: 'temple_left', to: 'temple_right', type: 'horizontal' },
  { from: 'temple_left', to: 'zygion_left', type: 'contour' },
  { from: 'zygion_left', to: 'gonion_left', type: 'contour' },
  { from: 'gonion_left', to: 'gnathion', type: 'contour' },
  { from: 'gnathion', to: 'gonion_right', type: 'contour' },
  { from: 'gonion_right', to: 'zygion_right', type: 'contour' },
  { from: 'zygion_right', to: 'temple_right', type: 'contour' },
];

export const DENSE_CONNECTIONS: FacialConnection[] = [
  ...SIMPLE_CONNECTIONS,
  { from: 'orbitale_left_inner', to: 'orbitale_left_outer', type: 'horizontal' },
  { from: 'orbitale_right_inner', to: 'orbitale_right_outer', type: 'horizontal' },
  { from: 'glabella', to: 'orbitale_left_inner', type: 'diagonal' },
  { from: 'glabella', to: 'orbitale_right_inner', type: 'diagonal' },
  { from: 'nasion', to: 'orbitale_left_inner', type: 'diagonal' },
  { from: 'nasion', to: 'orbitale_right_inner', type: 'diagonal' },
  { from: 'orbitale_left_outer', to: 'zygion_left', type: 'diagonal' },
  { from: 'orbitale_right_outer', to: 'zygion_right', type: 'diagonal' },
  { from: 'pronasale', to: 'zygion_left', type: 'diagonal' },
  { from: 'pronasale', to: 'zygion_right', type: 'diagonal' },
  { from: 'subnasale', to: 'cheilion_left', type: 'diagonal' },
  { from: 'subnasale', to: 'cheilion_right', type: 'diagonal' },
  { from: 'zygion_left', to: 'cheilion_left', type: 'diagonal' },
  { from: 'zygion_right', to: 'cheilion_right', type: 'diagonal' },
  { from: 'gnathion', to: 'gonion_left', type: 'diagonal' },
  { from: 'gnathion', to: 'gonion_right', type: 'diagonal' },
];

export const DEFAULT_CONNECTIONS = DENSE_CONNECTIONS;

// ============= LABELS E PARES ESPELHADOS =============

export const POINT_LABELS: Record<string, string> = {
  trichion: 'Tríquio', metopion: 'Métopion', glabella: 'Glabela',
  temple_left: 'Têmpora E', temple_right: 'Têmpora D',
  supercilium_left_1: 'Sobrancelha E1', supercilium_left_2: 'Sobrancelha E2',
  supercilium_left_3: 'Sobrancelha E3', supercilium_left_4: 'Sobrancelha E4',
  supercilium_left_5: 'Sobrancelha E5', supercilium_right_1: 'Sobrancelha D1',
  supercilium_right_2: 'Sobrancelha D2', supercilium_right_3: 'Sobrancelha D3',
  supercilium_right_4: 'Sobrancelha D4', supercilium_right_5: 'Sobrancelha D5',
  orbitale_left_inner: 'Canto Int. Olho E', orbitale_left_outer: 'Canto Ext. Olho E',
  orbitale_right_inner: 'Canto Int. Olho D', orbitale_right_outer: 'Canto Ext. Olho D',
  pupil_left: 'Pupila E', pupil_right: 'Pupila D',
  palpebra_sup_left_1: 'Pálpebra Sup E1', palpebra_sup_left_2: 'Pálpebra Sup E2',
  palpebra_sup_left_3: 'Pálpebra Sup E3', palpebra_inf_left_1: 'Pálpebra Inf E1',
  palpebra_inf_left_2: 'Pálpebra Inf E2', palpebra_inf_left_3: 'Pálpebra Inf E3',
  palpebra_sup_right_1: 'Pálpebra Sup D1', palpebra_sup_right_2: 'Pálpebra Sup D2',
  palpebra_sup_right_3: 'Pálpebra Sup D3', palpebra_inf_right_1: 'Pálpebra Inf D1',
  palpebra_inf_right_2: 'Pálpebra Inf D2', palpebra_inf_right_3: 'Pálpebra Inf D3',
  nasion: 'Násion', rhinion: 'Rínnion', pronasale: 'Pronasale', subnasale: 'Subnasale',
  alar_left_1: 'Asa Nasal E1', alar_left_2: 'Asa Nasal E2', alar_right_1: 'Asa Nasal D1',
  alar_right_2: 'Asa Nasal D2', columella_left: 'Columela E', columella_right: 'Columela D',
  philtrum_left: 'Filtro E', philtrum_right: 'Filtro D',
  cupid_bow_left: 'Arco Cupido E', cupid_bow_center: 'Arco Cupido C', cupid_bow_right: 'Arco Cupido D',
  labiale_superius: 'Lábio Superior', labiale_inferius: 'Lábio Inferior', stomion: 'Estomion',
  cheilion_left: 'Comissura E', cheilion_right: 'Comissura D',
  vermillion_sup_left_1: 'Vermelhão Sup E1', vermillion_sup_right_1: 'Vermelhão Sup D1',
  labiomental_crease: 'Sulco Labiomental', pogonion: 'Pogônio', gnathion: 'Gnátio', menton: 'Mento',
  gonion_left: 'Gônio E', gonion_right: 'Gônio D',
  mandible_left_1: 'Mandíbula E1', mandible_left_2: 'Mandíbula E2',
  mandible_right_1: 'Mandíbula D1', mandible_right_2: 'Mandíbula D2',
  zygion_left: 'Zigomático E', zygion_right: 'Zigomático D',
  malar_left: 'Malar E', malar_right: 'Malar D',
  cheek_left_1: 'Bochecha E1', cheek_right_1: 'Bochecha D1',
};

// Pares espelhados agrupados por região anatômica
export const MIRRORED_POINT_PAIRS: Array<{ left: string; right: string; label: string; region: string }> = [
  // Testa
  { left: 'temple_left', right: 'temple_right', label: 'Têmporas', region: 'forehead' },
  // Sobrancelhas
  { left: 'supercilium_left_1', right: 'supercilium_right_1', label: 'Sobrancelhas Int.', region: 'eyebrows' },
  { left: 'supercilium_left_3', right: 'supercilium_right_3', label: 'Sobrancelhas Med.', region: 'eyebrows' },
  { left: 'supercilium_left_5', right: 'supercilium_right_5', label: 'Sobrancelhas Ext.', region: 'eyebrows' },
  // Olhos
  { left: 'orbitale_left_inner', right: 'orbitale_right_inner', label: 'Cantos Int. Olhos', region: 'eyes' },
  { left: 'orbitale_left_outer', right: 'orbitale_right_outer', label: 'Cantos Ext. Olhos', region: 'eyes' },
  { left: 'pupil_left', right: 'pupil_right', label: 'Pupilas', region: 'eyes' },
  { left: 'palpebra_sup_left_2', right: 'palpebra_sup_right_2', label: 'Pálpebras Sup.', region: 'eyes' },
  { left: 'palpebra_inf_left_2', right: 'palpebra_inf_right_2', label: 'Pálpebras Inf.', region: 'eyes' },
  // Nariz
  { left: 'alar_left_2', right: 'alar_right_2', label: 'Asas Nasais', region: 'nose' },
  // Boca
  { left: 'philtrum_left', right: 'philtrum_right', label: 'Filtro', region: 'mouth' },
  { left: 'cupid_bow_left', right: 'cupid_bow_right', label: 'Arcos de Cupido', region: 'mouth' },
  { left: 'cheilion_left', right: 'cheilion_right', label: 'Comissuras', region: 'mouth' },
  { left: 'vermillion_sup_left_1', right: 'vermillion_sup_right_1', label: 'Vermelhão Sup.', region: 'mouth' },
  // Zigomático
  { left: 'zygion_left', right: 'zygion_right', label: 'Zigomáticos', region: 'zygomatic' },
  { left: 'malar_left', right: 'malar_right', label: 'Malares', region: 'zygomatic' },
  // Bochechas
  { left: 'cheek_left_1', right: 'cheek_right_1', label: 'Bochechas', region: 'cheeks' },
  // Mandíbula
  { left: 'gonion_left', right: 'gonion_right', label: 'Gônios', region: 'mandible' },
  { left: 'mandible_left_1', right: 'mandible_right_1', label: 'Mandíbula 1', region: 'mandible' },
  { left: 'mandible_left_2', right: 'mandible_right_2', label: 'Mandíbula 2', region: 'mandible' },
];

// Interface de resultado de simetria com métricas por região
export interface RegionalSymmetry {
  region: string;
  regionLabel: string;
  score: number;
  pairs: Array<{
    label: string;
    deviation: number;
    verticalDiff: number;
    horizontalDiff: number;
  }>;
}

export interface SymmetryResult {
  overallScore: number;
  pairs: Array<{
    label: string;
    leftPoint: string;
    rightPoint: string;
    deviation: number;
    verticalDiff: number;
    horizontalDiff: number;
  }>;
  regionalScores?: RegionalSymmetry[];
  criticalAreas?: string[];
}
