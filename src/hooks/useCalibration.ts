// Calibration Hook - Manages pixel-to-millimeter conversion
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CalibrationPoint {
  x: number;
  y: number;
}

export interface CalibrationData {
  // The two points defining the reference line
  point1: CalibrationPoint | null;
  point2: CalibrationPoint | null;
  // The known distance in millimeters
  knownDistanceMm: number;
  // Calculated pixels per millimeter
  pixelsPerMm: number | null;
  // Whether calibration is complete
  isCalibrated: boolean;
  // Last calibration timestamp
  calibratedAt: string | null;
}

interface CalibrationState extends CalibrationData {
  // Calibration mode
  isCalibrating: boolean;
  calibrationStep: 'idle' | 'point1' | 'point2' | 'input' | 'complete';
  
  // Actions
  startCalibration: () => void;
  setPoint1: (point: CalibrationPoint) => void;
  setPoint2: (point: CalibrationPoint) => void;
  setKnownDistance: (distanceMm: number) => void;
  completeCalibration: () => void;
  cancelCalibration: () => void;
  resetCalibration: () => void;
  
  // Conversion helpers
  pixelsToMm: (pixels: number) => number | null;
  mmToPixels: (mm: number) => number | null;
}

// Calculate distance between two points
const calculateDistance = (p1: CalibrationPoint, p2: CalibrationPoint): number => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const useCalibration = create<CalibrationState>()(
  persist(
    (set, get) => ({
      // Initial state
      point1: null,
      point2: null,
      knownDistanceMm: 10, // Default 10mm
      pixelsPerMm: null,
      isCalibrated: false,
      calibratedAt: null,
      isCalibrating: false,
      calibrationStep: 'idle',
      
      // Actions
      startCalibration: () => set({
        isCalibrating: true,
        calibrationStep: 'point1',
        point1: null,
        point2: null,
      }),
      
      setPoint1: (point) => set({
        point1: point,
        calibrationStep: 'point2',
      }),
      
      setPoint2: (point) => set({
        point2: point,
        calibrationStep: 'input',
      }),
      
      setKnownDistance: (distanceMm) => set({
        knownDistanceMm: distanceMm,
      }),
      
      completeCalibration: () => {
        const { point1, point2, knownDistanceMm } = get();
        if (!point1 || !point2 || knownDistanceMm <= 0) return;
        
        const pixelDistance = calculateDistance(point1, point2);
        const pixelsPerMm = pixelDistance / knownDistanceMm;
        
        set({
          pixelsPerMm,
          isCalibrated: true,
          calibratedAt: new Date().toISOString(),
          isCalibrating: false,
          calibrationStep: 'complete',
        });
      },
      
      cancelCalibration: () => set({
        isCalibrating: false,
        calibrationStep: 'idle',
        point1: null,
        point2: null,
      }),
      
      resetCalibration: () => set({
        point1: null,
        point2: null,
        knownDistanceMm: 10,
        pixelsPerMm: null,
        isCalibrated: false,
        calibratedAt: null,
        isCalibrating: false,
        calibrationStep: 'idle',
      }),
      
      // Conversion helpers
      pixelsToMm: (pixels) => {
        const { pixelsPerMm, isCalibrated } = get();
        if (!isCalibrated || !pixelsPerMm) return null;
        return pixels / pixelsPerMm;
      },
      
      mmToPixels: (mm) => {
        const { pixelsPerMm, isCalibrated } = get();
        if (!isCalibrated || !pixelsPerMm) return null;
        return mm * pixelsPerMm;
      },
    }),
    {
      name: 'canvas-calibration',
      partialize: (state) => ({
        point1: state.point1,
        point2: state.point2,
        knownDistanceMm: state.knownDistanceMm,
        pixelsPerMm: state.pixelsPerMm,
        isCalibrated: state.isCalibrated,
        calibratedAt: state.calibratedAt,
      }),
    }
  )
);
