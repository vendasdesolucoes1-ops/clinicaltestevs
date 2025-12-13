// Tipos para os landmarks faciais e mesh de simetria

export interface FacialPoint {
  id: string;
  name: string;
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  category: 'forehead' | 'eyebrows' | 'eyes' | 'nose' | 'mouth' | 'chin' | 'contour' | 'cheeks' | 'ears';
}

export interface FacialConnection {
  from: string;
  to: string;
  type: 'horizontal' | 'vertical' | 'diagonal' | 'contour' | 'custom';
  isCustom?: boolean;
}

export type MeshDensity = 'simple' | 'dense';

export interface FacialMeshData {
  points: FacialPoint[];
  connections: FacialConnection[];
}

// Função para gerar conexões dinamicamente baseado nos pontos detectados
export const generateConnectionsFromPoints = (points: FacialPoint[], density: MeshDensity): FacialConnection[] => {
  const connections: FacialConnection[] = [];
  const pointIds = new Set(points.map(p => p.id));
  
  // Helper para adicionar conexão se ambos pontos existirem
  const addConnection = (from: string, to: string, type: FacialConnection['type']) => {
    if (pointIds.has(from) && pointIds.has(to)) {
      connections.push({ from, to, type });
    }
  };

  // === CONEXÕES VERTICAIS (Linha Central) ===
  const verticalCentralPoints = [
    'trichion', 'metopion', 'glabella', 'nasion', 'rhinion', 'dorsum_1', 'dorsum_2', 'dorsum_3',
    'pronasale', 'columella_center', 'subnasale', 'philtrum_center', 'cupid_bow_center',
    'labiale_superius', 'stomion', 'labiale_inferius', 'labiomental_crease', 
    'pogonion', 'gnathion', 'menton'
  ];
  
  for (let i = 0; i < verticalCentralPoints.length - 1; i++) {
    addConnection(verticalCentralPoints[i], verticalCentralPoints[i + 1], 'vertical');
  }

  // === CONEXÕES HORIZONTAIS (Pares Simétricos) ===
  const horizontalPairs = [
    ['temple_left', 'temple_right'],
    ['supercilium_left_1', 'supercilium_right_1'],
    ['supercilium_left_3', 'supercilium_right_3'],
    ['supercilium_left_5', 'supercilium_right_5'],
    ['orbitale_left_inner', 'orbitale_right_inner'],
    ['orbitale_left_outer', 'orbitale_right_outer'],
    ['pupil_left', 'pupil_right'],
    ['palpebra_sup_left_2', 'palpebra_sup_right_2'],
    ['palpebra_inf_left_2', 'palpebra_inf_right_2'],
    ['alar_left_2', 'alar_right_2'],
    ['columella_left', 'columella_right'],
    ['cheilion_left', 'cheilion_right'],
    ['cupid_bow_left', 'cupid_bow_right'],
    ['philtrum_left', 'philtrum_right'],
    ['zygion_left', 'zygion_right'],
    ['malar_left', 'malar_right'],
    ['gonion_left', 'gonion_right'],
    ['tragus_left', 'tragus_right'],
    ['lobule_left', 'lobule_right'],
  ];
  
  horizontalPairs.forEach(([left, right]) => {
    addConnection(left, right, 'horizontal');
  });

  // === CONEXÕES DE CONTORNO ===
  // Contorno esquerdo
  const contourLeft = [
    'temple_left', 'supercilium_left_5', 'orbitale_left_outer', 'zygion_left', 
    'cheek_left_1', 'cheek_left_2', 'cheek_left_3', 'cheek_left_4', 'cheek_left_5',
    'gonion_left', 'mandible_left_1', 'mandible_left_2', 'mandible_left_3', 
    'mandible_left_4', 'mandible_left_5', 'menton'
  ];
  for (let i = 0; i < contourLeft.length - 1; i++) {
    addConnection(contourLeft[i], contourLeft[i + 1], 'contour');
  }
  
  // Contorno direito
  const contourRight = [
    'temple_right', 'supercilium_right_5', 'orbitale_right_outer', 'zygion_right',
    'cheek_right_1', 'cheek_right_2', 'cheek_right_3', 'cheek_right_4', 'cheek_right_5',
    'gonion_right', 'mandible_right_1', 'mandible_right_2', 'mandible_right_3',
    'mandible_right_4', 'mandible_right_5', 'menton'
  ];
  for (let i = 0; i < contourRight.length - 1; i++) {
    addConnection(contourRight[i], contourRight[i + 1], 'contour');
  }

  // === SOBRANCELHAS ===
  for (let i = 1; i <= 4; i++) {
    addConnection(`supercilium_left_${i}`, `supercilium_left_${i + 1}`, 'contour');
    addConnection(`supercilium_right_${i}`, `supercilium_right_${i + 1}`, 'contour');
  }

  // === OLHOS ===
  // Contorno olho esquerdo
  addConnection('orbitale_left_inner', 'palpebra_sup_left_1', 'contour');
  addConnection('palpebra_sup_left_1', 'palpebra_sup_left_2', 'contour');
  addConnection('palpebra_sup_left_2', 'palpebra_sup_left_3', 'contour');
  addConnection('palpebra_sup_left_3', 'orbitale_left_outer', 'contour');
  addConnection('orbitale_left_outer', 'palpebra_inf_left_3', 'contour');
  addConnection('palpebra_inf_left_3', 'palpebra_inf_left_2', 'contour');
  addConnection('palpebra_inf_left_2', 'palpebra_inf_left_1', 'contour');
  addConnection('palpebra_inf_left_1', 'orbitale_left_inner', 'contour');
  
  // Contorno olho direito
  addConnection('orbitale_right_inner', 'palpebra_sup_right_1', 'contour');
  addConnection('palpebra_sup_right_1', 'palpebra_sup_right_2', 'contour');
  addConnection('palpebra_sup_right_2', 'palpebra_sup_right_3', 'contour');
  addConnection('palpebra_sup_right_3', 'orbitale_right_outer', 'contour');
  addConnection('orbitale_right_outer', 'palpebra_inf_right_3', 'contour');
  addConnection('palpebra_inf_right_3', 'palpebra_inf_right_2', 'contour');
  addConnection('palpebra_inf_right_2', 'palpebra_inf_right_1', 'contour');
  addConnection('palpebra_inf_right_1', 'orbitale_right_inner', 'contour');

  // === NARIZ ===
  addConnection('alar_left_1', 'alar_left_2', 'contour');
  addConnection('alar_left_2', 'alar_left_3', 'contour');
  addConnection('alar_right_1', 'alar_right_2', 'contour');
  addConnection('alar_right_2', 'alar_right_3', 'contour');
  addConnection('pronasale', 'alar_left_2', 'diagonal');
  addConnection('pronasale', 'alar_right_2', 'diagonal');
  addConnection('subnasale', 'columella_left', 'contour');
  addConnection('subnasale', 'columella_right', 'contour');

  // === LÁBIOS ===
  // Lábio superior
  addConnection('cheilion_left', 'vermillion_sup_left_3', 'contour');
  addConnection('vermillion_sup_left_3', 'vermillion_sup_left_2', 'contour');
  addConnection('vermillion_sup_left_2', 'vermillion_sup_left_1', 'contour');
  addConnection('vermillion_sup_left_1', 'cupid_bow_left', 'contour');
  addConnection('cupid_bow_left', 'cupid_bow_center', 'contour');
  addConnection('cupid_bow_center', 'cupid_bow_right', 'contour');
  addConnection('cupid_bow_right', 'vermillion_sup_right_1', 'contour');
  addConnection('vermillion_sup_right_1', 'vermillion_sup_right_2', 'contour');
  addConnection('vermillion_sup_right_2', 'vermillion_sup_right_3', 'contour');
  addConnection('vermillion_sup_right_3', 'cheilion_right', 'contour');
  
  // Lábio inferior
  addConnection('cheilion_left', 'vermillion_inf_left_2', 'contour');
  addConnection('vermillion_inf_left_2', 'vermillion_inf_left_1', 'contour');
  addConnection('vermillion_inf_left_1', 'labiale_inferius', 'contour');
  addConnection('labiale_inferius', 'vermillion_inf_right_1', 'contour');
  addConnection('vermillion_inf_right_1', 'vermillion_inf_right_2', 'contour');
  addConnection('vermillion_inf_right_2', 'cheilion_right', 'contour');

  if (density === 'dense') {
    // === CONEXÕES DIAGONAIS ADICIONAIS ===
    // Testa para olhos
    addConnection('glabella', 'orbitale_left_inner', 'diagonal');
    addConnection('glabella', 'orbitale_right_inner', 'diagonal');
    addConnection('metopion', 'supercilium_left_3', 'diagonal');
    addConnection('metopion', 'supercilium_right_3', 'diagonal');
    addConnection('temple_left', 'orbitale_left_outer', 'diagonal');
    addConnection('temple_right', 'orbitale_right_outer', 'diagonal');
    
    // Nariz para olhos
    addConnection('nasion', 'orbitale_left_inner', 'diagonal');
    addConnection('nasion', 'orbitale_right_inner', 'diagonal');
    
    // Zigomático
    addConnection('orbitale_left_outer', 'zygion_left', 'diagonal');
    addConnection('orbitale_right_outer', 'zygion_right', 'diagonal');
    addConnection('pronasale', 'zygion_left', 'diagonal');
    addConnection('pronasale', 'zygion_right', 'diagonal');
    addConnection('zygion_left', 'cheilion_left', 'diagonal');
    addConnection('zygion_right', 'cheilion_right', 'diagonal');
    
    // Boca para queixo
    addConnection('cheilion_left', 'gonion_left', 'diagonal');
    addConnection('cheilion_right', 'gonion_right', 'diagonal');
    addConnection('labiale_inferius', 'gonion_left', 'diagonal');
    addConnection('labiale_inferius', 'gonion_right', 'diagonal');
    
    // Malar
    addConnection('malar_left', 'zygion_left', 'diagonal');
    addConnection('malar_right', 'zygion_right', 'diagonal');
    addConnection('malar_left', 'cheilion_left', 'diagonal');
    addConnection('malar_right', 'cheilion_right', 'diagonal');
    
    // Conexões extras de triangulação
    addConnection('subnasale', 'cheilion_left', 'diagonal');
    addConnection('subnasale', 'cheilion_right', 'diagonal');
    addConnection('labiale_superius', 'cheilion_left', 'diagonal');
    addConnection('labiale_superius', 'cheilion_right', 'diagonal');
    addConnection('gnathion', 'gonion_left', 'diagonal');
    addConnection('gnathion', 'gonion_right', 'diagonal');
  }

  return connections;
};

// Conexões SIMPLES - linhas principais de simetria (fallback para pontos antigos)
export const SIMPLE_CONNECTIONS: FacialConnection[] = [
  // Linha central vertical
  { from: 'glabella', to: 'nasion', type: 'vertical' },
  { from: 'nasion', to: 'pronasale', type: 'vertical' },
  { from: 'pronasale', to: 'subnasale', type: 'vertical' },
  { from: 'subnasale', to: 'labiale_superius', type: 'vertical' },
  { from: 'labiale_superius', to: 'labiale_inferius', type: 'vertical' },
  { from: 'labiale_inferius', to: 'gnathion', type: 'vertical' },
  
  // Linhas horizontais principais
  { from: 'orbitale_left_inner', to: 'orbitale_right_inner', type: 'horizontal' },
  { from: 'orbitale_left_outer', to: 'orbitale_right_outer', type: 'horizontal' },
  { from: 'cheilion_left', to: 'cheilion_right', type: 'horizontal' },
  { from: 'zygion_left', to: 'zygion_right', type: 'horizontal' },
  { from: 'gonion_left', to: 'gonion_right', type: 'horizontal' },
  { from: 'temple_left', to: 'temple_right', type: 'horizontal' },
  
  // Contorno facial
  { from: 'temple_left', to: 'zygion_left', type: 'contour' },
  { from: 'zygion_left', to: 'gonion_left', type: 'contour' },
  { from: 'gonion_left', to: 'gnathion', type: 'contour' },
  { from: 'gnathion', to: 'gonion_right', type: 'contour' },
  { from: 'gonion_right', to: 'zygion_right', type: 'contour' },
  { from: 'zygion_right', to: 'temple_right', type: 'contour' },
];

// Conexões DENSAS - triangulação completa para análise detalhada (fallback)
export const DENSE_CONNECTIONS: FacialConnection[] = [
  ...SIMPLE_CONNECTIONS,
  
  // Conexões dos olhos
  { from: 'orbitale_left_inner', to: 'orbitale_left_outer', type: 'horizontal' },
  { from: 'orbitale_right_inner', to: 'orbitale_right_outer', type: 'horizontal' },
  
  // Diagonais
  { from: 'glabella', to: 'orbitale_left_inner', type: 'diagonal' },
  { from: 'glabella', to: 'orbitale_right_inner', type: 'diagonal' },
  { from: 'temple_left', to: 'orbitale_left_outer', type: 'diagonal' },
  { from: 'temple_right', to: 'orbitale_right_outer', type: 'diagonal' },
  { from: 'nasion', to: 'orbitale_left_inner', type: 'diagonal' },
  { from: 'nasion', to: 'orbitale_right_inner', type: 'diagonal' },
  { from: 'orbitale_left_outer', to: 'zygion_left', type: 'diagonal' },
  { from: 'orbitale_right_outer', to: 'zygion_right', type: 'diagonal' },
  { from: 'pronasale', to: 'zygion_left', type: 'diagonal' },
  { from: 'pronasale', to: 'zygion_right', type: 'diagonal' },
  { from: 'subnasale', to: 'cheilion_left', type: 'diagonal' },
  { from: 'subnasale', to: 'cheilion_right', type: 'diagonal' },
  { from: 'labiale_superius', to: 'cheilion_left', type: 'diagonal' },
  { from: 'labiale_superius', to: 'cheilion_right', type: 'diagonal' },
  { from: 'cheilion_left', to: 'gonion_left', type: 'diagonal' },
  { from: 'cheilion_right', to: 'gonion_right', type: 'diagonal' },
  { from: 'labiale_inferius', to: 'gonion_left', type: 'diagonal' },
  { from: 'labiale_inferius', to: 'gonion_right', type: 'diagonal' },
  { from: 'gnathion', to: 'gonion_left', type: 'diagonal' },
  { from: 'gnathion', to: 'gonion_right', type: 'diagonal' },
  { from: 'zygion_left', to: 'cheilion_left', type: 'diagonal' },
  { from: 'zygion_right', to: 'cheilion_right', type: 'diagonal' },
];

// Função helper para obter conexões baseado na densidade
export const getConnectionsByDensity = (density: MeshDensity, points?: FacialPoint[]): FacialConnection[] => {
  // Se temos pontos, gerar conexões dinamicamente
  if (points && points.length > 20) {
    return generateConnectionsFromPoints(points, density);
  }
  // Fallback para conexões estáticas (pontos antigos)
  return density === 'simple' ? SIMPLE_CONNECTIONS : DENSE_CONNECTIONS;
};

// Manter compatibilidade - DEFAULT_CONNECTIONS agora é o denso
export const DEFAULT_CONNECTIONS = DENSE_CONNECTIONS;

// Nomes amigáveis para exibição
export const POINT_LABELS: Record<string, string> = {
  // Testa
  trichion: 'Tríquio',
  metopion: 'Métopion',
  glabella: 'Glabela',
  temple_left: 'Têmpora E',
  temple_right: 'Têmpora D',
  
  // Sobrancelhas
  supercilium_left_1: 'Sobrancelha E1',
  supercilium_left_2: 'Sobrancelha E2',
  supercilium_left_3: 'Sobrancelha E3',
  supercilium_left_4: 'Sobrancelha E4',
  supercilium_left_5: 'Sobrancelha E5',
  supercilium_right_1: 'Sobrancelha D1',
  supercilium_right_2: 'Sobrancelha D2',
  supercilium_right_3: 'Sobrancelha D3',
  supercilium_right_4: 'Sobrancelha D4',
  supercilium_right_5: 'Sobrancelha D5',
  
  // Olhos
  orbitale_left_inner: 'Canto Int. Olho E',
  orbitale_left_outer: 'Canto Ext. Olho E',
  orbitale_right_inner: 'Canto Int. Olho D',
  orbitale_right_outer: 'Canto Ext. Olho D',
  pupil_left: 'Pupila E',
  pupil_right: 'Pupila D',
  palpebra_sup_left_1: 'Pálpebra Sup E1',
  palpebra_sup_left_2: 'Pálpebra Sup E2',
  palpebra_sup_left_3: 'Pálpebra Sup E3',
  palpebra_inf_left_1: 'Pálpebra Inf E1',
  palpebra_inf_left_2: 'Pálpebra Inf E2',
  palpebra_inf_left_3: 'Pálpebra Inf E3',
  palpebra_sup_right_1: 'Pálpebra Sup D1',
  palpebra_sup_right_2: 'Pálpebra Sup D2',
  palpebra_sup_right_3: 'Pálpebra Sup D3',
  palpebra_inf_right_1: 'Pálpebra Inf D1',
  palpebra_inf_right_2: 'Pálpebra Inf D2',
  palpebra_inf_right_3: 'Pálpebra Inf D3',
  
  // Nariz
  nasion: 'Násion',
  rhinion: 'Rínnion',
  pronasale: 'Pronasale',
  subnasale: 'Subnasale',
  dorsum_1: 'Dorso Nasal 1',
  dorsum_2: 'Dorso Nasal 2',
  dorsum_3: 'Dorso Nasal 3',
  alar_left_1: 'Asa Nasal E1',
  alar_left_2: 'Asa Nasal E2',
  alar_left_3: 'Asa Nasal E3',
  alar_right_1: 'Asa Nasal D1',
  alar_right_2: 'Asa Nasal D2',
  alar_right_3: 'Asa Nasal D3',
  columella_left: 'Columela E',
  columella_right: 'Columela D',
  
  // Boca
  philtrum_left: 'Filtro E',
  philtrum_right: 'Filtro D',
  cupid_bow_left: 'Arco Cupido E',
  cupid_bow_center: 'Arco Cupido C',
  cupid_bow_right: 'Arco Cupido D',
  labiale_superius: 'Lábio Superior',
  labiale_inferius: 'Lábio Inferior',
  stomion: 'Estomion',
  cheilion_left: 'Comissura E',
  cheilion_right: 'Comissura D',
  vermillion_sup_left_1: 'Vermelhão Sup E1',
  vermillion_sup_left_2: 'Vermelhão Sup E2',
  vermillion_sup_left_3: 'Vermelhão Sup E3',
  vermillion_sup_right_1: 'Vermelhão Sup D1',
  vermillion_sup_right_2: 'Vermelhão Sup D2',
  vermillion_sup_right_3: 'Vermelhão Sup D3',
  vermillion_inf_left_1: 'Vermelhão Inf E1',
  vermillion_inf_left_2: 'Vermelhão Inf E2',
  vermillion_inf_right_1: 'Vermelhão Inf D1',
  vermillion_inf_right_2: 'Vermelhão Inf D2',
  
  // Queixo
  labiomental_crease: 'Sulco Labiomental',
  pogonion: 'Pogônio',
  gnathion: 'Gnátio',
  menton: 'Mento',
  
  // Mandíbula
  gonion_left: 'Gônio E',
  gonion_right: 'Gônio D',
  mandible_left_1: 'Mandíbula E1',
  mandible_left_2: 'Mandíbula E2',
  mandible_left_3: 'Mandíbula E3',
  mandible_left_4: 'Mandíbula E4',
  mandible_left_5: 'Mandíbula E5',
  mandible_right_1: 'Mandíbula D1',
  mandible_right_2: 'Mandíbula D2',
  mandible_right_3: 'Mandíbula D3',
  mandible_right_4: 'Mandíbula D4',
  mandible_right_5: 'Mandíbula D5',
  
  // Bochechas
  zygion_left: 'Zigomático E',
  zygion_right: 'Zigomático D',
  malar_left: 'Malar E',
  malar_right: 'Malar D',
  cheek_left_1: 'Bochecha E1',
  cheek_left_2: 'Bochecha E2',
  cheek_left_3: 'Bochecha E3',
  cheek_left_4: 'Bochecha E4',
  cheek_left_5: 'Bochecha E5',
  cheek_right_1: 'Bochecha D1',
  cheek_right_2: 'Bochecha D2',
  cheek_right_3: 'Bochecha D3',
  cheek_right_4: 'Bochecha D4',
  cheek_right_5: 'Bochecha D5',
  
  // Orelhas
  tragus_left: 'Trago E',
  tragus_right: 'Trago D',
  antitragus_left: 'Antitrago E',
  antitragus_right: 'Antitrago D',
  lobule_left: 'Lóbulo E',
  lobule_right: 'Lóbulo D',
  helix_left_1: 'Helix E1',
  helix_left_2: 'Helix E2',
  helix_left_3: 'Helix E3',
  helix_right_1: 'Helix D1',
  helix_right_2: 'Helix D2',
  helix_right_3: 'Helix D3',
};

// Pares de pontos espelhados para análise de simetria (expandido)
export const MIRRORED_POINT_PAIRS: Array<{ left: string; right: string; label: string }> = [
  // Têmporas
  { left: 'temple_left', right: 'temple_right', label: 'Têmporas' },
  
  // Sobrancelhas
  { left: 'supercilium_left_1', right: 'supercilium_right_1', label: 'Sobrancelhas Int.' },
  { left: 'supercilium_left_3', right: 'supercilium_right_3', label: 'Sobrancelhas Med.' },
  { left: 'supercilium_left_5', right: 'supercilium_right_5', label: 'Sobrancelhas Ext.' },
  
  // Olhos
  { left: 'orbitale_left_inner', right: 'orbitale_right_inner', label: 'Cantos Int. Olhos' },
  { left: 'orbitale_left_outer', right: 'orbitale_right_outer', label: 'Cantos Ext. Olhos' },
  { left: 'pupil_left', right: 'pupil_right', label: 'Pupilas' },
  { left: 'palpebra_sup_left_2', right: 'palpebra_sup_right_2', label: 'Pálpebras Sup.' },
  { left: 'palpebra_inf_left_2', right: 'palpebra_inf_right_2', label: 'Pálpebras Inf.' },
  
  // Nariz
  { left: 'alar_left_2', right: 'alar_right_2', label: 'Asas Nasais' },
  { left: 'columella_left', right: 'columella_right', label: 'Columela' },
  
  // Boca
  { left: 'philtrum_left', right: 'philtrum_right', label: 'Filtro' },
  { left: 'cupid_bow_left', right: 'cupid_bow_right', label: 'Arco Cupido' },
  { left: 'cheilion_left', right: 'cheilion_right', label: 'Comissuras Labiais' },
  { left: 'vermillion_sup_left_2', right: 'vermillion_sup_right_2', label: 'Vermelhão Sup.' },
  { left: 'vermillion_inf_left_1', right: 'vermillion_inf_right_1', label: 'Vermelhão Inf.' },
  
  // Bochechas
  { left: 'zygion_left', right: 'zygion_right', label: 'Zigomáticos' },
  { left: 'malar_left', right: 'malar_right', label: 'Malares' },
  { left: 'cheek_left_3', right: 'cheek_right_3', label: 'Bochechas' },
  
  // Mandíbula
  { left: 'gonion_left', right: 'gonion_right', label: 'Gônios' },
  { left: 'mandible_left_3', right: 'mandible_right_3', label: 'Mandíbula Med.' },
  
  // Orelhas
  { left: 'tragus_left', right: 'tragus_right', label: 'Tragos' },
  { left: 'lobule_left', right: 'lobule_right', label: 'Lóbulos' },
];

// Interface para resultado de simetria
export interface SymmetryResult {
  overallScore: number; // 0-100, onde 100 é perfeitamente simétrico
  pairs: Array<{
    label: string;
    leftPoint: string;
    rightPoint: string;
    deviation: number; // 0-100, onde 0 é perfeito
    verticalDiff: number; // diferença vertical normalizada
    horizontalDiff: number; // diferença horizontal (distância do eixo central)
  }>;
}
