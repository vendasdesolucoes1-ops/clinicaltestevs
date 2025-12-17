import React, { useMemo, useRef, Suspense } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { RotateCcw, ZoomIn, ZoomOut, Grid3X3 } from 'lucide-react';
import type { Landmark3D, TriangleFace } from '@/types/faceMesh3D';

interface FaceMesh3DProps {
  landmarks: Landmark3D[];
  faces: TriangleFace[];
  wireframe?: boolean;
  color?: string;
  opacity?: number;
  imageUrl?: string;
}

interface MeshGeometryProps {
  landmarks: Landmark3D[];
  faces: TriangleFace[];
  wireframe: boolean;
  color: string;
  opacity: number;
  imageUrl?: string;
}

// Separate component for textured mesh (needs to be inside Canvas for useLoader)
const TexturedMeshGeometry: React.FC<MeshGeometryProps> = ({
  landmarks,
  faces,
  wireframe,
  color,
  opacity,
  imageUrl,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Load texture
  const texture = useLoader(THREE.TextureLoader, imageUrl!);

  const geometry = useMemo(() => {
    if (!landmarks.length || !faces.length) return null;

    const geo = new THREE.BufferGeometry();

    // Create positions array from landmarks
    const positions = new Float32Array(landmarks.length * 3);
    landmarks.forEach((landmark, i) => {
      positions[i * 3] = landmark.x;
      positions[i * 3 + 1] = landmark.y;
      positions[i * 3 + 2] = landmark.z;
    });

    // Create UV coordinates from original normalized coordinates
    const uvs = new Float32Array(landmarks.length * 2);
    landmarks.forEach((landmark, i) => {
      // Use original coordinates if available, otherwise estimate from position
      const u = landmark.originalX ?? (landmark.x / 2 + 0.5);
      const v = landmark.originalY ?? (1 - (landmark.y / 2 + 0.5));
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = 1 - v; // Flip V for Three.js
    });

    // Create indices array from faces
    const indices = new Uint32Array(faces.length * 3);
    faces.forEach((face, i) => {
      indices[i * 3] = face[0];
      indices[i * 3 + 1] = face[1];
      indices[i * 3 + 2] = face[2];
    });

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    // Compute normals for proper lighting
    geo.computeVertexNormals();

    // Center the geometry
    geo.center();

    // Normalize to fit in viewport
    geo.computeBoundingBox();
    const bbox = geo.boundingBox;
    if (bbox) {
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scale = 2 / maxDim;
        geo.scale(scale, scale, scale);
      }
    }

    return geo;
  }, [landmarks, faces]);

  if (!geometry) return null;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      {wireframe ? (
        <meshBasicMaterial
          wireframe={true}
          color={color}
          side={THREE.DoubleSide}
          transparent={opacity < 1}
          opacity={opacity}
        />
      ) : (
        <meshStandardMaterial
          map={texture}
          side={THREE.DoubleSide}
          transparent={opacity < 1}
          opacity={opacity}
          roughness={0.8}
          metalness={0.1}
        />
      )}
    </mesh>
  );
};

// Simple wireframe mesh without texture
const WireframeMeshGeometry: React.FC<Omit<MeshGeometryProps, 'imageUrl'>> = ({
  landmarks,
  faces,
  color,
  opacity,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    if (!landmarks.length || !faces.length) return null;

    const geo = new THREE.BufferGeometry();

    const positions = new Float32Array(landmarks.length * 3);
    landmarks.forEach((landmark, i) => {
      positions[i * 3] = landmark.x;
      positions[i * 3 + 1] = landmark.y;
      positions[i * 3 + 2] = landmark.z;
    });

    const indices = new Uint32Array(faces.length * 3);
    faces.forEach((face, i) => {
      indices[i * 3] = face[0];
      indices[i * 3 + 1] = face[1];
      indices[i * 3 + 2] = face[2];
    });

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.center();

    geo.computeBoundingBox();
    const bbox = geo.boundingBox;
    if (bbox) {
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scale = 2 / maxDim;
        geo.scale(scale, scale, scale);
      }
    }

    return geo;
  }, [landmarks, faces]);

  if (!geometry) return null;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshBasicMaterial
        wireframe={true}
        color={color}
        side={THREE.DoubleSide}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
};

// Loading fallback
const LoadingMesh: React.FC = () => (
  <mesh>
    <sphereGeometry args={[0.5, 16, 16]} />
    <meshBasicMaterial wireframe color="#60A5FA" />
  </mesh>
);

const FaceMesh3D: React.FC<FaceMesh3DProps> = ({
  landmarks,
  faces,
  wireframe = false,
  color = '#60A5FA',
  opacity = 1,
  imageUrl,
}) => {
  const controlsRef = useRef<any>(null);
  const [showWireframe, setShowWireframe] = React.useState(wireframe);

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

  const toggleWireframe = () => {
    setShowWireframe(!showWireframe);
  };

  const hasData = landmarks.length > 0 && faces.length > 0;
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
            onClick={toggleWireframe}
            title={showWireframe ? "Mostrar Textura" : "Mostrar Wireframe"}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
        )}
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
          {showWireframe || !canShowTexture ? 'Wireframe' : 'Textura 3D'}
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-3 left-3 z-10 text-xs text-muted-foreground bg-background/60 backdrop-blur-sm px-2 py-1 rounded">
        Arraste para rotacionar • Scroll para zoom
      </div>

      {hasData ? (
        <Canvas
          camera={{ position: [0, 0, 4], fov: 50 }}
          style={{ background: 'transparent' }}
        >
          {/* Improved lighting for realistic rendering */}
          <ambientLight intensity={0.7} />
          <directionalLight position={[0, 0, 5]} intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={0.4} />
          <directionalLight position={[-5, -5, -5]} intensity={0.2} />
          <hemisphereLight args={['#ffffff', '#444444', 0.5]} />
          
          <Suspense fallback={<LoadingMesh />}>
            {canShowTexture && !showWireframe ? (
              <TexturedMeshGeometry
                landmarks={landmarks}
                faces={faces}
                wireframe={false}
                color={color}
                opacity={opacity}
                imageUrl={imageUrl}
              />
            ) : (
              <WireframeMeshGeometry
                landmarks={landmarks}
                faces={faces}
                wireframe={true}
                color={color}
                opacity={opacity}
              />
            )}
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
      ) : (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground text-sm">
            Aguardando dados da malha 3D...
          </p>
        </div>
      )}
    </div>
  );
};

export default FaceMesh3D;
