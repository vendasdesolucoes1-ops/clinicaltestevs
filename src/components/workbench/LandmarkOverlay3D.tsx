import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ProjectedLandmark } from '@/hooks/useLandmarkProjection';

interface LandmarkOverlay3DProps {
  landmarks: ProjectedLandmark[];
  connections: [number, number][];
  visible?: boolean;
  pointSize?: number;
  pointColor?: string;
  lineColor?: string;
  lineWidth?: number;
  opacity?: number;
  showConnections?: boolean;
  visualStyle?: 'minimal' | 'standard' | 'detailed';
}

// Visual style presets - much smaller point sizes for 3D model overlay
const STYLE_PRESETS = {
  minimal: {
    pointSize: 0.002,     // Very small points
    pointOpacity: 0.7,
    lineOpacity: 0.3,
    lineWidth: 0.5,
    pointColor: '#60A5FA',
    lineColor: '#3B82F6',
  },
  standard: {
    pointSize: 0.003,     // Small points
    pointOpacity: 0.85,
    lineOpacity: 0.4,
    lineWidth: 0.8,
    pointColor: '#60A5FA',
    lineColor: '#3B82F6',
  },
  detailed: {
    pointSize: 0.004,     // Slightly larger but still subtle
    pointOpacity: 1.0,
    lineOpacity: 0.6,
    lineWidth: 1.0,
    pointColor: '#34D399',
    lineColor: '#10B981',
  },
};

// Component for rendering landmark points as spheres
const LandmarkPoints: React.FC<{
  landmarks: ProjectedLandmark[];
  size: number;
  color: string;
  opacity: number;
}> = ({ landmarks, size, color, opacity }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!meshRef.current) return;

    const tempMatrix = new THREE.Matrix4();
    const tempColor = new THREE.Color();
    const projectedColor = new THREE.Color(color);
    const fallbackColor = new THREE.Color('#F59E0B'); // Orange for non-projected

    landmarks.forEach((landmark, i) => {
      tempMatrix.setPosition(landmark.x, landmark.y, landmark.z);
      meshRef.current!.setMatrixAt(i, tempMatrix);
      
      // Color based on projection success
      tempColor.copy(landmark.projected ? projectedColor : fallbackColor);
      meshRef.current!.setColorAt(i, tempColor);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [landmarks, color]);

  if (landmarks.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, landmarks.length]}
      frustumCulled={false}
    >
      <sphereGeometry args={[size, 8, 8]} />
      <meshBasicMaterial
        transparent
        opacity={opacity}
        vertexColors
      />
    </instancedMesh>
  );
};

// Component for rendering connections as lines
const LandmarkConnections: React.FC<{
  landmarks: ProjectedLandmark[];
  connections: [number, number][];
  color: string;
  opacity: number;
}> = ({ landmarks, connections, color, opacity }) => {
  const lineRef = useRef<THREE.LineSegments>(null);

  const geometry = useMemo(() => {
    const positions: number[] = [];
    
    connections.forEach(([a, b]) => {
      const pointA = landmarks[a];
      const pointB = landmarks[b];
      
      if (pointA && pointB) {
        positions.push(pointA.x, pointA.y, pointA.z);
        positions.push(pointB.x, pointB.y, pointB.z);
      }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [landmarks, connections]);

  if (connections.length === 0 || landmarks.length === 0) return null;

  return (
    <lineSegments ref={lineRef} geometry={geometry}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        linewidth={1}
      />
    </lineSegments>
  );
};

/**
 * 3D overlay component that renders landmarks and their connections
 * on top of a 3D model in Three.js scene
 */
export const LandmarkOverlay3D: React.FC<LandmarkOverlay3DProps> = ({
  landmarks,
  connections,
  visible = true,
  pointSize,
  pointColor,
  lineColor,
  opacity = 1,
  showConnections = true,
  visualStyle = 'standard',
}) => {
  const style = STYLE_PRESETS[visualStyle];

  // Apply custom overrides
  const finalPointSize = pointSize ?? style.pointSize;
  const finalPointColor = pointColor ?? style.pointColor;
  const finalLineColor = lineColor ?? style.lineColor;
  const finalPointOpacity = opacity * style.pointOpacity;
  const finalLineOpacity = opacity * style.lineOpacity;

  if (!visible || landmarks.length === 0) {
    return null;
  }

  return (
    <group>
      <LandmarkPoints
        landmarks={landmarks}
        size={finalPointSize}
        color={finalPointColor}
        opacity={finalPointOpacity}
      />
      {showConnections && (
        <LandmarkConnections
          landmarks={landmarks}
          connections={connections}
          color={finalLineColor}
          opacity={finalLineOpacity}
        />
      )}
    </group>
  );
};

export default LandmarkOverlay3D;
