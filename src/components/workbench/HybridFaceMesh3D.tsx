import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { RotateCcw, ZoomIn, ZoomOut, Grid3X3, Layers } from 'lucide-react';
import type { Landmark3D } from '@/types/faceMesh3D';

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
}> = ({ landmarks, imageUrl, wireframe, opacity }) => {
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

  // Create deformed geometry based on landmarks
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
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    
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
    
    // Apply deformation to each vertex
    for (let i = 0; i < posArray.length; i += 3) {
      const vx = posArray[i];
      const vy = posArray[i + 1];
      const vz = posArray[i + 2];
      
      // Normalize vertex position to 0-1 range
      const nx = (vx - bbox.min.x) / size.x;
      const ny = (vy - bbox.min.y) / size.y;
      const nz = (vz - bbox.min.z) / (size.z || 1);
      
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
        
        // Weight based on distance (inverse square with falloff)
        const weight = Math.exp(-dist * dist * 8);
        
        if (weight > 0.001) {
          // Calculate displacement from original to landmark position
          const targetX = (lnx - 0.5) * size.x * 1.2;
          const targetY = (lny - 0.5) * size.y * 1.2;
          const targetZ = (lnz - 0.5) * (size.z || 0.5) * 0.5;
          
          dispX += (targetX - vx) * weight * 0.15;
          dispY += (targetY - vy) * weight * 0.15;
          dispZ += (targetZ - vz) * weight * 0.1;
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
  }, [originalGeometry, landmarks]);

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
            />
            
            {/* Overlay wireframe when enabled */}
            {showOverlay && !showWireframe && (
              <DeformedGLTFMesh
                landmarks={landmarks}
                imageUrl={undefined}
                wireframe={true}
                opacity={0.3}
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
