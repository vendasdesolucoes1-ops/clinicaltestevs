import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { RotateCcw, ZoomIn, ZoomOut, Grid3X3, Layers, Settings2, User, Square, MoveVertical, Zap, Scale, Maximize } from 'lucide-react';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Landmark3D } from '@/types/faceMesh3D';

interface DeformationParams {
  intensity: number;
  influenceRadius: number;
  depthScale: number;
}

type FacialPreset = 'custom' | 'oval' | 'quadrado' | 'alongado';
type MeshDensity = 'rapido' | 'balanceado' | 'maximo';

// Presets otimizados para tipos faciais comuns
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

// Descrições das densidades de mesh
const DENSITY_INFO: Record<MeshDensity, { points: number; description: string }> = {
  rapido: { points: 24, description: 'Rápido - 24 pontos principais' },
  balanceado: { points: 114, description: 'Balanceado - 114 pontos estratégicos' },
  maximo: { points: 468, description: 'Máximo - Todos os 468 landmarks' },
};

interface HybridFaceMesh3DProps {
  landmarks: Landmark3D[];
  imageUrl?: string;
  wireframe?: boolean;
  opacity?: number;
}

// ============================================================================
// LANDMARK MAPPINGS POR DENSIDADE
// ============================================================================

// RÁPIDO (24 pontos) - Landmarks principais para deformação básica
const LANDMARK_MAPPING_RAPIDO = {
  noseTip: 1,
  noseBottom: 2,
  noseBridge: 6,
  leftEyeInner: 133,
  leftEyeOuter: 33,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  leftEyebrowInner: 55,
  leftEyebrowOuter: 105,
  rightEyebrowInner: 285,
  rightEyebrowOuter: 334,
  mouthLeft: 61,
  mouthRight: 291,
  mouthTop: 0,
  mouthBottom: 17,
  upperLipTop: 13,
  lowerLipBottom: 14,
  chin: 152,
  leftCheek: 234,
  rightCheek: 454,
  foreheadCenter: 10,
  leftJaw: 172,
  rightJaw: 397,
  foreheadTop: 151,
};

// BALANCEADO (114 pontos) - Cobertura estratégica de todas as regiões
const LANDMARK_MAPPING_BALANCEADO = {
  // Contorno facial / Jawline (17 pontos)
  jawline: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400],
  
  // Olho esquerdo (16 pontos)
  leftEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  
  // Olho direito (16 pontos)
  rightEye: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  
  // Sobrancelha esquerda (8 pontos)
  leftEyebrow: [70, 63, 105, 66, 107, 55, 65, 52],
  
  // Sobrancelha direita (8 pontos)
  rightEyebrow: [336, 296, 334, 293, 300, 285, 295, 282],
  
  // Nariz (15 pontos)
  nose: [1, 2, 6, 8, 168, 197, 195, 5, 4, 19, 94, 370, 462, 250, 290],
  
  // Boca externa (14 pontos)
  mouthOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405],
  
  // Boca interna / lábios (8 pontos)
  mouthInner: [78, 191, 80, 81, 82, 13, 312, 311],
  
  // Bochechas (8 pontos)
  cheeks: [234, 93, 132, 58, 454, 323, 361, 288],
  
  // Testa (4 pontos)
  forehead: [10, 151, 9, 8],
};

// Pesos por região anatômica (quanto maior, mais preciso)
const REGION_WEIGHTS: Record<string, number> = {
  jawline: 0.9,      // Alta precisão para contorno
  leftEye: 1.0,      // Máxima precisão para olhos
  rightEye: 1.0,
  leftEyebrow: 0.85,
  rightEyebrow: 0.85,
  nose: 0.95,        // Alta precisão para nariz
  mouthOuter: 0.9,
  mouthInner: 0.95,
  cheeks: 0.7,       // Menor precisão (área suave)
  forehead: 0.6,     // Menor precisão (área grande)
  default: 0.8,
};

// Função para obter landmarks baseado na densidade
function getLandmarksByDensity(
  density: MeshDensity, 
  allLandmarks: Landmark3D[]
): { landmarks: Landmark3D[]; weights: number[] } {
  const result: Landmark3D[] = [];
  const weights: number[] = [];
  
  if (density === 'rapido') {
    // 24 pontos principais
    Object.values(LANDMARK_MAPPING_RAPIDO).forEach(idx => {
      if (idx < allLandmarks.length) {
        result.push(allLandmarks[idx]);
        weights.push(REGION_WEIGHTS.default);
      }
    });
  } else if (density === 'balanceado') {
    // 114 pontos estratégicos com pesos por região
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
    // Máximo - todos os 468 landmarks
    allLandmarks.forEach((lm, idx) => {
      result.push(lm);
      // Atribuir pesos baseados na posição Y (área dos olhos tem mais peso)
      const yWeight = lm.y > 0.3 && lm.y < 0.6 ? 1.0 : 0.75;
      weights.push(yWeight);
    });
  }
  
  return { landmarks: result, weights };
}

// ============================================================================
// COMPONENTE DE MESH DEFORMADO
// ============================================================================

const DeformedGLTFMesh: React.FC<{
  landmarks: Landmark3D[];
  imageUrl?: string;
  wireframe: boolean;
  opacity: number;
  deformParams: DeformationParams;
  density: MeshDensity;
}> = ({ landmarks, imageUrl, wireframe, opacity, deformParams, density }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { scene } = useGLTF('/models/LeePerrySmith.glb');
  
  const texture = imageUrl ? useLoader(THREE.TextureLoader, imageUrl) : null;
  
  const originalGeometry = useMemo(() => {
    let geometry: THREE.BufferGeometry | null = null;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        geometry = child.geometry.clone();
      }
    });
    return geometry;
  }, [scene]);

  // Obter landmarks filtrados com pesos
  const { landmarks: keyLandmarks, weights: landmarkWeights } = useMemo(() => {
    return getLandmarksByDensity(density, landmarks);
  }, [landmarks, density]);

  // Create deformed geometry with region-weighted algorithm
  const deformedGeometry = useMemo(() => {
    if (!originalGeometry || keyLandmarks.length === 0) return originalGeometry;
    
    const geo = originalGeometry.clone();
    const positions = geo.attributes.position;
    const posArray = positions.array as Float32Array;
    
    geo.computeBoundingBox();
    const bbox = geo.boundingBox!;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    // Calculate landmark bounds
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
    
    // Ajustar falloff baseado na densidade (mais pontos = falloff mais apertado)
    const densityFactor = density === 'maximo' ? 1.5 : density === 'balanceado' ? 1.0 : 0.7;
    const falloffFactor = (2 + (1 - influenceRadius) * 18) * densityFactor;
    
    // Apply deformation with region weights
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
        
        // Peso base por distância + peso da região
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
        // Interpolação suave para evitar artefatos
        const smoothFactor = Math.min(1.0, totalWeight * 2);
        posArray[i] += (dispX / totalWeight) * smoothFactor;
        posArray[i + 1] += (dispY / totalWeight) * smoothFactor;
        posArray[i + 2] += (dispZ / totalWeight) * smoothFactor;
      }
    }
    
    positions.needsUpdate = true;
    geo.computeVertexNormals();
    geo.center();
    
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
  }, [originalGeometry, keyLandmarks, landmarkWeights, deformParams, density]);

  // UV mapping
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
      const x = positions[i];
      const y = positions[i + 1];
      
      const u = (x - bbox.min.x) / size.x;
      const v = (y - bbox.min.y) / size.y;
      
      const uvIndex = (i / 3) * 2;
      uvs[uvIndex] = u;
      uvs[uvIndex + 1] = v;
    }
    
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    
    return geo;
  }, [deformedGeometry]);

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
  
  const [deformParams, setDeformParams] = useState<DeformationParams>(
    FACIAL_PRESETS.oval.params
  );

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

      {/* Deformation Parameters Panel */}
      <Collapsible open={showParams} onOpenChange={setShowParams}>
        <CollapsibleContent className="absolute top-14 right-3 z-10 w-80 bg-background/95 backdrop-blur-sm rounded-lg border shadow-lg p-3 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="text-xs font-semibold text-foreground border-b pb-2">
            Parâmetros de Deformação
          </div>

          {/* Density Selector */}
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

          {/* Preset Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Tipo Facial</Label>
            <ToggleGroup 
              type="single" 
              value={activePreset} 
              onValueChange={(v) => v && handlePresetChange(v as FacialPreset)}
              className="grid grid-cols-4 gap-1"
            >
              <ToggleGroupItem value="oval" className="flex flex-col gap-0.5 h-auto py-1.5 px-1 text-[10px]" title="Rosto oval/equilibrado">
                <User className="h-3.5 w-3.5" />
                <span>Oval</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="quadrado" className="flex flex-col gap-0.5 h-auto py-1.5 px-1 text-[10px]" title="Maxilar pronunciado">
                <Square className="h-3.5 w-3.5" />
                <span>Quadrado</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="alongado" className="flex flex-col gap-0.5 h-auto py-1.5 px-1 text-[10px]" title="Rosto alongado">
                <MoveVertical className="h-3.5 w-3.5" />
                <span>Alongado</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="custom" className="flex flex-col gap-0.5 h-auto py-1.5 px-1 text-[10px]" title="Configuração personalizada">
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
          
          <div className="space-y-3 pt-2 border-t">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Intensidade</Label>
                <span className="text-xs text-muted-foreground">{Math.round(deformParams.intensity * 100)}%</span>
              </div>
              <Slider
                value={[deformParams.intensity * 100]}
                onValueChange={([v]) => handleParamChange('intensity', v / 100)}
                min={0}
                max={100}
                step={5}
                className="h-2"
              />
              <p className="text-[10px] text-muted-foreground">Força da deformação aplicada aos vértices</p>
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Raio de Influência</Label>
                <span className="text-xs text-muted-foreground">{Math.round(deformParams.influenceRadius * 100)}%</span>
              </div>
              <Slider
                value={[deformParams.influenceRadius * 100]}
                onValueChange={([v]) => handleParamChange('influenceRadius', v / 100)}
                min={0}
                max={100}
                step={5}
                className="h-2"
              />
              <p className="text-[10px] text-muted-foreground">Área afetada por cada landmark</p>
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Escala de Profundidade</Label>
                <span className="text-xs text-muted-foreground">{Math.round(deformParams.depthScale * 100)}%</span>
              </div>
              <Slider
                value={[deformParams.depthScale * 100]}
                onValueChange={([v]) => handleParamChange('depthScale', v / 100)}
                min={0}
                max={100}
                step={5}
                className="h-2"
              />
              <p className="text-[10px] text-muted-foreground">Intensidade da deformação no eixo Z</p>
            </div>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => handlePresetChange('oval')}
          >
            Restaurar Padrões (Oval)
          </Button>
        </CollapsibleContent>
      </Collapsible>

      {/* Mode indicator */}
      {hasData && (
        <div className="absolute top-3 left-3 z-10 text-xs bg-background/80 backdrop-blur-sm px-2 py-1 rounded font-medium">
          {showWireframe ? 'Wireframe GLTF' : 'Modelo Híbrido 3D'}
        </div>
      )}

      {/* Info badges */}
      <div className="absolute top-12 left-3 z-10 flex flex-col gap-1">
        <div className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded">
          {DENSITY_INFO[meshDensity].points} landmarks ativos
        </div>
        <div className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground">
          Pesos por região anatômica
        </div>
      </div>

      {/* Instructions */}
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
            />
            
            {showOverlay && !showWireframe && (
              <DeformedGLTFMesh
                landmarks={landmarks}
                imageUrl={undefined}
                wireframe={true}
                opacity={0.3}
                deformParams={deformParams}
                density={meshDensity}
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
