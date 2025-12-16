// Hook for asynchronous facial analysis via n8n workflow
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { N8N_FACIAL_ANALYSIS_WEBHOOK, POLLING_INTERVAL_MS, MAX_POLLING_ATTEMPTS } from '@/lib/config';
import { toast } from 'sonner';
import type { FacialMeshData, FacialPoint, MeshDensity, FaceROI, AnatomicalRegion } from '@/types/facialLandmarks';
import { getConnectionsByDensity } from '@/types/facialLandmarks';
import type { MediaPipeMeshData, MediaPipeWebhookResponse } from '@/types/mediapipeMesh';

export type AnalysisJobStatus = 'idle' | 'processing' | 'completed' | 'failed';

interface AnalysisJob {
  jobId: string;
  caseId: string;
  status: AnalysisJobStatus;
  errorMessage?: string;
  errorStage?: string;
  startedAt: string;
}

// New version created after simulation
export interface CreatedVersion {
  id: string;
  name: string;
  type: 'A' | 'B';
}

interface UseN8nFacialAnalysisReturn {
  // Job state
  analysisJob: AnalysisJob | null;
  isProcessing: boolean;
  
  // Mesh data
  meshData: FacialMeshData | null;
  faceROI: FaceROI | null;
  
  // MediaPipe mesh data (real landmarks)
  mediaPipeMeshData: MediaPipeMeshData | null;
  
  // Actions
  triggerAnalysis: (caseId: string, imageUrl: string, photoId?: string) => Promise<void>;
  triggerSimulation: (caseId: string, imageUrl: string, targetVersion: 'A' | 'B', photoId?: string) => Promise<void>;
  retryAnalysis: () => Promise<void>;
  clearJob: () => void;
  
  // Created version after simulation
  createdVersion: CreatedVersion | null;
  clearCreatedVersion: () => void;
  
  // Mesh settings
  meshDensity: MeshDensity;
  setMeshDensity: (density: MeshDensity) => void;
}

export const useN8nFacialAnalysis = (): UseN8nFacialAnalysisReturn => {
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [meshData, setMeshData] = useState<FacialMeshData | null>(null);
  const [mediaPipeMeshData, setMediaPipeMeshData] = useState<MediaPipeMeshData | null>(null);
  const [faceROI, setFaceROI] = useState<FaceROI | null>(null);
  const [meshDensity, setMeshDensity] = useState<MeshDensity>('dense');
  const [createdVersion, setCreatedVersion] = useState<CreatedVersion | null>(null);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollingCountRef = useRef(0);
  const lastImageUrlRef = useRef<string>('');
  const lastCaseIdRef = useRef<string>('');
  const lastPhotoIdRef = useRef<string | undefined>(undefined);
  const targetVersionRef = useRef<'A' | 'B' | null>(null);
  const isSimulationModeRef = useRef(false);

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
      
      // RUNTIME SAFETY: Only process if status is landmarks_ready and points is a valid array
      const rawPoints = analysis.points;
      if (analysis.status !== 'landmarks_ready' || !Array.isArray(rawPoints) || rawPoints.length === 0) {
        console.log('Analysis not ready or no valid points:', analysis.status);
        return null;
      }

      // Process points with validation
      const points: FacialPoint[] = rawPoints.map((p: any) => ({
        id: p.id,
        name: p.name || p.id,
        x: p.x,
        y: p.y,
        region: p.region || 'midline' as AnatomicalRegion,
        adjacentRegions: Array.isArray(p.adjacentRegions) ? p.adjacentRegions : [],
      }));

      const roi: FaceROI = (analysis.face_roi as any) || { x: 0, y: 0, width: 1, height: 1 };
      const midlinePoints: string[] = Array.isArray(analysis.midline_points) ? analysis.midline_points : [];

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
  const pollJobStatus = useCallback(async (caseId: string, photoId?: string) => {
    console.log('[Polling] Checking job status for case:', caseId, 'photo:', photoId);
    
    const { data, error } = await supabase
      .from('facial_analysis_jobs')
      .select('status, error_message, error_stage, job_id, timestamp_start')
      .eq('case_id', caseId)
      .order('timestamp_start', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[Polling] Error checking status:', error);
      return;
    }

    console.log('[Polling] Job data:', data);

    if (data && data.length > 0) {
      const job = data[0];
      // Normalize status - handle both English and Portuguese
      let status: AnalysisJobStatus = 'processing';
      const rawStatus = job.status?.toLowerCase();
      if (rawStatus === 'success' || rawStatus === 'completed' || rawStatus === 'pronto') {
        status = 'completed';
      } else if (rawStatus === 'failed' || rawStatus === 'falhou') {
        status = 'failed';
      } else if (rawStatus === 'processing' || rawStatus === 'processando' || rawStatus === 'pending') {
        status = 'processing';
      }

      console.log('[Polling] Normalized status:', rawStatus, '->', status);

      setAnalysisJob(prev => prev ? {
        ...prev,
        status,
        errorMessage: job.error_message || undefined,
        errorStage: job.error_stage || undefined,
      } : null);

      if (status === 'completed') {
        stopPolling();
        
        // Try to fetch MediaPipe mesh from facial_analyses
        if (photoId) {
          const { data: analysisData, error: analysisError } = await supabase
            .from('facial_analyses')
            .select('mesh, status')
            .eq('photo_id', photoId)
            .single();
          
          console.log('[Polling] Fetched analysis:', analysisData, analysisError);
          
          if (analysisData?.mesh && analysisData.status === 'landmarks_ready') {
            const meshData = analysisData.mesh as unknown as MediaPipeMeshData;
            console.log('[Polling] MediaPipe mesh found:', meshData.points?.length, 'points');
            setMediaPipeMeshData(meshData);
            toast.success('Mesh facial carregado!', {
              description: `${meshData.points?.length || 0} landmarks detectados.`
            });
            return;
          }
        }
        
        // Fallback to old format
        await fetchAnalysisResults(caseId);
        
        // If in simulation mode, create new version
        if (isSimulationModeRef.current && targetVersionRef.current) {
          const versionName = `Análise Facial ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
          
          const { data: newVersion, error: versionError } = await supabase
            .from('case_versions')
            .insert({
              case_id: caseId,
              name: versionName,
              type: targetVersionRef.current,
              status: 'pronto',
              description: 'Versão criada automaticamente após análise facial via n8n',
            })
            .select()
            .single();
          
          if (!versionError && newVersion) {
            setCreatedVersion({
              id: newVersion.id,
              name: newVersion.name,
              type: newVersion.type as 'A' | 'B',
            });
            toast.success('Análise facial concluída!', {
              description: `Nova versão "${versionName}" criada com sucesso.`
            });
          } else {
            console.error('Erro ao criar versão:', versionError);
            toast.success('Análise facial concluída!', {
              description: 'Os landmarks foram detectados com sucesso.'
            });
          }
          
          isSimulationModeRef.current = false;
          targetVersionRef.current = null;
        } else {
          toast.success('Análise facial concluída!', {
            description: 'Os landmarks foram detectados com sucesso.'
          });
        }
      } else if (status === 'failed') {
        stopPolling();
        isSimulationModeRef.current = false;
        targetVersionRef.current = null;
        toast.error('Análise facial falhou', {
          description: job.error_message || 'Erro desconhecido durante o processamento.'
        });
      }
    }

    // Check if exceeded max polling attempts
    pollingCountRef.current++;
    console.log('[Polling] Attempt:', pollingCountRef.current, '/', MAX_POLLING_ATTEMPTS);
    
    if (pollingCountRef.current >= MAX_POLLING_ATTEMPTS) {
      stopPolling();
      isSimulationModeRef.current = false;
      targetVersionRef.current = null;
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
  const startPolling = useCallback((caseId: string, photoId?: string) => {
    stopPolling();
    pollingCountRef.current = 0;
    
    console.log('[Polling] Starting polling for case:', caseId, 'photo:', photoId);
    
    // Initial poll
    pollJobStatus(caseId, photoId);
    
    // Set up interval
    pollingRef.current = setInterval(() => {
      pollJobStatus(caseId, photoId);
    }, POLLING_INTERVAL_MS);
  }, [stopPolling, pollJobStatus]);

  // Trigger analysis via n8n webhook
  const triggerAnalysis = useCallback(async (caseId: string, imageUrl: string, photoId?: string) => {
    try {
      // Store for retry
      lastCaseIdRef.current = caseId;
      lastImageUrlRef.current = imageUrl;
      lastPhotoIdRef.current = photoId;

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
      setMediaPipeMeshData(null);
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
      console.log('[Analysis] Sending to n8n webhook:', N8N_FACIAL_ANALYSIS_WEBHOOK);
      console.log('[Analysis] Payload:', { job_id: jobId, case_id: caseId, image_url: imageUrl, photo_id: photoId });
      
      const response = await fetch(N8N_FACIAL_ANALYSIS_WEBHOOK, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: jobId,
          case_id: caseId,
          image_url: imageUrl,
          photo_id: photoId || null,
          mode: "clinical",
        }),
      });

      console.log('[Analysis] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Analysis] Error response:', errorText);
        setAnalysisJob(prev => prev ? {
          ...prev,
          status: 'failed',
          errorMessage: `Falha de processamento: ${response.status}`,
        } : null);
        toast.error('Falha de processamento', {
          description: 'Não foi possível iniciar a análise facial.'
        });
        return;
      }

      // Try to parse immediate response with MediaPipe data
      try {
        const responseText = await response.text();
        console.log('[Analysis] Response body:', responseText);
        
        if (responseText) {
          const responseData = JSON.parse(responseText) as MediaPipeWebhookResponse;
          console.log('[Analysis] Parsed response:', responseData);
          
          // Check for face_mesh in response (n8n returns synchronously)
          if ((responseData.status === 'success' || responseData.status === 'completed') && responseData.face_mesh) {
            console.log('[Analysis] Immediate mesh data received!', responseData.face_mesh.points?.length, 'points');
            setMediaPipeMeshData(responseData.face_mesh);
            setAnalysisJob(prev => prev ? { ...prev, status: 'completed' } : null);
            toast.success('Mesh facial carregado!', {
              description: `${responseData.face_mesh.points?.length || 0} landmarks detectados.`
            });
            return;
          }
        }
      } catch (parseError) {
        console.log('[Analysis] Response is not JSON, starting polling...', parseError);
      }

      // Start polling for status (async workflow)
      console.log('[Analysis] Starting async polling...');
      startPolling(caseId, photoId);

    } catch (error) {
      console.error('[Analysis] Error triggering analysis:', error);
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
      if (isSimulationModeRef.current && targetVersionRef.current) {
        await triggerSimulation(
          lastCaseIdRef.current,
          lastImageUrlRef.current,
          targetVersionRef.current,
          lastPhotoIdRef.current
        );
      } else {
        await triggerAnalysis(lastCaseIdRef.current, lastImageUrlRef.current, lastPhotoIdRef.current);
      }
    }
  }, [triggerAnalysis]);

  // Trigger simulation with version creation
  const triggerSimulation = useCallback(async (caseId: string, imageUrl: string, targetVersion: 'A' | 'B', photoId?: string) => {
    // Set simulation mode flags before triggering
    isSimulationModeRef.current = true;
    targetVersionRef.current = targetVersion;
    setCreatedVersion(null);
    
    // Use the same triggerAnalysis flow
    await triggerAnalysis(caseId, imageUrl, photoId);
  }, [triggerAnalysis]);

  // Clear job state
  const clearJob = useCallback(() => {
    stopPolling();
    setAnalysisJob(null);
    setMeshData(null);
    setMediaPipeMeshData(null);
    setFaceROI(null);
    isSimulationModeRef.current = false;
    targetVersionRef.current = null;
  }, [stopPolling]);

  // Clear created version state
  const clearCreatedVersion = useCallback(() => {
    setCreatedVersion(null);
  }, []);

  const isProcessing = analysisJob?.status === 'processing';

  return {
    analysisJob,
    isProcessing,
    meshData,
    faceROI,
    mediaPipeMeshData,
    triggerAnalysis,
    triggerSimulation,
    retryAnalysis,
    clearJob,
    createdVersion,
    clearCreatedVersion,
    meshDensity,
    setMeshDensity,
  };
};
