import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Case3DScan {
  id: string;
  case_id: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  storage_path: string | null;
  scan_source: string | null;
  scan_type: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useCase3DScans(caseId: string | undefined) {
  const [scans, setScans] = useState<Case3DScan[]>([]);
  const [activeScan, setActiveScan] = useState<Case3DScan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch scans for the case
  const fetchScans = useCallback(async () => {
    if (!caseId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('case_3d_scans')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Type assertion since the table is new and not in generated types yet
      const typedData = data as unknown as Case3DScan[];
      setScans(typedData || []);
      
      // Set the most recent scan as active by default
      if (typedData && typedData.length > 0 && !activeScan) {
        setActiveScan(typedData[0]);
      }
    } catch (error) {
      console.error('Error fetching 3D scans:', error);
    } finally {
      setIsLoading(false);
    }
  }, [caseId, activeScan]);

  // Upload a new 3D model
  const uploadScan = useCallback(async (
    file: File, 
    scanSource: string = 'polycam',
    scanType: string = 'face',
    notes?: string
  ) => {
    if (!caseId) {
      toast.error('ID do caso não disponível');
      return null;
    }

    // Validate file type
    const validExtensions = ['.glb', '.gltf'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(fileExtension)) {
      toast.error('Formato inválido. Use GLB ou GLTF.');
      return null;
    }

    // Validate file size (100MB max)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Arquivo muito grande. Máximo: 100MB');
      return null;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return null;
      }

      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${caseId}/${timestamp}_${sanitizedName}`;

      setUploadProgress(20);

      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('case-3d-models')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      setUploadProgress(60);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('case-3d-models')
        .getPublicUrl(storagePath);

      setUploadProgress(80);

      // Insert record in database
      const { data: scanRecord, error: dbError } = await supabase
        .from('case_3d_scans')
        .insert({
          case_id: caseId,
          file_url: publicUrl,
          file_name: file.name,
          file_size: file.size,
          storage_path: storagePath,
          scan_source: scanSource,
          scan_type: scanType,
          notes: notes || null,
          uploaded_by: user.id
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        // Cleanup uploaded file on db error
        await supabase.storage.from('case-3d-models').remove([storagePath]);
        throw new Error(`Erro ao salvar: ${dbError.message}`);
      }

      setUploadProgress(100);

      const typedScan = scanRecord as unknown as Case3DScan;
      setScans(prev => [typedScan, ...prev]);
      setActiveScan(typedScan);
      
      toast.success('Modelo 3D carregado com sucesso!');
      return typedScan;

    } catch (error) {
      console.error('Error uploading 3D scan:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao fazer upload');
      return null;
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [caseId]);

  // Delete a scan
  const deleteScan = useCallback(async (scanId: string) => {
    const scan = scans.find(s => s.id === scanId);
    if (!scan) return false;

    try {
      // Delete from storage first
      if (scan.storage_path) {
        await supabase.storage
          .from('case-3d-models')
          .remove([scan.storage_path]);
      }

      // Delete from database
      const { error } = await supabase
        .from('case_3d_scans')
        .delete()
        .eq('id', scanId);

      if (error) throw error;

      setScans(prev => prev.filter(s => s.id !== scanId));
      
      if (activeScan?.id === scanId) {
        const remaining = scans.filter(s => s.id !== scanId);
        setActiveScan(remaining.length > 0 ? remaining[0] : null);
      }

      toast.success('Modelo 3D removido');
      return true;
    } catch (error) {
      console.error('Error deleting scan:', error);
      toast.error('Erro ao remover modelo 3D');
      return false;
    }
  }, [scans, activeScan]);

  // Initial fetch
  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  return {
    scans,
    activeScan,
    setActiveScan,
    isLoading,
    isUploading,
    uploadProgress,
    uploadScan,
    deleteScan,
    refetch: fetchScans
  };
}
