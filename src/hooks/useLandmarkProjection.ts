import { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { Landmark3D } from '@/types/faceMesh3D';
import { MEDIAPIPE_DENSE_CONNECTIONS } from '@/types/mediapipeMesh';

export interface ProjectedLandmark extends Landmark3D {
  index: number;
  projected: boolean; // true if successfully projected onto mesh
}

export interface LandmarkProjectionResult {
  projectedLandmarks: ProjectedLandmark[];
  connections: [number, number][];
}

/**
 * Projects 2D normalized landmarks onto a 3D mesh surface using raycasting
 * from a frontal camera perspective
 */
export function projectLandmarksOnMesh(
  landmarks2D: { x: number; y: number; z?: number }[],
  meshObject: THREE.Object3D,
  cameraPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 5)
): ProjectedLandmark[] {
  if (!landmarks2D || landmarks2D.length === 0 || !meshObject) {
    return [];
  }

  const raycaster = new THREE.Raycaster();
  const projectedLandmarks: ProjectedLandmark[] = [];

  // Get bounding box of the mesh for scale reference
  const boundingBox = new THREE.Box3().setFromObject(meshObject);
  const meshSize = new THREE.Vector3();
  boundingBox.getSize(meshSize);
  const meshCenter = new THREE.Vector3();
  boundingBox.getCenter(meshCenter);

  // Scale factor to map normalized coords (0-1) to mesh space
  const scaleX = meshSize.x * 1.2; // Add padding
  const scaleY = meshSize.y * 1.2;

  landmarks2D.forEach((landmark, index) => {
    // Convert normalized 2D coords (0-1) to mesh-relative 3D space
    // X: 0->1 maps to left->right
    // Y: 0->1 maps to top->bottom (inverted for 3D)
    const x3D = meshCenter.x + (landmark.x - 0.5) * scaleX;
    const y3D = meshCenter.y - (landmark.y - 0.5) * scaleY; // Invert Y
    
    // Ray origin slightly in front of the mesh
    const rayOrigin = new THREE.Vector3(x3D, y3D, cameraPosition.z);
    const rayDirection = new THREE.Vector3(0, 0, -1); // Point toward mesh
    
    raycaster.set(rayOrigin, rayDirection);
    
    // Find intersection with mesh
    const intersects = raycaster.intersectObject(meshObject, true);
    
    if (intersects.length > 0) {
      const hitPoint = intersects[0].point;
      projectedLandmarks.push({
        x: hitPoint.x,
        y: hitPoint.y,
        z: hitPoint.z,
        index,
        projected: true,
        originalX: landmark.x,
        originalY: landmark.y,
      });
    } else {
      // Fallback: use 2D position with estimated Z depth
      const estimatedZ = meshCenter.z + (landmark.z ?? 0) * meshSize.z * 0.3;
      projectedLandmarks.push({
        x: x3D,
        y: y3D,
        z: estimatedZ,
        index,
        projected: false,
        originalX: landmark.x,
        originalY: landmark.y,
      });
    }
  });

  return projectedLandmarks;
}

/**
 * Hook for managing landmark projection state and operations
 */
export function useLandmarkProjection(
  landmarks2D: { x: number; y: number; z?: number }[] | null,
  connections?: [number, number][]
) {
  // Get valid connections based on landmark count
  const validConnections = useMemo(() => {
    if (!landmarks2D || landmarks2D.length === 0) return [];
    
    const inputConnections = connections || MEDIAPIPE_DENSE_CONNECTIONS;
    const maxIndex = landmarks2D.length - 1;
    
    return inputConnections.filter(
      ([a, b]) => a <= maxIndex && b <= maxIndex
    );
  }, [landmarks2D, connections]);

  // Convert to Landmark3D format for direct 3D use (without raycasting)
  const directLandmarks3D = useMemo((): ProjectedLandmark[] => {
    if (!landmarks2D || landmarks2D.length === 0) return [];
    
    return landmarks2D.map((point, index) => ({
      x: (point.x - 0.5) * 2,     // -1 to 1
      y: -(point.y - 0.5) * 2,    // Flip Y
      z: (point.z ?? 0) * 0.5,    // Scale Z
      index,
      projected: false,
      originalX: point.x,
      originalY: point.y,
    }));
  }, [landmarks2D]);

  // Project onto mesh (requires mesh reference)
  const projectOntoMesh = useCallback((
    meshObject: THREE.Object3D,
    cameraPosition?: THREE.Vector3
  ): ProjectedLandmark[] => {
    if (!landmarks2D || landmarks2D.length === 0) return [];
    return projectLandmarksOnMesh(landmarks2D, meshObject, cameraPosition);
  }, [landmarks2D]);

  return {
    directLandmarks3D,
    connections: validConnections,
    projectOntoMesh,
    hasLandmarks: landmarks2D && landmarks2D.length > 0,
  };
}
