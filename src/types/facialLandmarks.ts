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

export interface FacialMeshData {
  points: FacialPoint[];
  connections: FacialConnection[];
}

// Conexões padrão para criar o mesh de simetria
export const DEFAULT_CONNECTIONS: FacialConnection[] = [
  // Linha central vertical
  { from: 'glabella', to: 'nasion', type: 'vertical' },
  { from: 'nasion', to: 'pronasale', type: 'vertical' },
  { from: 'pronasale', to: 'subnasale', type: 'vertical' },
  { from: 'subnasale', to: 'labiale_superius', type: 'vertical' },
  { from: 'labiale_superius', to: 'labiale_inferius', type: 'vertical' },
  { from: 'labiale_inferius', to: 'gnathion', type: 'vertical' },
  
  // Linhas horizontais - Olhos
  { from: 'orbitale_left_inner', to: 'orbitale_right_inner', type: 'horizontal' },
  { from: 'orbitale_left_outer', to: 'orbitale_right_outer', type: 'horizontal' },
  
  // Linhas horizontais - Boca
  { from: 'cheilion_left', to: 'cheilion_right', type: 'horizontal' },
  
  // Linhas horizontais - Contorno
  { from: 'zygion_left', to: 'zygion_right', type: 'horizontal' },
  { from: 'gonion_left', to: 'gonion_right', type: 'horizontal' },
  
  // Diagonais para triangulação - Lado esquerdo
  { from: 'glabella', to: 'orbitale_left_inner', type: 'diagonal' },
  { from: 'nasion', to: 'orbitale_left_inner', type: 'diagonal' },
  { from: 'nasion', to: 'orbitale_left_outer', type: 'diagonal' },
  { from: 'pronasale', to: 'zygion_left', type: 'diagonal' },
  { from: 'subnasale', to: 'cheilion_left', type: 'diagonal' },
  { from: 'cheilion_left', to: 'gonion_left', type: 'diagonal' },
  { from: 'gnathion', to: 'gonion_left', type: 'diagonal' },
  
  // Diagonais para triangulação - Lado direito
  { from: 'glabella', to: 'orbitale_right_inner', type: 'diagonal' },
  { from: 'nasion', to: 'orbitale_right_inner', type: 'diagonal' },
  { from: 'nasion', to: 'orbitale_right_outer', type: 'diagonal' },
  { from: 'pronasale', to: 'zygion_right', type: 'diagonal' },
  { from: 'subnasale', to: 'cheilion_right', type: 'diagonal' },
  { from: 'cheilion_right', to: 'gonion_right', type: 'diagonal' },
  { from: 'gnathion', to: 'gonion_right', type: 'diagonal' },
  
  // Contorno facial
  { from: 'temple_left', to: 'zygion_left', type: 'contour' },
  { from: 'zygion_left', to: 'gonion_left', type: 'contour' },
  { from: 'gonion_left', to: 'gnathion', type: 'contour' },
  { from: 'gnathion', to: 'gonion_right', type: 'contour' },
  { from: 'gonion_right', to: 'zygion_right', type: 'contour' },
  { from: 'zygion_right', to: 'temple_right', type: 'contour' },
  
  // Conexões dos olhos
  { from: 'orbitale_left_inner', to: 'orbitale_left_outer', type: 'horizontal' },
  { from: 'orbitale_right_inner', to: 'orbitale_right_outer', type: 'horizontal' },
];

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
