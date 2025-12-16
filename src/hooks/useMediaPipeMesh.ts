// Hook para gerenciar o estado do mesh MediaPipe
import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { N8N_FACIAL_ANALYSIS_WEBHOOK, POLLING_INTERVAL_MS, MAX_POLLING_ATTEMPTS } from '@/lib/config';
import { toast } from 'sonner';
import { MediaPipeMeshData, MediaPipeWebhookResponse } from '@/types/mediapipeMesh';

export type MeshDensity = 'simple' | 'dense';
export type AnalysisStatus = 'idle' | 'processing' | 'completed' | 'failed';

interface UseMediaPipeMeshReturn {
  // Mesh data
  meshData: MediaPipeMeshData | null;
  setMeshData: (data: MediaPipeMeshData | null) => void;
  
  // UI controls
  visible: boolean;
  setVisible: (visible: boolean) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
  density: MeshDensity;
  setDensity: (density: MeshDensity) => void;
  
  // Analysis state
  status: AnalysisStatus;
  errorMessage: string | null;
  
  // Actions
  triggerAnalysis: (caseId: string, imageUrl: string, photoId?: string) => Promise<void>;
  clearMesh: () => void;
}

export const useMediaPipeMesh = (): UseMediaPipeMeshReturn => {
  const [meshData, setMeshData] = useState<MediaPipeMeshData | null>(null);
  const [visible, setVisible] = useState(true);
  const [opacity, setOpacity] = useState(80);
  const [density, setDensity] = useState<MeshDensity>('dense');
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollingCountRef = useRef(0);
  const currentJobIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollingCountRef.current = 0;
  }, []);

  const clearMesh = useCallback(() => {
    stopPolling();
    setMeshData(null);
    setStatus('idle');
    setErrorMessage(null);
    currentJobIdRef.current = null;
  }, [stopPolling]);

  // Poll job status and fetch results when completed
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const { data, error } = await supabase
        .from('facial_analysis_jobs')
        .select('status, error_message')
        .eq('job_id', jobId)
        .single();

      if (error) {
        console.error('Erro ao verificar status:', error);
        return;
      }

      if (data) {
        if (data.status === 'success') {
          stopPolling();
          
          // Fetch the mesh data from facial_analyses
          const { data: analysisData, error: analysisError } = await supabase
            .from('facial_analyses')
            .select('mesh')
            .eq('case_id', currentJobIdRef.current)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (!analysisError && analysisData?.mesh) {
            const mesh = analysisData.mesh as any;
            if (mesh.points && Array.isArray(mesh.points)) {
              setMeshData({
                points: mesh.points,
                connections: mesh.connections || [],
              });
              setStatus('completed');
              toast.success('Mesh facial carregado!', {
                description: `${mesh.points.length} pontos detectados.`
              });
              return;
            }
          }
          
          // Fallback if no mesh in DB
          setStatus('completed');
          toast.success('Análise concluída!');
          
        } else if (data.status === 'failed') {
          stopPolling();
          setStatus('failed');
          setErrorMessage(data.error_message || 'Erro desconhecido');
          toast.error('Análise falhou', {
            description: data.error_message || 'Erro durante o processamento.'
          });
        }
      }

      // Check polling limit
      pollingCountRef.current++;
      if (pollingCountRef.current >= MAX_POLLING_ATTEMPTS) {
        stopPolling();
        setStatus('failed');
        setErrorMessage('Tempo limite excedido');
        toast.error('Tempo limite excedido', {
          description: 'A análise está demorando muito. Tente novamente.'
        });
      }
    } catch (err) {
      console.error('Erro no polling:', err);
    }
  }, [stopPolling]);

  const triggerAnalysis = useCallback(async (caseId: string, imageUrl: string, photoId?: string) => {
    try {
      setStatus('processing');
      setErrorMessage(null);
      setMeshData(null);
      
      const jobId = crypto.randomUUID();
      currentJobIdRef.current = caseId;

      toast.info('Iniciando análise facial...', {
        description: 'O mesh será renderizado automaticamente.'
      });

      // Insert job record for polling
      await supabase
        .from('facial_analysis_jobs')
        .insert({
          job_id: jobId,
          case_id: caseId,
          image_url: imageUrl,
          status: 'processing',
          timestamp_start: new Date().toISOString(),
        });

      // Send to n8n webhook
      const response = await fetch(N8N_FACIAL_ANALYSIS_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          case_id: caseId,
          image_url: imageUrl,
          photo_id: photoId || null,
          mode: 'clinical',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Check if response has immediate mesh data
      try {
        const responseData: MediaPipeWebhookResponse = await response.json();
        
        if (responseData.status === 'success' && responseData.face_mesh) {
          // Immediate response with mesh data!
          setMeshData(responseData.face_mesh);
          setStatus('completed');
          toast.success('Mesh facial carregado!', {
            description: `${responseData.face_mesh.points.length} pontos detectados.`
          });
          return;
        }
      } catch {
        // Response não é JSON - provavelmente processamento assíncrono
      }

      // Start polling for async processing
      pollingCountRef.current = 0;
      pollingRef.current = setInterval(() => {
        pollJobStatus(jobId);
      }, POLLING_INTERVAL_MS);

    } catch (error) {
      console.error('Erro ao disparar análise:', error);
      setStatus('failed');
      setErrorMessage(error instanceof Error ? error.message : 'Erro desconhecido');
      toast.error('Erro ao iniciar análise', {
        description: 'Não foi possível conectar ao serviço.'
      });
    }
  }, [pollJobStatus]);

  return {
    meshData,
    setMeshData,
    visible,
    setVisible,
    opacity,
    setOpacity,
    density,
    setDensity,
    status,
    errorMessage,
    triggerAnalysis,
    clearMesh,
  };
};
