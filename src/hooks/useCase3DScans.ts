import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import JSZip from 'jszip';

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

// Extract GLTF/GLB from ZIP file
async function extractModelFromZip(zipFile: File): Promise<File | null> {
  try {
    const zip = await JSZip.loadAsync(zipFile);
    const modelExtensions = ['.glb', '.gltf'];
    
    // Find the first GLB or GLTF file in the ZIP
    let modelFileName: string | null = null;
    let modelFile: JSZip.JSZipObject | null = null;
    
    zip.forEach((relativePath, file) => {
      if (modelFile) return; // Already found
      const ext = relativePath.toLowerCase().slice(relativePath.lastIndexOf('.'));
      if (modelExtensions.includes(ext) && !file.dir) {
        modelFileName = relativePath;
        modelFile = file;
      }
    });
    
    if (!modelFile || !modelFileName) {
      toast.error('ZIP não contém arquivo GLB ou GLTF');
      return null;
    }
    
    // Extract the model file
    const blob = await modelFile.async('blob');
    const extractedName = modelFileName.split('/').pop() || modelFileName;
    const extractedFile = new File([blob], extractedName, { 
      type: extractedName.endsWith('.glb') ? 'model/gltf-binary' : 'model/gltf+json' 
    });
    
    toast.success(`Extraído: ${extractedName}`);
    return extractedFile;
  } catch (error) {
    console.error('Error extracting ZIP:', error);
    toast.error('Erro ao extrair arquivo ZIP');
    return null;
  }
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

  // Upload a new 3D model (supports ZIP with extraction)
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

    let fileToUpload = file;
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    // Handle ZIP files - extract model first
    if (fileExtension === '.zip') {
      setIsUploading(true);
      setUploadProgress(5);
      toast.info('Extraindo modelo do ZIP...');
      
      const extractedFile = await extractModelFromZip(file);
      if (!extractedFile) {
        setIsUploading(false);
        setUploadProgress(0);
        return null;
      }
      fileToUpload = extractedFile;
      setUploadProgress(15);
    }

    // Validate file type (after potential extraction)
    const validExtensions = ['.glb', '.gltf'];
    const finalExtension = fileToUpload.name.toLowerCase().slice(fileToUpload.name.lastIndexOf('.'));
    if (!validExtensions.includes(finalExtension)) {
      toast.error('Formato inválido. Use GLB, GLTF ou ZIP contendo esses arquivos.');
      return null;
    }

    // Validate file size (100MB max for final model)
    const maxSize = 100 * 1024 * 1024;
    if (fileToUpload.size > maxSize) {
      toast.error('Arquivo muito grande. Máximo: 100MB');
      return null;
    }

    // Only set uploading if not already set (ZIP case already sets it)
    if (!isUploading) {
      setIsUploading(true);
      setUploadProgress(0);
    }

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return null;
      }

      // Generate unique filename using the extracted/original file
      const timestamp = Date.now();
      const sanitizedName = fileToUpload.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${caseId}/${timestamp}_${sanitizedName}`;

      setUploadProgress(20);

      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('case-3d-models')
        .upload(storagePath, fileToUpload, {
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
          file_name: fileToUpload.name,
          file_size: fileToUpload.size,
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
  }, [caseId, isUploading]);

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
