import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { RotateCcw, ZoomIn, ZoomOut, Grid3X3, Layers, Settings2, User, Square, MoveVertical } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Landmark3D } from '@/types/faceMesh3D';

interface DeformationParams {
  intensity: number;       // 0-1: overall deformation strength
  influenceRadius: number; // 0-1: how far each landmark affects vertices
  depthScale: number;      // 0-1: Z-axis deformation scale
}

type FacialPreset = 'custom' | 'oval' | 'quadrado' | 'alongado';

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

interface HybridFaceMesh3DProps {
  landmarks: Landmark3D[];
  imageUrl?: string;
  wireframe?: boolean;
  opacity?: number;
}

// MediaPipe landmark indices that correspond to key facial features
// These will be used to deform the GLTF model
const LANDMARK_MAPPING = {
  // Nose
  noseTip: 1,
  noseBottom: 2,
  noseBridge: 6,
  
  // Eyes
  leftEyeInner: 133,
  leftEyeOuter: 33,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  
  // Eyebrows
  leftEyebrowInner: 55,
  leftEyebrowOuter: 105,
  rightEyebrowInner: 285,
  rightEyebrowOuter: 334,
  
  // Mouth
  mouthLeft: 61,
  mouthRight: 291,
  mouthTop: 0,
  mouthBottom: 17,
  upperLipTop: 13,
  lowerLipBottom: 14,
  
  // Face contour
  chin: 152,
  leftCheek: 234,
  rightCheek: 454,
  foreheadCenter: 10,
  
  // Jaw
  leftJaw: 172,
  rightJaw: 397,
};

// Component that handles the GLTF model with deformation
const DeformedGLTFMesh: React.FC<{
  landmarks: Landmark3D[];
  imageUrl?: string;
  wireframe: boolean;
  opacity: number;
  deformParams: DeformationParams;
}> = ({ landmarks, imageUrl, wireframe, opacity, deformParams }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { scene } = useGLTF('/models/LeePerrySmith.glb');
  
  // Load patient photo as texture
  const texture = imageUrl ? useLoader(THREE.TextureLoader, imageUrl) : null;
  
  // Extract the mesh from the GLTF scene
  const originalGeometry = useMemo(() => {
    let geometry: THREE.BufferGeometry | null = null;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        geometry = child.geometry.clone();
      }
    });
    return geometry;
  }, [scene]);

  // Create deformed geometry based on landmarks and deformation parameters
  const deformedGeometry = useMemo(() => {
    if (!originalGeometry || landmarks.length === 0) return originalGeometry;
    
    const geo = originalGeometry.clone();
    const positions = geo.attributes.position;
    const posArray = positions.array as Float32Array;
    
    // Get bounding box of original geometry
    geo.computeBoundingBox();
    const bbox = geo.boundingBox!;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    // Calculate landmark bounds for mapping
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    landmarks.forEach(lm => {
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
    
    // Create influence map from key landmarks
    const keyLandmarks = Object.values(LANDMARK_MAPPING)
      .filter(idx => idx < landmarks.length)
      .map(idx => landmarks[idx]);
    
    // Deformation parameters from props
    const { intensity, influenceRadius, depthScale } = deformParams;
    
    // Convert influenceRadius to falloff factor (higher = tighter influence)
    // influenceRadius 0 = very tight (factor 20), influenceRadius 1 = very wide (factor 2)
    const falloffFactor = 2 + (1 - influenceRadius) * 18;
    
    // Apply deformation to each vertex
    for (let i = 0; i < posArray.length; i += 3) {
      const vx = posArray[i];
      const vy = posArray[i + 1];
      const vz = posArray[i + 2];
      
      // Normalize vertex position to 0-1 range
      const nx = (vx - bbox.min.x) / size.x;
      const ny = (vy - bbox.min.y) / size.y;
      
      // Find closest landmarks and interpolate displacement
      let totalWeight = 0;
      let dispX = 0, dispY = 0, dispZ = 0;
      
      keyLandmarks.forEach(landmark => {
        // Map landmark to normalized space
        const lnx = (landmark.x - landmarkCenter.x) / landmarkSize.x + 0.5;
        const lny = (landmark.y - landmarkCenter.y) / landmarkSize.y + 0.5;
        const lnz = (landmark.z - landmarkCenter.z) / landmarkSize.z + 0.5;
        
        // Calculate distance in normalized space
        const dx = nx - lnx;
        const dy = ny - (1 - lny); // Flip Y for landmark space
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Weight based on distance with configurable falloff
        const weight = Math.exp(-dist * dist * falloffFactor);
        
        if (weight > 0.001) {
          // Calculate displacement with intensity scaling
          const targetX = (lnx - 0.5) * size.x * 1.2;
          const targetY = (lny - 0.5) * size.y * 1.2;
          const targetZ = (lnz - 0.5) * (size.z || 0.5) * depthScale;
          
          // Apply intensity to displacement
          const intensityFactor = intensity * 0.3; // Max 30% displacement
          dispX += (targetX - vx) * weight * intensityFactor;
          dispY += (targetY - vy) * weight * intensityFactor;
          dispZ += (targetZ - vz) * weight * intensityFactor * 0.5;
          totalWeight += weight;
        }
      });
      
      // Apply weighted displacement
      if (totalWeight > 0) {
        posArray[i] += dispX / totalWeight;
        posArray[i + 1] += dispY / totalWeight;
        posArray[i + 2] += dispZ / totalWeight;
      }
    }
    
    positions.needsUpdate = true;
    geo.computeVertexNormals();
    
    // Center geometry
    geo.center();
    
    // Scale to fit viewport
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
  }, [originalGeometry, landmarks, deformParams]);

  // Create UV mapping for photo projection
  const projectedGeometry = useMemo(() => {
    if (!deformedGeometry) return null;
    
    const geo = deformedGeometry.clone();
    const positions = geo.attributes.position.array as Float32Array;
    
    // Calculate bounding box for UV projection
    geo.computeBoundingBox();
    const bbox = geo.boundingBox!;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    // Create UV coordinates based on X,Y position (frontal projection)
    const uvs = new Float32Array((positions.length / 3) * 2);
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      
      // Map to UV space (0-1)
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

// Loading fallback
const LoadingMesh: React.FC = () => (
  <mesh>
    <sphereGeometry args={[0.5, 32, 32]} />
    <meshBasicMaterial wireframe color="#60A5FA" />
  </mesh>
);

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
  
  // Deformation parameters with defaults (start with oval preset)
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
        <CollapsibleContent className="absolute top-14 right-3 z-10 w-72 bg-background/95 backdrop-blur-sm rounded-lg border shadow-lg p-3 space-y-4">
          <div className="text-xs font-semibold text-foreground border-b pb-2">
            Parâmetros de Deformação
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

      {/* Info badge */}
      <div className="absolute top-12 left-3 z-10 text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded">
        Modelo de alta qualidade + Landmarks do paciente
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
          {/* Professional lighting setup similar to the reference */}
          <ambientLight intensity={0.4} />
          
          {/* Main frontal light */}
          <directionalLight 
            position={[0, 0, 10]} 
            intensity={0.8}
            color="#ffffff"
          />
          
          {/* Warm fill light from right */}
          <directionalLight 
            position={[10, 5, 5]} 
            intensity={0.5}
            color="#ffeecc"
          />
          
          {/* Cool rim light from left */}
          <directionalLight 
            position={[-10, 5, -5]} 
            intensity={0.3}
            color="#ccddff"
          />
          
          {/* Hemisphere light for ambient occlusion feel */}
          <hemisphereLight 
            args={['#ffffff', '#444466', 0.4]} 
          />
          
          <React.Suspense fallback={<LoadingMesh />}>
            <DeformedGLTFMesh
              landmarks={landmarks}
              imageUrl={canShowTexture ? imageUrl : undefined}
              wireframe={showWireframe}
              opacity={opacity}
              deformParams={deformParams}
            />
            
            {/* Overlay wireframe when enabled */}
            {showOverlay && !showWireframe && (
              <DeformedGLTFMesh
                landmarks={landmarks}
                imageUrl={undefined}
                wireframe={true}
                opacity={0.3}
                deformParams={deformParams}
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

// Preload the GLTF model
useGLTF.preload('/models/LeePerrySmith.glb');

export default HybridFaceMesh3D;
