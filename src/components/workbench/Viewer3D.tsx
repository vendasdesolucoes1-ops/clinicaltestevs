import { useRef, useState, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { 
  RotateCcw, 
  ZoomIn, 
  ZoomOut,
  Loader2,
  Move3D
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Viewer3DProps {
  modelUrl?: string;
  imageUrl?: string;
  isProcessing?: boolean;
}

// Component for the curved face plane with photo texture
function FacePlane({ imageUrl }: { imageUrl: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Load the image as texture
  const texture = useLoader(THREE.TextureLoader, imageUrl);
  
  // Create curved geometry to simulate facial depth
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(3, 4, 32, 32);
    const positionAttribute = geo.attributes.position;
    
    // Apply subtle curve to simulate facial depth
    for (let i = 0; i < positionAttribute.count; i++) {
      const x = positionAttribute.getX(i);
      const y = positionAttribute.getY(i);
      
      // Create a subtle outward curve (like a face bulge)
      const distFromCenter = Math.sqrt(x * x + y * y * 0.5);
      const z = Math.cos(distFromCenter * 0.8) * 0.3;
      
      positionAttribute.setZ(i, z);
    }
    
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Subtle animation
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.1) * 0.02;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial 
        map={texture} 
        side={THREE.DoubleSide}
        roughness={0.8}
        metalness={0.1}
      />
    </mesh>
  );
}

// Fallback when no image
function PlaceholderFace() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.2;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.5, 32, 32]} />
      <meshStandardMaterial 
        color="#6366f1" 
        wireframe 
        opacity={0.6} 
        transparent 
      />
    </mesh>
  );
}

// Loading component for Suspense
function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshBasicMaterial color="#6366f1" wireframe />
    </mesh>
  );
}

export function Viewer3D({ modelUrl, imageUrl, isProcessing }: Viewer3DProps) {
  const controlsRef = useRef<any>(null);
  const [zoom, setZoom] = useState(5);

  const handleReset = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
    setZoom(5);
  };

  const handleZoomIn = () => setZoom(z => Math.max(2, z - 1));
  const handleZoomOut = () => setZoom(z => Math.min(10, z + 1));

  return (
    <div className="relative h-full flex flex-col">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-lg border border-border p-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Resetar vista</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>
      </div>

      {/* 3D View */}
      <div className="flex-1 canvas-container">
        {isProcessing ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Modelo 3D sendo gerado...</p>
              <p className="text-xs text-muted-foreground mt-1">Isso pode levar alguns minutos</p>
            </div>
          </div>
        ) : (
          <Canvas
            camera={{ position: [0, 0, zoom], fov: 50 }}
            style={{ background: 'transparent' }}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 5, 5]} intensity={0.8} />
            <directionalLight position={[-5, -5, -5]} intensity={0.3} />
            
            <Suspense fallback={<LoadingFallback />}>
              {imageUrl ? (
                <FacePlane imageUrl={imageUrl} />
              ) : (
                <PlaceholderFace />
              )}
            </Suspense>
            
            <OrbitControls 
              ref={controlsRef}
              enablePan={true}
              enableZoom={true}
              enableRotate={true}
              minDistance={2}
              maxDistance={15}
              target={[0, 0, 0]}
            />
            <Environment preset="studio" />
          </Canvas>
        )}
      </div>

      {/* Info */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-3 py-1.5">
        <Move3D className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Arraste para rotacionar • Scroll para zoom
        </span>
      </div>
    </div>
  );
}
