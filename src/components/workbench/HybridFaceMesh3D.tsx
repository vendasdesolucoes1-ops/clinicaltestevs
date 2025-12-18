import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { RotateCcw, ZoomIn, ZoomOut, Grid3X3, Layers, Settings2, User, Square, MoveVertical, Zap, Scale, Maximize, Move, ArrowUpDown, ArrowLeftRight } from 'lucide-react';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import type { Landmark3D } from '@/types/faceMesh3D';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

interface DeformationParams {
  intensity: number;
  influenceRadius: number;
  depthScale: number;
}

interface UVAdjustments {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  flipVertical: boolean;
}

interface AnatomicalProportions {
  eyeDistance: number;         // Distância entre centros dos olhos
  faceWidth: number;           // Largura do rosto (jawline)
  faceHeight: number;          // Altura do rosto (testa ao queixo)
  noseWidth: number;           // Largura do nariz (asas)
  mouthWidth: number;          // Largura da boca
  eyeLevel: number;            // Posição vertical dos olhos (0-1)
  noseLevel: number;           // Posição vertical do nariz (0-1)
  mouthLevel: number;          // Posição vertical da boca (0-1)
  faceCenter: { x: number; y: number };  // Centro do rosto
}

interface FaceROI {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

type FacialPreset = 'custom' | 'oval' | 'quadrado' | 'alongado';
type MeshDensity = 'rapido' | 'balanceado' | 'maximo';

// ============================================================================
// LANDMARKS ANATÔMICOS - MEDIAPIPE (468 PONTOS)
// ============================================================================
// Índices específicos para medições anatômicas precisas

const ANATOMICAL_LANDMARKS = {
  // Olhos - centros para distância interocular
  leftEyeCenter: 468,        // Centro do olho esquerdo (calculado)
  rightEyeCenter: 473,       // Centro do olho direito (calculado)
  leftEyeInner: 133,
  leftEyeOuter: 33,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  
  // Nariz
  noseTip: 1,
  noseBridge: 6,
  noseLeft: 129,             // Asa esquerda do nariz
  noseRight: 358,            // Asa direita do nariz
  
  // Boca
  mouthLeft: 61,
  mouthRight: 291,
  mouthTop: 0,
  mouthBottom: 17,
  
  // Contorno facial
  foreheadTop: 10,
  chin: 152,
  leftJawline: 234,
  rightJawline: 454,
  leftTemple: 127,
  rightTemple: 356,
  
  // Sobrancelhas
  leftEyebrowInner: 55,
  leftEyebrowOuter: 105,
  rightEyebrowInner: 285,
  rightEyebrowOuter: 334,
};

// Proporções de referência do modelo LeePerrySmith (normalizadas)
const GLTF_REFERENCE_PROPORTIONS: AnatomicalProportions = {
  eyeDistance: 0.24,
  faceWidth: 0.58,
  faceHeight: 0.75,
  noseWidth: 0.12,
  mouthWidth: 0.18,
  eyeLevel: 0.38,
  noseLevel: 0.55,
  mouthLevel: 0.68,
  faceCenter: { x: 0.5, y: 0.45 },
};

// Presets otimizados para tipos faciais
const FACIAL_PRESETS: Record<Exclude<FacialPreset, 'custom'>, { params: DeformationParams; description: string }> = {
  oval: {
    params: { intensity: 0.45, influenceRadius: 0.55, depthScale: 0.5 },
    description: 'Rosto oval/equilibrado - suavidade natural',
  },
  quadrado: {
    params: { intensity: 0.6, influenceRadius: 0.4, depthScale: 0.65 },
    description: 'Maxilar pronunciado - ênfase angular',
  },
  alongado: {
    params: { intensity: 0.5, influenceRadius: 0.65, depthScale: 0.4 },
    description: 'Rosto alongado - proporções verticais',
  },
};

// Descrições das densidades
const DENSITY_INFO: Record<MeshDensity, { points: number; description: string }> = {
  rapido: { points: 24, description: 'Rápido - 24 pontos principais' },
  balanceado: { points: 114, description: 'Balanceado - 114 pontos estratégicos' },
  maximo: { points: 468, description: 'Máximo - Todos os 468 landmarks' },
};

// ============================================================================
// FUNÇÕES DE MEDIÇÃO ANATÔMICA
// ============================================================================

function distance2D(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getLandmarkSafe(landmarks: Landmark3D[], idx: number): Landmark3D | null {
  return idx < landmarks.length ? landmarks[idx] : null;
}

/**
 * Calcula proporções anatômicas do rosto do paciente a partir dos landmarks MediaPipe
 */
function calculatePatientProportions(landmarks: Landmark3D[]): AnatomicalProportions | null {
  if (landmarks.length < 400) return null;
  
  const getL = (idx: number) => getLandmarkSafe(landmarks, idx);
  
  // Pontos essenciais
  const leftEyeInner = getL(ANATOMICAL_LANDMARKS.leftEyeInner);
  const leftEyeOuter = getL(ANATOMICAL_LANDMARKS.leftEyeOuter);
  const rightEyeInner = getL(ANATOMICAL_LANDMARKS.rightEyeInner);
  const rightEyeOuter = getL(ANATOMICAL_LANDMARKS.rightEyeOuter);
  const noseTip = getL(ANATOMICAL_LANDMARKS.noseTip);
  const noseLeft = getL(ANATOMICAL_LANDMARKS.noseLeft);
  const noseRight = getL(ANATOMICAL_LANDMARKS.noseRight);
  const mouthLeft = getL(ANATOMICAL_LANDMARKS.mouthLeft);
  const mouthRight = getL(ANATOMICAL_LANDMARKS.mouthRight);
  const foreheadTop = getL(ANATOMICAL_LANDMARKS.foreheadTop);
  const chin = getL(ANATOMICAL_LANDMARKS.chin);
  const leftJawline = getL(ANATOMICAL_LANDMARKS.leftJawline);
  const rightJawline = getL(ANATOMICAL_LANDMARKS.rightJawline);
  
  // Verificar pontos essenciais
  if (!leftEyeInner || !leftEyeOuter || !rightEyeInner || !rightEyeOuter ||
      !noseTip || !noseLeft || !noseRight || !mouthLeft || !mouthRight ||
      !foreheadTop || !chin || !leftJawline || !rightJawline) {
    return null;
  }
  
  // Calcular centros dos olhos
  const leftEyeCenter = {
    x: (leftEyeInner.x + leftEyeOuter.x) / 2,
    y: (leftEyeInner.y + leftEyeOuter.y) / 2,
  };
  const rightEyeCenter = {
    x: (rightEyeInner.x + rightEyeOuter.x) / 2,
    y: (rightEyeInner.y + rightEyeOuter.y) / 2,
  };
  
  // Calcular todas as medidas (normalizadas 0-1)
  const eyeDistance = distance2D(leftEyeCenter, rightEyeCenter);
  const faceWidth = distance2D(leftJawline, rightJawline);
  const faceHeight = distance2D(foreheadTop, chin);
  const noseWidth = distance2D(noseLeft, noseRight);
  const mouthWidth = distance2D(mouthLeft, mouthRight);
  
  // Calcular posições verticais relativas (proporção do topo ao queixo)
  const eyeLevel = ((leftEyeCenter.y + rightEyeCenter.y) / 2 - foreheadTop.y) / faceHeight;
  const noseLevel = (noseTip.y - foreheadTop.y) / faceHeight;
  const mouthLevel = ((mouthLeft.y + mouthRight.y) / 2 - foreheadTop.y) / faceHeight;
  
  // Calcular centro do rosto
  const faceCenter = {
    x: (leftJawline.x + rightJawline.x) / 2,
    y: (foreheadTop.y + chin.y) / 2,
  };
  
  return {
    eyeDistance,
    faceWidth,
    faceHeight,
    noseWidth,
    mouthWidth,
    eyeLevel,
    noseLevel,
    mouthLevel,
    faceCenter,
  };
}

/**
 * Calcula Face ROI (bounding box) a partir dos landmarks
 */
function calculateFaceROI(landmarks: Landmark3D[]): FaceROI | null {
  if (landmarks.length === 0) return null;
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  landmarks.forEach(lm => {
    minX = Math.min(minX, lm.x);
    maxX = Math.max(maxX, lm.x);
    minY = Math.min(minY, lm.y);
    maxY = Math.max(maxY, lm.y);
  });
  
  // Adicionar padding de 5% para margem
  const paddingX = (maxX - minX) * 0.05;
  const paddingY = (maxY - minY) * 0.05;
  minX = Math.max(0, minX - paddingX);
  maxX = Math.min(1, maxX + paddingX);
  minY = Math.max(0, minY - paddingY);
  maxY = Math.min(1, maxY + paddingY);
  
  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calcula fatores de escala para adaptar o modelo às proporções do paciente
 */
function calculateScaleFactors(
  patientProps: AnatomicalProportions,
  referenceProps: AnatomicalProportions
): { scaleX: number; scaleY: number; offsetY: number } {
  // Fator de escala horizontal baseado na largura do rosto
  const scaleX = patientProps.faceWidth / referenceProps.faceWidth;
  
  // Fator de escala vertical baseado na altura do rosto
  const scaleY = patientProps.faceHeight / referenceProps.faceHeight;
  
  // Offset vertical para alinhar olhos/nariz/boca
  const avgPatientLevel = (patientProps.eyeLevel + patientProps.noseLevel + patientProps.mouthLevel) / 3;
  const avgRefLevel = (referenceProps.eyeLevel + referenceProps.noseLevel + referenceProps.mouthLevel) / 3;
  const offsetY = (avgPatientLevel - avgRefLevel) * 0.5;
  
  return { scaleX, scaleY, offsetY };
}

// ============================================================================
// LANDMARK MAPPINGS POR DENSIDADE
// ============================================================================

const LANDMARK_MAPPING_RAPIDO = {
  noseTip: 1, noseBottom: 2, noseBridge: 6,
  leftEyeInner: 133, leftEyeOuter: 33, rightEyeInner: 362, rightEyeOuter: 263,
  leftEyebrowInner: 55, leftEyebrowOuter: 105, rightEyebrowInner: 285, rightEyebrowOuter: 334,
  mouthLeft: 61, mouthRight: 291, mouthTop: 0, mouthBottom: 17,
  upperLipTop: 13, lowerLipBottom: 14, chin: 152,
  leftCheek: 234, rightCheek: 454, foreheadCenter: 10,
  leftJaw: 172, rightJaw: 397, foreheadTop: 151,
};

const LANDMARK_MAPPING_BALANCEADO = {
  jawline: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400],
  leftEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  rightEye: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  leftEyebrow: [70, 63, 105, 66, 107, 55, 65, 52],
  rightEyebrow: [336, 296, 334, 293, 300, 285, 295, 282],
  nose: [1, 2, 6, 8, 168, 197, 195, 5, 4, 19, 94, 370, 462, 250, 290],
  mouthOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405],
  mouthInner: [78, 191, 80, 81, 82, 13, 312, 311],
  cheeks: [234, 93, 132, 58, 454, 323, 361, 288],
  forehead: [10, 151, 9, 8],
};

const REGION_WEIGHTS: Record<string, number> = {
  jawline: 0.9, leftEye: 1.0, rightEye: 1.0,
  leftEyebrow: 0.85, rightEyebrow: 0.85, nose: 0.95,
  mouthOuter: 0.9, mouthInner: 0.95, cheeks: 0.7, forehead: 0.6, default: 0.8,
};

function getLandmarksByDensity(
  density: MeshDensity, 
  allLandmarks: Landmark3D[]
): { landmarks: Landmark3D[]; weights: number[] } {
  const result: Landmark3D[] = [];
  const weights: number[] = [];
  
  if (density === 'rapido') {
    Object.values(LANDMARK_MAPPING_RAPIDO).forEach(idx => {
      if (idx < allLandmarks.length) {
        result.push(allLandmarks[idx]);
        weights.push(REGION_WEIGHTS.default);
      }
    });
  } else if (density === 'balanceado') {
    Object.entries(LANDMARK_MAPPING_BALANCEADO).forEach(([region, indices]) => {
      const regionWeight = REGION_WEIGHTS[region] || REGION_WEIGHTS.default;
      indices.forEach(idx => {
        if (idx < allLandmarks.length) {
          result.push(allLandmarks[idx]);
          weights.push(regionWeight);
        }
      });
    });
  } else {
    allLandmarks.forEach((lm) => {
      result.push(lm);
      const yWeight = lm.y > 0.3 && lm.y < 0.6 ? 1.0 : 0.75;
      weights.push(yWeight);
    });
  }
  
  return { landmarks: result, weights };
}

// ============================================================================
// COMPONENTE DE MESH COM ADAPTAÇÃO ANATÔMICA
// ============================================================================

interface HybridFaceMesh3DProps {
  landmarks: Landmark3D[];
  imageUrl?: string;
  wireframe?: boolean;
  opacity?: number;
}

const DeformedGLTFMesh: React.FC<{
  landmarks: Landmark3D[];
  imageUrl?: string;
  wireframe: boolean;
  opacity: number;
  deformParams: DeformationParams;
  density: MeshDensity;
  adaptProportions: boolean;
  uvAdjustments: UVAdjustments;
}> = ({ landmarks, imageUrl, wireframe, opacity, deformParams, density, adaptProportions, uvAdjustments }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { scene } = useGLTF('/models/LeePerrySmith.glb');
  
  const texture = imageUrl ? useLoader(THREE.TextureLoader, imageUrl) : null;
  
  // Extrair geometria original do GLTF
  const originalGeometry = useMemo(() => {
    let geometry: THREE.BufferGeometry | null = null;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        geometry = child.geometry.clone();
      }
    });
    return geometry;
  }, [scene]);

  // Calcular proporções do paciente
  const patientProportions = useMemo(() => {
    return calculatePatientProportions(landmarks);
  }, [landmarks]);
  
  // Calcular Face ROI
  const faceROI = useMemo(() => {
    return calculateFaceROI(landmarks);
  }, [landmarks]);
  
  // Calcular fatores de escala anatômica
  const scaleFactors = useMemo(() => {
    if (!patientProportions || !adaptProportions) {
      return { scaleX: 1, scaleY: 1, offsetY: 0 };
    }
    return calculateScaleFactors(patientProportions, GLTF_REFERENCE_PROPORTIONS);
  }, [patientProportions, adaptProportions]);

  // Obter landmarks filtrados com pesos
  const { landmarks: keyLandmarks, weights: landmarkWeights } = useMemo(() => {
    return getLandmarksByDensity(density, landmarks);
  }, [landmarks, density]);

  // ============================================================================
  // GEOMETRIA ADAPTADA POR PROPORÇÕES ANATÔMICAS
  // ============================================================================
  const adaptedGeometry = useMemo(() => {
    if (!originalGeometry) return null;
    
    const geo = originalGeometry.clone();
    const positions = geo.attributes.position;
    const posArray = positions.array as Float32Array;
    
    geo.computeBoundingBox();
    const bbox = geo.boundingBox!;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    
    if (adaptProportions && patientProportions) {
      // Aplicar escala diferenciada por região anatômica
      const { scaleX, scaleY, offsetY } = scaleFactors;
      
      for (let i = 0; i < posArray.length; i += 3) {
        const vx = posArray[i];
        const vy = posArray[i + 1];
        const vz = posArray[i + 2];
        
        // Normalizar posição do vértice
        const nx = (vx - center.x) / (size.x / 2);
        const ny = (vy - center.y) / (size.y / 2);
        
        // Calcular fator de escala regional baseado na posição Y
        // Área dos olhos: escala baseada na distância interocular
        // Área da boca: escala baseada na largura da boca
        let localScaleX = scaleX;
        let localScaleY = scaleY;
        
        // Região dos olhos (terço superior)
        if (ny > 0.1 && ny < 0.5) {
          const eyeScaleRatio = patientProportions.eyeDistance / GLTF_REFERENCE_PROPORTIONS.eyeDistance;
          localScaleX = localScaleX * 0.5 + eyeScaleRatio * 0.5;
        }
        
        // Região da boca (terço inferior)
        if (ny < -0.2) {
          const mouthScaleRatio = patientProportions.mouthWidth / GLTF_REFERENCE_PROPORTIONS.mouthWidth;
          localScaleX = localScaleX * 0.6 + mouthScaleRatio * 0.4;
        }
        
        // Região do nariz (centro)
        if (ny > -0.2 && ny < 0.1 && Math.abs(nx) < 0.3) {
          const noseScaleRatio = patientProportions.noseWidth / GLTF_REFERENCE_PROPORTIONS.noseWidth;
          localScaleX = localScaleX * 0.7 + noseScaleRatio * 0.3;
        }
        
        // Aplicar transformação com suavização
        const blendFactor = 0.7; // Quanto da transformação aplicar (evitar distorção excessiva)
        const finalScaleX = 1 + (localScaleX - 1) * blendFactor;
        const finalScaleY = 1 + (localScaleY - 1) * blendFactor;
        
        posArray[i] = center.x + nx * (size.x / 2) * finalScaleX;
        posArray[i + 1] = center.y + ny * (size.y / 2) * finalScaleY + offsetY * size.y * 0.1;
        // Z permanece inalterado na adaptação de proporções
      }
      
      positions.needsUpdate = true;
    }
    
    return geo;
  }, [originalGeometry, patientProportions, scaleFactors, adaptProportions]);

  // ============================================================================
  // GEOMETRIA DEFORMADA POR LANDMARKS (aplica após adaptação de proporções)
  // ============================================================================
  const deformedGeometry = useMemo(() => {
    if (!adaptedGeometry || keyLandmarks.length === 0) return adaptedGeometry;
    
    const geo = adaptedGeometry.clone();
    const positions = geo.attributes.position;
    const posArray = positions.array as Float32Array;
    
    geo.computeBoundingBox();
    const bbox = geo.boundingBox!;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    // Calcular bounds dos landmarks
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    keyLandmarks.forEach(lm => {
      minX = Math.min(minX, lm.x);
      maxX = Math.max(maxX, lm.x);
      minY = Math.min(minY, lm.y);
      maxY = Math.max(maxY, lm.y);
      minZ = Math.min(minZ, lm.z);
      maxZ = Math.max(maxZ, lm.z);
    });
    
    const landmarkSize = {
      x: maxX - minX || 1,
      y: maxY - minY || 1,
      z: maxZ - minZ || 0.5,
    };
    
    const landmarkCenter = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    };
    
    const { intensity, influenceRadius, depthScale } = deformParams;
    const densityFactor = density === 'maximo' ? 1.5 : density === 'balanceado' ? 1.0 : 0.7;
    const falloffFactor = (2 + (1 - influenceRadius) * 18) * densityFactor;
    
    // Aplicar deformação
    for (let i = 0; i < posArray.length; i += 3) {
      const vx = posArray[i];
      const vy = posArray[i + 1];
      const vz = posArray[i + 2];
      
      const nx = (vx - bbox.min.x) / size.x;
      const ny = (vy - bbox.min.y) / size.y;
      
      let totalWeight = 0;
      let dispX = 0, dispY = 0, dispZ = 0;
      
      keyLandmarks.forEach((landmark, idx) => {
        const regionWeight = landmarkWeights[idx] || 1.0;
        
        const lnx = (landmark.x - landmarkCenter.x) / landmarkSize.x + 0.5;
        const lny = (landmark.y - landmarkCenter.y) / landmarkSize.y + 0.5;
        const lnz = (landmark.z - landmarkCenter.z) / landmarkSize.z + 0.5;
        
        const dx = nx - lnx;
        const dy = ny - (1 - lny);
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const distWeight = Math.exp(-dist * dist * falloffFactor);
        const combinedWeight = distWeight * regionWeight;
        
        if (combinedWeight > 0.001) {
          const targetX = (lnx - 0.5) * size.x * 1.2;
          const targetY = (lny - 0.5) * size.y * 1.2;
          const targetZ = (lnz - 0.5) * (size.z || 0.5) * depthScale;
          
          const intensityFactor = intensity * 0.3 * regionWeight;
          dispX += (targetX - vx) * combinedWeight * intensityFactor;
          dispY += (targetY - vy) * combinedWeight * intensityFactor;
          dispZ += (targetZ - vz) * combinedWeight * intensityFactor * 0.5;
          totalWeight += combinedWeight;
        }
      });
      
      if (totalWeight > 0) {
        const smoothFactor = Math.min(1.0, totalWeight * 2);
        posArray[i] += (dispX / totalWeight) * smoothFactor;
        posArray[i + 1] += (dispY / totalWeight) * smoothFactor;
        posArray[i + 2] += (dispZ / totalWeight) * smoothFactor;
      }
    }
    
    positions.needsUpdate = true;
    geo.computeVertexNormals();
    geo.center();
    
    // Normalizar tamanho
    geo.computeBoundingBox();
    const newBbox = geo.boundingBox!;
    const newSize = new THREE.Vector3();
    newBbox.getSize(newSize);
    const maxDim = Math.max(newSize.x, newSize.y, newSize.z);
    if (maxDim > 0) {
      const scale = 2.5 / maxDim;
      geo.scale(scale, scale, scale);
    }
    
    return geo;
  }, [adaptedGeometry, keyLandmarks, landmarkWeights, deformParams, density]);

  // ============================================================================
  // UV MAPPING COM PROJEÇÃO FRONTAL E FACE ROI
  // ============================================================================
  const projectedGeometry = useMemo(() => {
    if (!deformedGeometry) return null;
    
    const geo = deformedGeometry.clone();
    const positions = geo.attributes.position.array as Float32Array;
    
    geo.computeBoundingBox();
    const bbox = geo.boundingBox!;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    const uvs = new Float32Array((positions.length / 3) * 2);
    
    for (let i = 0; i < positions.length; i += 3) {
      const vx = positions[i];
      const vy = positions[i + 1];
      // Ignorar Z - projeção frontal pura
      
      // Normalizar posição do vértice (0-1)
      let u = (vx - bbox.min.x) / size.x;
      let v = (vy - bbox.min.y) / size.y;
      
      // Mapear para o Face ROI na foto (se disponível)
      if (faceROI) {
        // U: mapeia horizontalmente para a largura do rosto na foto
        u = faceROI.minX + u * faceROI.width;
        // V: mapeia verticalmente com flip correto
        // Quando flipVertical=true: parte superior do modelo → parte superior da foto
        if (uvAdjustments.flipVertical) {
          v = faceROI.minY + (1 - v) * faceROI.height;
        } else {
          v = faceROI.minY + v * faceROI.height;
        }
      } else {
        // Fallback: usar centro da imagem
        if (uvAdjustments.flipVertical) {
          v = 1 - v; // Inverter Y para Three.js
        }
      }
      
      // Aplicar ajustes manuais de UV
      u = (u - 0.5) * uvAdjustments.scaleX + 0.5 + uvAdjustments.offsetX;
      v = (v - 0.5) * uvAdjustments.scaleY + 0.5 + uvAdjustments.offsetY;
      
      // Clampar valores
      const uvIndex = (i / 3) * 2;
      uvs[uvIndex] = Math.max(0, Math.min(1, u));
      uvs[uvIndex + 1] = Math.max(0, Math.min(1, v));
    }
    
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    
    return geo;
  }, [deformedGeometry, faceROI, uvAdjustments]);

  if (!projectedGeometry) return null;

  return (
    <mesh ref={meshRef} geometry={projectedGeometry}>
      {wireframe ? (
        <meshBasicMaterial
          wireframe
          color="#60A5FA"
          side={THREE.DoubleSide}
          transparent={opacity < 1}
          opacity={opacity}
        />
      ) : texture ? (
        <meshPhongMaterial
          map={texture}
          side={THREE.DoubleSide}
          transparent={opacity < 1}
          opacity={opacity}
          shininess={30}
          specular={new THREE.Color(0x222222)}
        />
      ) : (
        <meshPhongMaterial
          color="#e8beac"
          side={THREE.DoubleSide}
          transparent={opacity < 1}
          opacity={opacity}
          shininess={30}
          specular={new THREE.Color(0x222222)}
        />
      )}
    </mesh>
  );
};

const LoadingMesh: React.FC = () => (
  <mesh>
    <sphereGeometry args={[0.5, 32, 32]} />
    <meshBasicMaterial wireframe color="#60A5FA" />
  </mesh>
);

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

const HybridFaceMesh3D: React.FC<HybridFaceMesh3DProps> = ({
  landmarks,
  imageUrl,
  wireframe = false,
  opacity = 1,
}) => {
  const controlsRef = useRef<any>(null);
  const [showWireframe, setShowWireframe] = useState(wireframe);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showParams, setShowParams] = useState(false);
  const [activePreset, setActivePreset] = useState<FacialPreset>('oval');
  const [meshDensity, setMeshDensity] = useState<MeshDensity>('balanceado');
  const [adaptProportions, setAdaptProportions] = useState(true);
  
  const [deformParams, setDeformParams] = useState<DeformationParams>(
    FACIAL_PRESETS.oval.params
  );
  
  const [uvAdjustments, setUVAdjustments] = useState<UVAdjustments>({
    scaleX: 1.0,
    scaleY: 1.0,
    offsetX: 0,
    offsetY: 0,
    flipVertical: true, // Por padrão, flip ativo para corrigir orientação
  });

  // Calcular proporções do paciente para exibição
  const patientProportions = useMemo(() => {
    return calculatePatientProportions(landmarks);
  }, [landmarks]);

  const handlePresetChange = (preset: FacialPreset) => {
    setActivePreset(preset);
    if (preset !== 'custom') {
      setDeformParams(FACIAL_PRESETS[preset].params);
    }
  };

  const handleParamChange = (key: keyof DeformationParams, value: number) => {
    setActivePreset('custom');
    setDeformParams(p => ({ ...p, [key]: value }));
  };

  const handleUVChange = (key: keyof UVAdjustments, value: number) => {
    setUVAdjustments(p => ({ ...p, [key]: value }));
  };

  const handleResetUV = () => {
    setUVAdjustments({ scaleX: 1.0, scaleY: 1.0, offsetX: 0, offsetY: 0, flipVertical: true });
  };

  const handleReset = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  const handleZoomIn = () => {
    if (controlsRef.current) {
      const camera = controlsRef.current.object;
      camera.position.multiplyScalar(0.8);
      controlsRef.current.update();
    }
  };

  const handleZoomOut = () => {
    if (controlsRef.current) {
      const camera = controlsRef.current.object;
      camera.position.multiplyScalar(1.2);
      controlsRef.current.update();
    }
  };

  const hasData = landmarks.length > 0;
  const canShowTexture = imageUrl && !imageUrl.includes('placeholder');

  return (
    <div className="relative w-full h-full min-h-[400px] bg-muted/30 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex gap-1">
        <Button
          variant={showParams ? "secondary" : "outline"}
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={() => setShowParams(!showParams)}
          title="Parâmetros de Deformação"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
        {canShowTexture && (
          <Button
            variant={showWireframe ? "outline" : "secondary"}
            size="icon"
            className="h-8 w-8 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowWireframe(!showWireframe)}
            title={showWireframe ? "Mostrar Textura" : "Mostrar Wireframe"}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant={showOverlay ? "secondary" : "outline"}
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={() => setShowOverlay(!showOverlay)}
          title="Mostrar Wireframe + Textura"
        >
          <Layers className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={handleZoomIn}
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={handleZoomOut}
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={handleReset}
          title="Resetar Vista"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Painel de Parâmetros */}
      <Collapsible open={showParams} onOpenChange={setShowParams}>
        <CollapsibleContent className="absolute top-14 right-3 z-10 w-80 bg-background/95 backdrop-blur-sm rounded-lg border shadow-lg p-3 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="text-xs font-semibold text-foreground border-b pb-2">
            Parâmetros de Deformação
          </div>

          {/* Adaptação Anatômica Toggle */}
          <div className="flex items-center justify-between p-2 bg-primary/10 rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Adaptar Proporções</Label>
              <p className="text-[10px] text-muted-foreground">
                Ajusta modelo às medidas do paciente
              </p>
            </div>
            <Switch
              checked={adaptProportions}
              onCheckedChange={setAdaptProportions}
            />
          </div>

          {/* Medidas do Paciente (se adaptação ativa) */}
          {adaptProportions && patientProportions && (
            <div className="p-2 bg-muted/50 rounded text-[10px] space-y-1">
              <div className="font-medium text-xs mb-1">Medidas Detectadas:</div>
              <div className="grid grid-cols-2 gap-1">
                <span>Dist. Olhos: {(patientProportions.eyeDistance * 100).toFixed(1)}%</span>
                <span>Largura Rosto: {(patientProportions.faceWidth * 100).toFixed(1)}%</span>
                <span>Altura Rosto: {(patientProportions.faceHeight * 100).toFixed(1)}%</span>
                <span>Largura Nariz: {(patientProportions.noseWidth * 100).toFixed(1)}%</span>
                <span>Largura Boca: {(patientProportions.mouthWidth * 100).toFixed(1)}%</span>
              </div>
            </div>
          )}

          {/* Densidade do Mesh */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Densidade do Mesh</Label>
            <ToggleGroup 
              type="single" 
              value={meshDensity} 
              onValueChange={(v) => v && setMeshDensity(v as MeshDensity)}
              className="grid grid-cols-3 gap-1"
            >
              <ToggleGroupItem value="rapido" className="flex flex-col gap-0.5 h-auto py-1.5 px-1 text-[10px]" title="24 pontos principais">
                <Zap className="h-3.5 w-3.5" />
                <span>Rápido</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="balanceado" className="flex flex-col gap-0.5 h-auto py-1.5 px-1 text-[10px]" title="114 pontos estratégicos">
                <Scale className="h-3.5 w-3.5" />
                <span>Balanceado</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="maximo" className="flex flex-col gap-0.5 h-auto py-1.5 px-1 text-[10px]" title="Todos os 468 landmarks">
                <Maximize className="h-3.5 w-3.5" />
                <span>Máximo</span>
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-[10px] text-muted-foreground italic">
              {DENSITY_INFO[meshDensity].description}
            </p>
          </div>

          {/* Tipo Facial Preset */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Tipo Facial</Label>
            <ToggleGroup 
              type="single" 
              value={activePreset} 
              onValueChange={(v) => v && handlePresetChange(v as FacialPreset)}
              className="grid grid-cols-4 gap-1"
            >
              <ToggleGroupItem value="oval" className="flex flex-col gap-0.5 h-auto py-1.5 px-1 text-[10px]">
                <User className="h-3.5 w-3.5" />
                <span>Oval</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="quadrado" className="flex flex-col gap-0.5 h-auto py-1.5 px-1 text-[10px]">
                <Square className="h-3.5 w-3.5" />
                <span>Quadrado</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="alongado" className="flex flex-col gap-0.5 h-auto py-1.5 px-1 text-[10px]">
                <MoveVertical className="h-3.5 w-3.5" />
                <span>Alongado</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="custom" className="flex flex-col gap-0.5 h-auto py-1.5 px-1 text-[10px]">
                <Settings2 className="h-3.5 w-3.5" />
                <span>Custom</span>
              </ToggleGroupItem>
            </ToggleGroup>
            {activePreset !== 'custom' && (
              <p className="text-[10px] text-muted-foreground italic">
                {FACIAL_PRESETS[activePreset].description}
              </p>
            )}
          </div>
          
          {/* Sliders de Deformação */}
          <div className="space-y-3 pt-2 border-t">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Intensidade</Label>
                <span className="text-xs text-muted-foreground">{Math.round(deformParams.intensity * 100)}%</span>
              </div>
              <Slider
                value={[deformParams.intensity * 100]}
                onValueChange={([v]) => handleParamChange('intensity', v / 100)}
                min={0} max={100} step={5}
                className="h-2"
              />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Raio de Influência</Label>
                <span className="text-xs text-muted-foreground">{Math.round(deformParams.influenceRadius * 100)}%</span>
              </div>
              <Slider
                value={[deformParams.influenceRadius * 100]}
                onValueChange={([v]) => handleParamChange('influenceRadius', v / 100)}
                min={0} max={100} step={5}
                className="h-2"
              />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Escala de Profundidade</Label>
                <span className="text-xs text-muted-foreground">{Math.round(deformParams.depthScale * 100)}%</span>
              </div>
              <Slider
                value={[deformParams.depthScale * 100]}
                onValueChange={([v]) => handleParamChange('depthScale', v / 100)}
                min={0} max={100} step={5}
                className="h-2"
              />
            </div>
          </div>
          
          {/* Ajustes de UV */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Move className="h-3 w-3" /> Ajuste de Textura (UV)
              </Label>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={handleResetUV}>
                Reset
              </Button>
            </div>
            
            {/* Toggle Flip Vertical */}
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3" /> Inverter Vertical
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Corrige orientação da textura
                </p>
              </div>
              <Switch
                checked={uvAdjustments.flipVertical}
                onCheckedChange={(checked) => setUVAdjustments(p => ({ ...p, flipVertical: checked }))}
              />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs flex items-center gap-1">
                  <ArrowLeftRight className="h-3 w-3" /> Escala X
                </Label>
                <span className="text-xs text-muted-foreground">{uvAdjustments.scaleX.toFixed(2)}</span>
              </div>
              <Slider
                value={[uvAdjustments.scaleX * 100]}
                onValueChange={([v]) => handleUVChange('scaleX', v / 100)}
                min={50} max={200} step={5}
                className="h-2"
              />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3" /> Escala Y
                </Label>
                <span className="text-xs text-muted-foreground">{uvAdjustments.scaleY.toFixed(2)}</span>
              </div>
              <Slider
                value={[uvAdjustments.scaleY * 100]}
                onValueChange={([v]) => handleUVChange('scaleY', v / 100)}
                min={50} max={200} step={5}
                className="h-2"
              />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Offset X</Label>
                <span className="text-xs text-muted-foreground">{uvAdjustments.offsetX.toFixed(2)}</span>
              </div>
              <Slider
                value={[(uvAdjustments.offsetX + 0.5) * 100]}
                onValueChange={([v]) => handleUVChange('offsetX', v / 100 - 0.5)}
                min={0} max={100} step={2}
                className="h-2"
              />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Offset Y</Label>
                <span className="text-xs text-muted-foreground">{uvAdjustments.offsetY.toFixed(2)}</span>
              </div>
              <Slider
                value={[(uvAdjustments.offsetY + 0.5) * 100]}
                onValueChange={([v]) => handleUVChange('offsetY', v / 100 - 0.5)}
                min={0} max={100} step={2}
                className="h-2"
              />
            </div>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              handlePresetChange('oval');
              handleResetUV();
            }}
          >
            Restaurar Todos os Padrões
          </Button>
        </CollapsibleContent>
      </Collapsible>

      {/* Indicadores */}
      {hasData && (
        <div className="absolute top-3 left-3 z-10 text-xs bg-background/80 backdrop-blur-sm px-2 py-1 rounded font-medium">
          {showWireframe ? 'Wireframe GLTF' : 'Modelo Híbrido 3D'}
        </div>
      )}

      <div className="absolute top-12 left-3 z-10 flex flex-col gap-1">
        <div className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded">
          {DENSITY_INFO[meshDensity].points} landmarks ativos
        </div>
        {adaptProportions && (
          <div className="text-[10px] bg-green-500/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
            Proporções adaptadas
          </div>
        )}
      </div>

      {/* Instruções */}
      <div className="absolute bottom-3 left-3 z-10 text-xs text-muted-foreground bg-background/60 backdrop-blur-sm px-2 py-1 rounded">
        Arraste para rotacionar • Scroll para zoom
      </div>

      {hasData ? (
        <Canvas
          camera={{ position: [0, 0, 4], fov: 45 }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[0, 0, 10]} intensity={0.8} color="#ffffff" />
          <directionalLight position={[10, 5, 5]} intensity={0.5} color="#ffeecc" />
          <directionalLight position={[-10, 5, -5]} intensity={0.3} color="#ccddff" />
          <hemisphereLight args={['#ffffff', '#444466', 0.4]} />
          
          <React.Suspense fallback={<LoadingMesh />}>
            <DeformedGLTFMesh
              landmarks={landmarks}
              imageUrl={canShowTexture ? imageUrl : undefined}
              wireframe={showWireframe}
              opacity={opacity}
              deformParams={deformParams}
              density={meshDensity}
              adaptProportions={adaptProportions}
              uvAdjustments={uvAdjustments}
            />
            
            {showOverlay && !showWireframe && (
              <DeformedGLTFMesh
                landmarks={landmarks}
                imageUrl={undefined}
                wireframe={true}
                opacity={0.3}
                deformParams={deformParams}
                density={meshDensity}
                adaptProportions={adaptProportions}
                uvAdjustments={uvAdjustments}
              />
            )}
          </React.Suspense>
          
          <OrbitControls
            ref={controlsRef}
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={1}
            maxDistance={10}
            rotateSpeed={0.5}
            zoomSpeed={0.8}
          />
        </Canvas>
      ) : (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground text-sm">
            Aguardando landmarks do MediaPipe...
          </p>
        </div>
      )}
    </div>
  );
};

useGLTF.preload('/models/LeePerrySmith.glb');

export default HybridFaceMesh3D;
