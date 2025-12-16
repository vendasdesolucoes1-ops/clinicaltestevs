import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FacialMeshData } from '@/types/facialLandmarks';
import { toast } from 'sonner';

interface UseMeshAutoSaveOptions {
  caseId: string | undefined;
  photoId: string | undefined;
  meshData: FacialMeshData | null;
  debounceMs?: number;
  enabled?: boolean;
}

export function useMeshAutoSave({
  caseId,
  photoId,
  meshData,
  debounceMs = 2000,
  enabled = true,
}: UseMeshAutoSaveOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);

  const saveToDatabase = useCallback(async () => {
    if (!caseId || !photoId || !meshData || !enabled) return;
    if (isSavingRef.current) return;
    
    // RUNTIME SAFETY: Validate meshData has valid arrays before saving
    if (!Array.isArray(meshData.points) || meshData.points.length === 0) return;
    
    const safeConnections = Array.isArray(meshData.connections) ? meshData.connections : [];

    // Create a hash of current state to avoid duplicate saves
    const currentHash = JSON.stringify({
      points: meshData.points,
      customConnections: safeConnections.filter(c => c.type === 'custom'),
    });

    if (currentHash === lastSavedRef.current) return;

    isSavingRef.current = true;

    try {
      // Check if analysis exists for this photo
      const { data: existing } = await supabase
        .from('facial_analyses')
        .select('id')
        .eq('photo_id', photoId)
        .maybeSingle();

      const pointsJson = JSON.parse(JSON.stringify(meshData.points));
      const faceRoiJson = meshData.faceROI ? JSON.parse(JSON.stringify(meshData.faceROI)) : null;
      const customConnectionsJson = JSON.parse(JSON.stringify(safeConnections.filter(c => c.type === 'custom')));
      const safeMidlinePoints = Array.isArray(meshData.midlinePoints) ? meshData.midlinePoints : [];

      if (existing) {
        // Update existing analysis
        const { error } = await supabase
          .from('facial_analyses')
          .update({
            points: pointsJson,
            face_roi: faceRoiJson,
            midline_points: safeMidlinePoints,
            custom_connections: customConnectionsJson,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new analysis
        const { error } = await supabase
          .from('facial_analyses')
          .insert([{
            case_id: caseId,
            photo_id: photoId,
            points: pointsJson,
            face_roi: faceRoiJson,
            midline_points: safeMidlinePoints,
            custom_connections: customConnectionsJson,
          }]);

        if (error) throw error;
      }

      lastSavedRef.current = currentHash;
      console.log('Mesh auto-saved successfully');
    } catch (error) {
      console.error('Erro ao salvar mesh:', error);
      toast.error('Erro ao salvar alterações da mesh');
    } finally {
      isSavingRef.current = false;
    }
  }, [caseId, photoId, meshData, enabled]);

  // Debounced save effect
  useEffect(() => {
    if (!caseId || !photoId || !meshData || !enabled) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced save
    timeoutRef.current = setTimeout(() => {
      saveToDatabase();
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [meshData, caseId, photoId, debounceMs, enabled, saveToDatabase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    saveNow: saveToDatabase,
  };
}
