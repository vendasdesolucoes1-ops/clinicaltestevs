// Hook for asynchronous facial analysis via n8n workflow
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { N8N_FACIAL_ANALYSIS_WEBHOOK, POLLING_INTERVAL_MS, MAX_POLLING_ATTEMPTS } from '@/lib/config';
import { toast } from 'sonner';
import type { FacialMeshData, FacialPoint, MeshDensity, FaceROI, AnatomicalRegion } from '@/types/facialLandmarks';
import { getConnectionsByDensity } from '@/types/facialLandmarks';
import type { MediaPipeMeshData, MediaPipeWebhookResponse, MediaPipePoint } from '@/types/mediapipeMesh';
import { MEDIAPIPE_DENSE_CONNECTIONS } from '@/types/mediapipeMesh';

export type AnalysisJobStatus = 'idle' | 'processing' | 'completed' | 'failed';

interface AnalysisJob {
  jobId?: string;  // Opcional - gerado pelo backend
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
  cancelAnalysis: () => void;
  clearJob: () => void;
  
  // Created version after simulation
  createdVersion: CreatedVersion | null;
  clearCreatedVersion: () => void;
  
  // Mesh settings
  meshDensity: MeshDensity;
  setMeshDensity: (density: MeshDensity) => void;
}

// Normalize job status coming from n8n (tolerates misspellings like "sucess")
const SUCCESS_STATUSES = ['success', 'sucess', 'succes', 'sucesso', 'ok', 'done', 'completed', 'complete', 'concluido', 'pronto'];
const FAILED_STATUSES = ['failed', 'fail', 'falhou', 'error', 'erro'];

function normalizeJobStatus(raw?: string | null): AnalysisJobStatus {
  const s = (raw || '').toLowerCase().trim();
  if (SUCCESS_STATUSES.includes(s)) return 'completed';
  if (FAILED_STATUSES.includes(s)) return 'failed';
  return 'processing';
}

export const useN8nFacialAnalysis = (): UseN8nFacialAnalysisReturn => {
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [meshData, setMeshData] = useState<FacialMeshData | null>(null);
  const [mediaPipeMeshData, setMediaPipeMeshData] = useState<MediaPipeMeshData | null>(null);
  const [faceROI, setFaceROI] = useState<FaceROI | null>(null);
  const [meshDensity, setMeshDensity] = useState<MeshDensity>('clinico');
  const [createdVersion, setCreatedVersion] = useState<CreatedVersion | null>(null);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollingCountRef = useRef(0);
  const lastImageUrlRef = useRef<string>('');
  const lastCaseIdRef = useRef<string>('');
  const lastPhotoIdRef = useRef<string | undefined>(undefined);
  const targetVersionRef = useRef<'A' | 'B' | null>(null);
  const isSimulationModeRef = useRef(false);
  const currentJobIdRef = useRef<string | null>(null);

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
    const jobId = currentJobIdRef.current;
    console.log('[Polling] Checking job status. job:', jobId, 'case:', caseId, 'photo:', photoId);

    let query = supabase
      .from('facial_analysis_jobs')
      .select('status, error_message, error_stage, job_id, timestamp_start');

    // Prefer the job this session created, so old rows can't confuse us
    query = jobId
      ? query.eq('job_id', jobId)
      : query.eq('case_id', caseId).order('timestamp_start', { ascending: false });

    const { data, error } = await query.limit(1);

    if (error) {
      console.error('[Polling] Error checking status:', error);
      return;
    }

    console.log('[Polling] Job data:', data);

    if (data && data.length > 0) {
      const job = data[0];
      const rawStatus = job.status?.toLowerCase();
      const status = normalizeJobStatus(job.status);

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

      // Set initial job state (sem job_id - será gerado pelo backend)
      setAnalysisJob({
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

      // Send POST to n8n webhook
      console.log('[Analysis] Sending to n8n webhook:', N8N_FACIAL_ANALYSIS_WEBHOOK);
      console.log('[Analysis] Payload:', { case_id: caseId, photo_id: photoId, image_url: imageUrl, mode: 'clinical' });
      
      const response = await fetch(N8N_FACIAL_ANALYSIS_WEBHOOK, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          case_id: caseId,
          photo_id: photoId,
          image_url: imageUrl,
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
        console.log('[Analysis] Response body (raw):', responseText.substring(0, 500));
        
        if (responseText) {
          const responseData = JSON.parse(responseText) as MediaPipeWebhookResponse;
          console.log('[Analysis] Parsed response status:', responseData.status);
          console.log('[Analysis] face_mesh present:', !!responseData.face_mesh);
          console.log('[Analysis] landmarks present:', !!responseData.landmarks);
          console.log('[Analysis] points present:', !!responseData.points);
          
          // Check if status indicates success
          const isSuccess = responseData.status === 'success' || responseData.status === 'completed';
          
          // Try to extract mesh data from various formats
          let meshPoints: MediaPipePoint[] | null = null;
          let meshConnections: [number, number][] = [];
          
          // Format 1: Wrapped in face_mesh (preferred)
          if (responseData.face_mesh?.points && Array.isArray(responseData.face_mesh.points)) {
            meshPoints = responseData.face_mesh.points;
            meshConnections = responseData.face_mesh.connections || [];
            console.log('[Analysis] Using face_mesh.points format');
          }
          // Format 2: Flat landmarks array (n8n current output)
          else if (responseData.landmarks && Array.isArray(responseData.landmarks)) {
            meshPoints = responseData.landmarks;
            meshConnections = responseData.connections || [];
            console.log('[Analysis] Using flat landmarks format');
          }
          // Format 3: Flat points array
          else if (responseData.points && Array.isArray(responseData.points)) {
            meshPoints = responseData.points;
            meshConnections = responseData.connections || [];
            console.log('[Analysis] Using flat points format');
          }
          
          if (isSuccess && meshPoints && meshPoints.length > 0) {
            // Filter out null/undefined/invalid points
            const validPoints = meshPoints.filter((p): p is MediaPipePoint => 
              p !== null && 
              p !== undefined && 
              typeof p.id === 'number' && 
              typeof p.x === 'number' && 
              typeof p.y === 'number'
            );
            
            console.log('[Analysis] Valid points:', validPoints.length, 'of', meshPoints.length);
            
            // Use default connections if none provided
            const finalConnections = meshConnections.length > 0 
              ? meshConnections.filter(c => Array.isArray(c) && c.length === 2)
              : MEDIAPIPE_DENSE_CONNECTIONS;
            
            console.log('[Analysis] Using connections:', finalConnections.length);
            
            if (validPoints.length > 0) {
              const finalMeshData: MediaPipeMeshData = {
                points: validPoints,
                connections: finalConnections,
              };
              
              setMediaPipeMeshData(finalMeshData);
              setAnalysisJob(prev => prev ? { ...prev, status: 'completed' } : null);
              toast.success('Mesh facial carregado!', {
                description: `${validPoints.length} landmarks detectados.`
              });
              console.log('[Analysis] SUCCESS - Mesh rendered with', validPoints.length, 'points');
              return;
            }
          }
          
          console.log('[Analysis] No valid mesh data in response, starting polling...');
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

  // Cancel analysis (user-initiated)
  const cancelAnalysis = useCallback(() => {
    stopPolling();
    setAnalysisJob(null);
    isSimulationModeRef.current = false;
    targetVersionRef.current = null;
    toast.info('Análise cancelada', {
      description: 'O processamento foi interrompido pelo usuário.'
    });
  }, [stopPolling]);

  // Clear job state (silent)
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
    cancelAnalysis,
    clearJob,
    createdVersion,
    clearCreatedVersion,
    meshDensity,
    setMeshDensity,
  };
};
