// Types for clinical-first tools and anatomical measurements

// ============= CLINICAL TOOL TYPES =============

export type ClinicalToolType = 
  | 'select'           // Selecionar objetos
  | 'correction_vector' // Vetor de Correção (ex-Puxar Pele)
  | 'intervention_area' // Área de Intervenção (ex-Volume)
  | 'surgical_marking'  // Marcação Cirúrgica (ex-Incisão/Sutura)
  | 'annotate'         // Anotações
  | 'eraser'           // Borracha
  | 'measure'          // Medir distância
  | 'angle';           // Medir ângulo

// Legacy mapping for backwards compatibility
export const LEGACY_TOOL_MAP: Record<string, ClinicalToolType> = {
  'warp': 'select',
  'select': 'correction_vector',
  'volume': 'intervention_area',
  'incision': 'surgical_marking',
  'suture': 'surgical_marking',
};

// ============= CORRECTION VECTOR =============

export interface CorrectionVector {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  magnitudePx: number;
  magnitudeMm?: number;
  direction: string; // 'superior', 'inferior', 'lateral', 'medial', etc.
  procedure?: string;
  notes?: string;
}

export const CORRECTION_PROCEDURES = [
  { value: 'lifting', label: 'Lifting Facial' },
  { value: 'blefaroplastia', label: 'Blefaroplastia' },
  { value: 'ritidoplastia', label: 'Ritidoplastia' },
  { value: 'reposicionamento', label: 'Reposicionamento Tecidual' },
  { value: 'suspensao', label: 'Suspensão' },
  { value: 'outro', label: 'Outro' },
] as const;

export const DIRECTION_LABELS: Record<string, string> = {
  'superior': '↑ Superior',
  'inferior': '↓ Inferior',
  'lateral_left': '← Lateral E',
  'lateral_right': '→ Lateral D',
  'superior_lateral_left': '↖ Sup-Lat E',
  'superior_lateral_right': '↗ Sup-Lat D',
  'inferior_lateral_left': '↙ Inf-Lat E',
  'inferior_lateral_right': '↘ Inf-Lat D',
  'medial': '→← Medial',
};

export function calculateDirection(startX: number, startY: number, endX: number, endY: number): string {
  const dx = endX - startX;
  const dy = endY - startY;
  const angle = Math.atan2(-dy, dx) * (180 / Math.PI); // Negative dy because Y increases downward
  
  // 8 directions based on angle
  if (angle >= -22.5 && angle < 22.5) return 'lateral_right';
  if (angle >= 22.5 && angle < 67.5) return 'superior_lateral_right';
  if (angle >= 67.5 && angle < 112.5) return 'superior';
  if (angle >= 112.5 && angle < 157.5) return 'superior_lateral_left';
  if (angle >= 157.5 || angle < -157.5) return 'lateral_left';
  if (angle >= -157.5 && angle < -112.5) return 'inferior_lateral_left';
  if (angle >= -112.5 && angle < -67.5) return 'inferior';
  if (angle >= -67.5 && angle < -22.5) return 'inferior_lateral_right';
  
  return 'lateral_right';
}

// ============= INTERVENTION AREA =============

export type InterventionType = 
  | 'preenchimento'
  | 'resseccao'
  | 'lifting'
  | 'implante'
  | 'enxerto'
  | 'outro';

export interface InterventionArea {
  id: string;
  centerX: number;
  centerY: number;
  radius: number;
  type: InterventionType;
  areaPx2: number;
  areaMm2?: number;
  estimatedVolumeMl?: number;
  notes?: string;
}

export const INTERVENTION_TYPES = [
  { value: 'preenchimento', label: 'Preenchimento', color: 'rgba(34, 197, 94, 0.4)', icon: '+' },
  { value: 'resseccao', label: 'Ressecção', color: 'rgba(239, 68, 68, 0.4)', icon: '−' },
  { value: 'lifting', label: 'Lifting', color: 'rgba(249, 115, 22, 0.4)', icon: '↑' },
  { value: 'implante', label: 'Implante', color: 'rgba(59, 130, 246, 0.4)', icon: '◆' },
  { value: 'enxerto', label: 'Enxerto', color: 'rgba(168, 85, 247, 0.4)', icon: '◇' },
  { value: 'outro', label: 'Outro', color: 'rgba(107, 114, 128, 0.4)', icon: '○' },
] as const;

// ============= SURGICAL MARKING =============

export type MarkingType = 
  | 'incision_line'
  | 'dissection_limit'
  | 'resection_area'
  | 'suture_line'
  | 'reference_line';

export interface SurgicalMarking {
  id: string;
  type: MarkingType;
  points: Array<{ x: number; y: number }>;
  lengthPx: number;
  lengthMm?: number;
  technique?: string;
  notes?: string;
}

export const MARKING_TYPES = [
  { value: 'incision_line', label: 'Linha de Incisão', color: '#ef4444', style: 'solid' },
  { value: 'dissection_limit', label: 'Limite de Descolamento', color: '#f97316', style: 'dashed' },
  { value: 'resection_area', label: 'Área de Ressecção', color: '#dc2626', style: 'dotted' },
  { value: 'suture_line', label: 'Linha de Sutura', color: '#8b5cf6', style: 'solid' },
  { value: 'reference_line', label: 'Linha de Referência', color: '#6b7280', style: 'dashed' },
] as const;

export const SURGICAL_TECHNIQUES = [
  { value: 'incisao_linear', label: 'Incisão Linear' },
  { value: 'zetaplastia', label: 'Zetaplastia' },
  { value: 'wplastia', label: 'W-plastia' },
  { value: 'subcuticular', label: 'Subcuticular' },
  { value: 'ponto_simples', label: 'Ponto Simples' },
  { value: 'donati', label: 'Donati' },
  { value: 'colchoeiro', label: 'Colchoeiro' },
] as const;

// ============= ANATOMICAL MEASUREMENTS =============

export interface AnatomicalMeasurement {
  id: string;
  name: string;
  namePt: string;
  value: number; // in mm
  reference: { min: number; max: number };
  unit: 'mm' | 'ratio' | 'percent';
  status: 'normal' | 'warning' | 'critical';
  description?: string;
}

export interface FacialThirds {
  upper: { value: number; percent: number };
  middle: { value: number; percent: number };
  lower: { value: number; percent: number };
  isProportional: boolean;
}

export interface AnatomicalMeasurements {
  intercanthalDistance?: AnatomicalMeasurement;
  nasalWidth?: AnatomicalMeasurement;
  mouthWidth?: AnatomicalMeasurement;
  facialWidth?: AnatomicalMeasurement;
  facialHeight?: AnatomicalMeasurement;
  facialThirds?: FacialThirds;
  goldenRatio?: AnatomicalMeasurement;
}

// Reference values for facial measurements (in mm for average adult)
export const MEASUREMENT_REFERENCES = {
  intercanthalDistance: { min: 30, max: 35, ideal: 32 },
  nasalWidth: { min: 30, max: 35, ideal: 32 }, // Should equal intercanthal
  mouthWidth: { min: 45, max: 55, ideal: 50 },
  facialWidth: { min: 120, max: 150, ideal: 135 },
  facialHeight: { min: 170, max: 210, ideal: 190 },
};

// Golden ratio (phi) for facial proportions
export const PHI = 1.618;

// ============= CLINICAL PANEL SECTIONS =============

export type ClinicalSection = 'avaliacao' | 'planejamento' | 'documentacao';

export interface ClinicalSectionConfig {
  id: ClinicalSection;
  label: string;
  icon: string;
  description: string;
}

export const CLINICAL_SECTIONS: ClinicalSectionConfig[] = [
  {
    id: 'avaliacao',
    label: 'Avaliação',
    icon: '📋',
    description: 'Análise facial, simetria e medidas anatômicas',
  },
  {
    id: 'planejamento',
    label: 'Planejamento',
    icon: '🎯',
    description: 'Vetores de correção, áreas de intervenção e marcações',
  },
  {
    id: 'documentacao',
    label: 'Documentação',
    icon: '📊',
    description: 'Exportação, relatórios e histórico',
  },
];
