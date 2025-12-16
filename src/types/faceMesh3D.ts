export interface Landmark3D {
  x: number;
  y: number;
  z: number;
  id?: number;
}

export type TriangleFace = [number, number, number];

export interface FaceMesh3DData {
  landmarks: Landmark3D[];
  faces: TriangleFace[];
}
