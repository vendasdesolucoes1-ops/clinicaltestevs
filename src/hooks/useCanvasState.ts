// Canvas State Manager - Centralized state for the simulation canvas
import { create } from 'zustand';
import { InterventionType, MarkingType } from '@/types/clinicalTools';

export interface Point {
  x: number;
  y: number;
}

export interface CanvasObject {
  id: string;
  type: 'path' | 'correction_vector' | 'intervention_area' | 'surgical_marking' | 'annotation' | 'arrow';
  points: Point[];
  color: string;
  strokeWidth: number;
  opacity: number;
  layer: 'markings' | 'simulation' | 'comparison';
  metadata?: Record<string, any>;
}

export interface VersionSnapshot {
  id: string;
  name: string;
  timestamp: string;
  objects: CanvasObject[];
  thumbnail?: string;
}

export interface ToolParams {
  brushSize: number;
  intensity: number;
  smoothing: number;
  // Intervention Area params
  interventionType: InterventionType;
  volumeMode: 'add' | 'remove';
  // Surgical Marking params
  markingType: MarkingType;
  surgicalTechnique: string;
  // Correction Vector params
  procedure: string;
  // Legacy params for backwards compatibility
  sutureType: string;
  sutureSpacing: number;
  sutureTension: number;
  incisionType: string;
  incisionDepth: number;
  // Annotation params
  annotationColor: string;
  annotationFontSize: number;
}

export interface LayerVisibility {
  original: boolean;
  markings: boolean;
  simulation: boolean;
  comparison: boolean;
}

export interface LayerOpacity {
  original: number;
  markings: number;
  simulation: number;
  comparison: number;
}

interface CanvasState {
  // View
  zoom: number;
  pan: Point;
  showGrid: boolean;
  showRuler: boolean;
  layers: LayerVisibility;
  layerOpacity: LayerOpacity;
  
  // Objects
  objects: CanvasObject[];
  selectedObjectId: string | null;
  
  // History
  undoStack: CanvasObject[][];
  redoStack: CanvasObject[][];
  
  // Versions
  versions: VersionSnapshot[];
  activeVersionId: string | null;
  
  // Tool params
  toolParams: ToolParams;
  
  // Actions
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  setShowGrid: (show: boolean) => void;
  setShowRuler: (show: boolean) => void;
  setLayerVisibility: (layer: keyof LayerVisibility, visible: boolean) => void;
  setLayerOpacity: (layer: keyof LayerOpacity, opacity: number) => void;
  
  addObject: (object: CanvasObject) => void;
  updateObject: (id: string, updates: Partial<CanvasObject>) => void;
  removeObject: (id: string) => void;
  clearObjects: () => void;
  setSelectedObject: (id: string | null) => void;
  
  undo: () => boolean;
  redo: () => boolean;
  
  saveVersion: (name: string) => void;
  loadVersion: (id: string) => void;
  deleteVersion: (id: string) => void;
  
  setToolParams: (params: Partial<ToolParams>) => void;
  resetView: () => void;
}

export const useCanvasState = create<CanvasState>((set, get) => ({
  // Initial state
  zoom: 1,
  pan: { x: 0, y: 0 },
  showGrid: false,
  showRuler: true,
  layers: {
    original: true,
    markings: true,
    simulation: true,
    comparison: false,
  },
  layerOpacity: {
    original: 100,
    markings: 100,
    simulation: 100,
    comparison: 50,
  },
  
  objects: [],
  selectedObjectId: null,
  
  undoStack: [],
  redoStack: [],
  
  versions: [],
  activeVersionId: null,
  
  toolParams: {
    brushSize: 20,
    intensity: 50,
    smoothing: 30,
    // New clinical params
    interventionType: 'preenchimento',
    volumeMode: 'add',
    markingType: 'incision_line',
    surgicalTechnique: 'incisao_linear',
    procedure: 'lifting',
    // Legacy params
    sutureType: 'simples',
    sutureSpacing: 5,
    sutureTension: 50,
    incisionType: 'linear',
    incisionDepth: 50,
    annotationColor: '#0ea5e9',
    annotationFontSize: 14,
  },
  
  // Actions
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  setPan: (pan) => set({ pan }),
  setShowGrid: (show) => set({ showGrid: show }),
  setShowRuler: (show) => set({ showRuler: show }),
  
  setLayerVisibility: (layer, visible) => set((state) => ({
    layers: { ...state.layers, [layer]: visible }
  })),
  
  setLayerOpacity: (layer, opacity) => set((state) => ({
    layerOpacity: { ...state.layerOpacity, [layer]: opacity }
  })),
  
  addObject: (object) => set((state) => {
    const newObjects = [...state.objects, object];
    return {
      objects: newObjects,
      undoStack: [...state.undoStack, state.objects],
      redoStack: [],
    };
  }),
  
  updateObject: (id, updates) => set((state) => ({
    objects: state.objects.map(obj => 
      obj.id === id ? { ...obj, ...updates } : obj
    ),
  })),
  
  removeObject: (id) => set((state) => {
    const newObjects = state.objects.filter(obj => obj.id !== id);
    return {
      objects: newObjects,
      undoStack: [...state.undoStack, state.objects],
      redoStack: [],
      selectedObjectId: state.selectedObjectId === id ? null : state.selectedObjectId,
    };
  }),
  
  clearObjects: () => set((state) => ({
    objects: [],
    undoStack: [...state.undoStack, state.objects],
    redoStack: [],
    selectedObjectId: null,
  })),
  
  setSelectedObject: (id) => set({ selectedObjectId: id }),
  
  undo: () => {
    const { undoStack, objects } = get();
    if (undoStack.length === 0) return false;
    
    const previousState = undoStack[undoStack.length - 1];
    set({
      objects: previousState,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, objects],
    });
    return true;
  },
  
  redo: () => {
    const { redoStack, objects } = get();
    if (redoStack.length === 0) return false;
    
    const nextState = redoStack[redoStack.length - 1];
    set({
      objects: nextState,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, objects],
    });
    return true;
  },
  
  saveVersion: (name) => set((state) => {
    const version: VersionSnapshot = {
      id: `ver_${Date.now()}`,
      name,
      timestamp: new Date().toISOString(),
      objects: [...state.objects],
    };
    return {
      versions: [...state.versions, version],
      activeVersionId: version.id,
    };
  }),
  
  loadVersion: (id) => set((state) => {
    const version = state.versions.find(v => v.id === id);
    if (!version) return state;
    return {
      objects: [...version.objects],
      activeVersionId: id,
      undoStack: [...state.undoStack, state.objects],
      redoStack: [],
    };
  }),
  
  deleteVersion: (id) => set((state) => ({
    versions: state.versions.filter(v => v.id !== id),
    activeVersionId: state.activeVersionId === id ? null : state.activeVersionId,
  })),
  
  setToolParams: (params) => set((state) => ({
    toolParams: { ...state.toolParams, ...params }
  })),
  
  resetView: () => set({
    zoom: 1,
    pan: { x: 0, y: 0 },
  }),
}));
