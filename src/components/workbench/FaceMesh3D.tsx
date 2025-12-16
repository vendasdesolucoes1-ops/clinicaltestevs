import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { Landmark3D, TriangleFace } from '@/types/faceMesh3D';

interface FaceMesh3DProps {
  landmarks: Landmark3D[];
  faces: TriangleFace[];
  wireframe?: boolean;
  color?: string;
  opacity?: number;
}

interface MeshGeometryProps {
  landmarks: Landmark3D[];
  faces: TriangleFace[];
  wireframe: boolean;
  color: string;
  opacity: number;
}

const FaceMeshGeometry: React.FC<MeshGeometryProps> = ({
  landmarks,
  faces,
  wireframe,
  color,
  opacity,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

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

    // Create indices array from faces
    const indices = new Uint32Array(faces.length * 3);
    faces.forEach((face, i) => {
      indices[i * 3] = face[0];
      indices[i * 3 + 1] = face[1];
      indices[i * 3 + 2] = face[2];
    });

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
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
        const scale = 2 / maxDim; // Scale to fit in 2x2x2 box
        geo.scale(scale, scale, scale);
      }
    }

    return geo;
  }, [landmarks, faces]);

  if (!geometry) return null;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshBasicMaterial
        wireframe={wireframe}
        color={color}
        side={THREE.DoubleSide}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
};

const FaceMesh3D: React.FC<FaceMesh3DProps> = ({
  landmarks,
  faces,
  wireframe = true,
  color = '#60A5FA',
  opacity = 1,
}) => {
  const controlsRef = useRef<any>(null);

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

  const hasData = landmarks.length > 0 && faces.length > 0;

  return (
    <div className="relative w-full h-full min-h-[400px] bg-muted/30 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex gap-1">
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

      {/* Instructions */}
      <div className="absolute bottom-3 left-3 z-10 text-xs text-muted-foreground bg-background/60 backdrop-blur-sm px-2 py-1 rounded">
        Arraste para rotacionar • Scroll para zoom
      </div>

      {hasData ? (
        <Canvas
          camera={{ position: [0, 0, 4], fov: 50 }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />
          <directionalLight position={[-5, -5, -5]} intensity={0.3} />
          
          <FaceMeshGeometry
            landmarks={landmarks}
            faces={faces}
            wireframe={wireframe}
            color={color}
            opacity={opacity}
          />
          
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
