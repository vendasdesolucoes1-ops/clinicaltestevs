// Hook for asynchronous facial analysis via n8n workflow
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { N8N_WEBHOOK_URL, POLLING_INTERVAL_MS, MAX_POLLING_ATTEMPTS } from '@/lib/config';
import { toast } from 'sonner';
import type { FacialMeshData, FacialPoint, MeshDensity, FaceROI, AnatomicalRegion } from '@/types/facialLandmarks';
import { getConnectionsByDensity } from '@/types/facialLandmarks';

export type AnalysisJobStatus = 'idle' | 'processing' | 'completed' | 'failed';

interface AnalysisJob {
  jobId: string;
  caseId: string;
  status: AnalysisJobStatus;
  errorMessage?: string;
  errorStage?: string;
  startedAt: string;
}

interface UseN8nFacialAnalysisReturn {
  // Job state
  analysisJob: AnalysisJob | null;
  isProcessing: boolean;
  
  // Mesh data
  meshData: FacialMeshData | null;
  faceROI: FaceROI | null;
  
  // Actions
  triggerAnalysis: (caseId: string, imageUrl: string) => Promise<void>;
  retryAnalysis: () => Promise<void>;
  clearJob: () => void;
  
  // Mesh settings
  meshDensity: MeshDensity;
  setMeshDensity: (density: MeshDensity) => void;
}

export const useN8nFacialAnalysis = (): UseN8nFacialAnalysisReturn => {
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [meshData, setMeshData] = useState<FacialMeshData | null>(null);
  const [faceROI, setFaceROI] = useState<FaceROI | null>(null);
  const [meshDensity, setMeshDensity] = useState<MeshDensity>('dense');
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollingCountRef = useRef(0);
  const lastImageUrlRef = useRef<string>('');
  const lastCaseIdRef = useRef<string>('');

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollingCountRef.current = 0;
  }, []);

  // Fetch analysis results from facial_analyses table
  const fetchAnalysisResults = useCallback(async (caseId: string) => {
    const { data, error } = await supabase
      .from('facial_analyses')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Erro ao buscar resultados:', error);
      return null;
    }

    if (data && data.length > 0) {
      const analysis = data[0];
      
      // Process points
      const points: FacialPoint[] = (analysis.points as any[])?.map((p: any) => ({
        id: p.id,
        name: p.name || p.id,
        x: p.x,
        y: p.y,
        region: p.region || 'midline' as AnatomicalRegion,
        adjacentRegions: p.adjacentRegions || [],
      })) || [];

      const roi: FaceROI = (analysis.face_roi as any) || { x: 0, y: 0, width: 1, height: 1 };
      const midlinePoints: string[] = analysis.midline_points || [];

      setFaceROI(roi);

      const mesh: FacialMeshData = {
        points,
        connections: getConnectionsByDensity(meshDensity, points, midlinePoints),
        faceROI: roi,
        midlinePoints,
      };

      setMeshData(mesh);
      return mesh;
    }

    return null;
  }, [meshDensity]);

  // Poll for job status
  const pollJobStatus = useCallback(async (caseId: string) => {
    const { data, error } = await supabase
      .from('facial_analysis_jobs')
      .select('status, error_message, error_stage, job_id, timestamp_start')
      .eq('case_id', caseId)
      .order('timestamp_start', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Erro ao verificar status:', error);
      return;
    }

    if (data && data.length > 0) {
      const job = data[0];
      const status = job.status as AnalysisJobStatus;

      setAnalysisJob(prev => prev ? {
        ...prev,
        status,
        errorMessage: job.error_message || undefined,
        errorStage: job.error_stage || undefined,
      } : null);

      if (status === 'completed') {
        stopPolling();
        await fetchAnalysisResults(caseId);
        toast.success('Análise facial concluída!', {
          description: 'Os landmarks foram detectados com sucesso.'
        });
      } else if (status === 'failed') {
        stopPolling();
        toast.error('Análise facial falhou', {
          description: job.error_message || 'Erro desconhecido durante o processamento.'
        });
      }
    }

    // Check if exceeded max polling attempts
    pollingCountRef.current++;
    if (pollingCountRef.current >= MAX_POLLING_ATTEMPTS) {
      stopPolling();
      setAnalysisJob(prev => prev ? {
        ...prev,
        status: 'failed',
        errorMessage: 'Tempo limite excedido aguardando processamento'
      } : null);
      toast.error('Tempo limite excedido', {
        description: 'A análise está demorando muito. Tente novamente.'
      });
    }
  }, [stopPolling, fetchAnalysisResults]);

  // Start polling for job status
  const startPolling = useCallback((caseId: string) => {
    stopPolling();
    pollingCountRef.current = 0;
    
    // Initial poll
    pollJobStatus(caseId);
    
    // Set up interval
    pollingRef.current = setInterval(() => {
      pollJobStatus(caseId);
    }, POLLING_INTERVAL_MS);
  }, [stopPolling, pollJobStatus]);

  // Trigger analysis via n8n webhook
  const triggerAnalysis = useCallback(async (caseId: string, imageUrl: string) => {
    try {
      // Store for retry
      lastCaseIdRef.current = caseId;
      lastImageUrlRef.current = imageUrl;

      // Generate job ID
      const jobId = crypto.randomUUID();

      // Set initial job state
      setAnalysisJob({
        jobId,
        caseId,
        status: 'processing',
        startedAt: new Date().toISOString(),
      });

      // Clear previous mesh data
      setMeshData(null);
      setFaceROI(null);

      toast.info('Iniciando análise facial...', {
        description: 'O processamento será feito em segundo plano.'
      });

      // Insert job record in database for polling
      const { error: insertError } = await supabase
        .from('facial_analysis_jobs')
        .insert({
          job_id: jobId,
          case_id: caseId,
          image_url: imageUrl,
          status: 'processing',
          timestamp_start: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Erro ao criar job no banco:', insertError);
        // Continue anyway - n8n callback will create if needed
      }

      // Send POST to n8n webhook
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          case_id: caseId,
          image_url: imageUrl,
          job_id: jobId,
          callback_url: 'https://kekxxyqkrlmajkndwboj.supabase.co/functions/v1/webhook-n8n-notification',
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro ao disparar webhook: ${response.status}`);
      }

      // Start polling for status
      startPolling(caseId);

    } catch (error) {
      console.error('Erro ao disparar análise:', error);
      setAnalysisJob(prev => prev ? {
        ...prev,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
      } : null);
      toast.error('Erro ao iniciar análise', {
        description: 'Não foi possível conectar ao serviço de processamento.'
      });
    }
  }, [startPolling]);

  // Retry last analysis
  const retryAnalysis = useCallback(async () => {
    if (lastCaseIdRef.current && lastImageUrlRef.current) {
      await triggerAnalysis(lastCaseIdRef.current, lastImageUrlRef.current);
    }
  }, [triggerAnalysis]);

  // Clear job state
  const clearJob = useCallback(() => {
    stopPolling();
    setAnalysisJob(null);
    setMeshData(null);
    setFaceROI(null);
  }, [stopPolling]);

  const isProcessing = analysisJob?.status === 'processing';

  return {
    analysisJob,
    isProcessing,
    meshData,
    faceROI,
    triggerAnalysis,
    retryAnalysis,
    clearJob,
    meshDensity,
    setMeshDensity,
  };
};
