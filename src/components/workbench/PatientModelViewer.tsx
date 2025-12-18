import React, { useRef, Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Center, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { RotateCcw, ZoomIn, ZoomOut, Grid3X3, Layers, Box, Loader2, Crosshair } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { LandmarkOverlay3D } from './LandmarkOverlay3D';
import { useLandmarkProjection, projectLandmarksOnMesh, type ProjectedLandmark } from '@/hooks/useLandmarkProjection';
import { MEDIAPIPE_DENSE_CONNECTIONS } from '@/types/mediapipeMesh';

interface PatientModelViewerProps {
  modelUrl: string;
  className?: string;
  // MediaPipe landmarks data (normalized 0-1)
  landmarks2D?: { x: number; y: number; z?: number }[];
  // Connection pairs for mesh
  connections?: [number, number][];
  // Visual style for landmarks
  landmarkVisualStyle?: 'minimal' | 'standard' | 'detailed';
}

// Component that loads and displays the patient's GLTF model
const PatientModel: React.FC<{
  modelUrl: string;
  wireframe: boolean;
  showOverlay: boolean;
  onSceneReady?: (scene: THREE.Object3D) => void;
}> = ({ modelUrl, wireframe, showOverlay, onSceneReady }) => {
  const { scene } = useGLTF(modelUrl);

  // Clone the scene to avoid mutating the cached version
  const clonedScene = React.useMemo(() => {
    const clone = scene.clone();
    
    // Apply wireframe or normal materials
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (wireframe) {
          // Create wireframe material
          child.material = new THREE.MeshBasicMaterial({
            color: '#60A5FA',
            wireframe: true,
            transparent: true,
            opacity: 0.8
          });
        } else if (showOverlay) {
          // Show both texture and wireframe
          const originalMaterial = child.material as THREE.Material;
          if (originalMaterial) {
            // Keep original material but add wireframe on top
            child.material = [
              originalMaterial,
              new THREE.MeshBasicMaterial({
                color: '#60A5FA',
                wireframe: true,
                transparent: true,
                opacity: 0.3
              })
            ];
          }
        }
        // Otherwise keep original material with textures
      }
    });
    
    return clone;
  }, [scene, wireframe, showOverlay]);

  // Notify parent when scene is ready
  useEffect(() => {
    if (onSceneReady && clonedScene) {
      onSceneReady(clonedScene);
    }
  }, [clonedScene, onSceneReady]);

  return (
    <Center>
      <primitive object={clonedScene} scale={1} />
    </Center>
  );
};

// Inner scene component that has access to Three.js context
const SceneContent: React.FC<{
  modelUrl: string;
  wireframe: boolean;
  showOverlay: boolean;
  showLandmarks: boolean;
  landmarks2D?: { x: number; y: number; z?: number }[];
  connections?: [number, number][];
  landmarkOpacity: number;
  landmarkVisualStyle: 'minimal' | 'standard' | 'detailed';
}> = ({ 
  modelUrl, 
  wireframe, 
  showOverlay, 
  showLandmarks,
  landmarks2D,
  connections,
  landmarkOpacity,
  landmarkVisualStyle,
}) => {
  const [meshRef, setMeshRef] = useState<THREE.Object3D | null>(null);
  const [projectedLandmarks, setProjectedLandmarks] = useState<ProjectedLandmark[]>([]);
  
  const { camera } = useThree();

  // Project landmarks when mesh is ready
  useEffect(() => {
    if (!meshRef || !landmarks2D || landmarks2D.length === 0) {
      setProjectedLandmarks([]);
      return;
    }

    // Project landmarks onto the mesh surface
    const projected = projectLandmarksOnMesh(
      landmarks2D,
      meshRef,
      camera.position.clone()
    );
    
    setProjectedLandmarks(projected);
  }, [meshRef, landmarks2D, camera.position]);

  // Get valid connections
  const validConnections = useMemo(() => {
    if (!landmarks2D || landmarks2D.length === 0) return [];
    const inputConnections = connections || MEDIAPIPE_DENSE_CONNECTIONS;
    const maxIndex = landmarks2D.length - 1;
    return inputConnections.filter(([a, b]) => a <= maxIndex && b <= maxIndex);
  }, [landmarks2D, connections]);

  const handleSceneReady = useCallback((scene: THREE.Object3D) => {
    setMeshRef(scene);
  }, []);

  return (
    <>
      <PatientModel
        modelUrl={modelUrl}
        wireframe={wireframe}
        showOverlay={showOverlay}
        onSceneReady={handleSceneReady}
      />
      
      {/* Landmark overlay */}
      {showLandmarks && projectedLandmarks.length > 0 && (
        <LandmarkOverlay3D
          landmarks={projectedLandmarks}
          connections={validConnections}
          visible={showLandmarks}
          opacity={landmarkOpacity}
          visualStyle={landmarkVisualStyle}
          showConnections={true}
        />
      )}
      
      <Environment preset="studio" />
    </>
  );
};

// Loading fallback
const LoadingFallback = () => (
  <mesh>
    <sphereGeometry args={[0.5, 16, 16]} />
    <meshBasicMaterial wireframe color="#60A5FA" />
  </mesh>
);

export const PatientModelViewer: React.FC<PatientModelViewerProps> = ({
  modelUrl,
  className,
  landmarks2D,
  connections,
  landmarkVisualStyle = 'standard',
}) => {
  const controlsRef = useRef<any>(null);
  const [showWireframe, setShowWireframe] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [landmarkOpacity, setLandmarkOpacity] = useState(80);
  const [isLoading, setIsLoading] = useState(true);

  const hasLandmarks = landmarks2D && landmarks2D.length > 0;

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

  return (
    <div className={`relative w-full h-full min-h-[400px] bg-muted/30 rounded-lg overflow-hidden ${className || ''}`}>
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex gap-1">
        {/* Landmarks toggle - only show if landmarks available */}
        {hasLandmarks && (
          <Button
            variant={showLandmarks ? "secondary" : "outline"}
            size="icon"
            className="h-8 w-8 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowLandmarks(!showLandmarks)}
            title={showLandmarks ? "Ocultar Landmarks" : "Mostrar Landmarks"}
          >
            <Crosshair className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant={showWireframe ? "secondary" : "outline"}
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={() => setShowWireframe(!showWireframe)}
          title={showWireframe ? "Mostrar Textura" : "Mostrar Wireframe"}
        >
          <Grid3X3 className="h-4 w-4" />
        </Button>
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
          onClick={handleReset}
          title="Resetar Câmera"
        >
          <RotateCcw className="h-4 w-4" />
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
      </div>

      {/* Model source badge */}
      <div className="absolute top-3 left-3 z-10 px-2 py-1 rounded-md bg-primary/10 border border-primary/30 text-xs font-medium text-primary flex items-center gap-1.5">
        <Box className="h-3.5 w-3.5" />
        Scan 3D do Paciente
      </div>

      {/* Landmark opacity control - only show when landmarks visible */}
      {hasLandmarks && showLandmarks && (
        <div className="absolute bottom-14 left-3 z-10 px-3 py-2 rounded-lg bg-background/90 backdrop-blur-sm border border-border/50 w-48">
          <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Crosshair className="h-3 w-3" />
            Opacidade Landmarks
          </div>
          <Slider
            value={[landmarkOpacity]}
            onValueChange={([v]) => setLandmarkOpacity(v)}
            min={10}
            max={100}
            step={5}
            className="w-full"
          />
        </div>
      )}

      {/* Canvas */}
      <Canvas
        camera={{ position: [0, 0, 3], fov: 50 }}
        onCreated={() => setIsLoading(false)}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <directionalLight position={[-5, -5, -5]} intensity={0.3} />
        
        <Suspense fallback={<LoadingFallback />}>
          <SceneContent
            modelUrl={modelUrl}
            wireframe={showWireframe}
            showOverlay={showOverlay}
            showLandmarks={showLandmarks && hasLandmarks}
            landmarks2D={landmarks2D}
            connections={connections}
            landmarkOpacity={landmarkOpacity / 100}
            landmarkVisualStyle={landmarkVisualStyle}
          />
        </Suspense>
        
        <OrbitControls
          ref={controlsRef}
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={1}
          maxDistance={10}
        />
      </Canvas>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Carregando modelo 3D...</span>
          </div>
        </div>
      )}

      {/* Landmark info badge */}
      {hasLandmarks && showLandmarks && (
        <div className="absolute top-12 left-3 z-10 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
          <Crosshair className="h-3 w-3" />
          {landmarks2D?.length} landmarks projetados
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm text-xs text-muted-foreground border border-border/50">
        Arraste para rotacionar • Scroll para zoom
      </div>
    </div>
  );
};

export default PatientModelViewer;
