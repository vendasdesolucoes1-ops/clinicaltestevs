// Tipos para os landmarks faciais e mesh de simetria

export interface FacialPoint {
  id: string;
  name: string;
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  category: 'forehead' | 'eyes' | 'nose' | 'mouth' | 'chin' | 'contour';
}

export interface FacialConnection {
  from: string;
  to: string;
  type: 'horizontal' | 'vertical' | 'diagonal' | 'contour';
}

export type MeshDensity = 'simple' | 'dense';

export interface FacialMeshData {
  points: FacialPoint[];
  connections: FacialConnection[];
}

// Conexões SIMPLES - linhas principais de simetria
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

// Conexões DENSAS - triangulação completa para análise detalhada
export const DENSE_CONNECTIONS: FacialConnection[] = [
  // Inclui todas as conexões simples
  ...SIMPLE_CONNECTIONS,
  
  // Conexões dos olhos
  { from: 'orbitale_left_inner', to: 'orbitale_left_outer', type: 'horizontal' },
  { from: 'orbitale_right_inner', to: 'orbitale_right_outer', type: 'horizontal' },
  
  // Diagonais da testa para os olhos - Esquerdo
  { from: 'glabella', to: 'orbitale_left_inner', type: 'diagonal' },
  { from: 'glabella', to: 'orbitale_right_inner', type: 'diagonal' },
  { from: 'temple_left', to: 'orbitale_left_outer', type: 'diagonal' },
  { from: 'temple_right', to: 'orbitale_right_outer', type: 'diagonal' },
  
  // Diagonais do nariz
  { from: 'nasion', to: 'orbitale_left_inner', type: 'diagonal' },
  { from: 'nasion', to: 'orbitale_right_inner', type: 'diagonal' },
  { from: 'nasion', to: 'orbitale_left_outer', type: 'diagonal' },
  { from: 'nasion', to: 'orbitale_right_outer', type: 'diagonal' },
  
  // Diagonais zigomáticas
  { from: 'orbitale_left_outer', to: 'zygion_left', type: 'diagonal' },
  { from: 'orbitale_right_outer', to: 'zygion_right', type: 'diagonal' },
  { from: 'pronasale', to: 'zygion_left', type: 'diagonal' },
  { from: 'pronasale', to: 'zygion_right', type: 'diagonal' },
  
  // Diagonais da boca
  { from: 'subnasale', to: 'cheilion_left', type: 'diagonal' },
  { from: 'subnasale', to: 'cheilion_right', type: 'diagonal' },
  { from: 'labiale_superius', to: 'cheilion_left', type: 'diagonal' },
  { from: 'labiale_superius', to: 'cheilion_right', type: 'diagonal' },
  
  // Diagonais do queixo
  { from: 'cheilion_left', to: 'gonion_left', type: 'diagonal' },
  { from: 'cheilion_right', to: 'gonion_right', type: 'diagonal' },
  { from: 'labiale_inferius', to: 'gonion_left', type: 'diagonal' },
  { from: 'labiale_inferius', to: 'gonion_right', type: 'diagonal' },
  { from: 'gnathion', to: 'gonion_left', type: 'diagonal' },
  { from: 'gnathion', to: 'gonion_right', type: 'diagonal' },
  
  // Conexões cruzadas para triangulação
  { from: 'zygion_left', to: 'cheilion_left', type: 'diagonal' },
  { from: 'zygion_right', to: 'cheilion_right', type: 'diagonal' },
  { from: 'zygion_left', to: 'pronasale', type: 'diagonal' },
  { from: 'zygion_right', to: 'pronasale', type: 'diagonal' },
];

// Função helper para obter conexões baseado na densidade
export const getConnectionsByDensity = (density: MeshDensity): FacialConnection[] => {
  return density === 'simple' ? SIMPLE_CONNECTIONS : DENSE_CONNECTIONS;
};

// Manter compatibilidade - DEFAULT_CONNECTIONS agora é o denso
export const DEFAULT_CONNECTIONS = DENSE_CONNECTIONS;

// Nomes amigáveis para exibição
export const POINT_LABELS: Record<string, string> = {
  glabella: 'Glabela',
  nasion: 'Násion',
  pronasale: 'Pronasale',
  subnasale: 'Subnasale',
  labiale_superius: 'Lábio Superior',
  labiale_inferius: 'Lábio Inferior',
  gnathion: 'Gnátio',
  orbitale_left_inner: 'Canto Int. Olho E',
  orbitale_left_outer: 'Canto Ext. Olho E',
  orbitale_right_inner: 'Canto Int. Olho D',
  orbitale_right_outer: 'Canto Ext. Olho D',
  cheilion_left: 'Comissura E',
  cheilion_right: 'Comissura D',
  zygion_left: 'Zigomático E',
  zygion_right: 'Zigomático D',
  gonion_left: 'Gônio E',
  gonion_right: 'Gônio D',
  temple_left: 'Têmpora E',
  temple_right: 'Têmpora D',
};
