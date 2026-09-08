// Hook para gerenciar o mesh facial MediaPipe.
//
// A detecção roda no próprio navegador (src/lib/faceLandmarker.ts). Antes este hook
// disparava um webhook n8n e ficava consultando `facial_analysis_jobs` a cada 3s por até
// 3 minutos; agora o resultado chega em milissegundos, sem fila, sem job e sem serviço
// externo. O resultado é gravado em `facial_analyses` para sobreviver ao reload.
import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { detectFaceLandmarks, NoFaceDetectedError } from '@/lib/faceLandmarker';
import { MediaPipeMeshData } from '@/types/mediapipeMesh';
import { type MeshDensity } from '@/types/facialLandmarks';

export type MeshVisualStyle = 'minimal' | 'standard' | 'detailed';
export type AnalysisStatus = 'idle' | 'processing' | 'completed' | 'failed';

// Re-export MeshDensity for backwards compatibility
export { MeshDensity };

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
  visualStyle: MeshVisualStyle;
  setVisualStyle: (style: MeshVisualStyle) => void;

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
  const [density, setDensity] = useState<MeshDensity>('clinico');
  const [visualStyle, setVisualStyle] = useState<MeshVisualStyle>('minimal');
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Evita que um resultado antigo sobrescreva o mesh se o usuário trocar de foto
  // enquanto a análise anterior ainda está rodando.
  const runIdRef = useRef(0);

  const clearMesh = useCallback(() => {
    runIdRef.current += 1;
    setMeshData(null);
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  const triggerAnalysis = useCallback(
    async (caseId: string, imageUrl: string, photoId?: string) => {
      const runId = ++runIdRef.current;

      setStatus('processing');
      setErrorMessage(null);
      setMeshData(null);

      try {
        const mesh = await detectFaceLandmarks(imageUrl);

        // Outra análise começou (ou o mesh foi limpo) enquanto esta rodava.
        if (runId !== runIdRef.current) return;

        setMeshData(mesh);
        setStatus('completed');
        toast.success('Mesh facial detectado!', {
          description: `${mesh.points.length} landmarks identificados.`,
        });

        // Persistência é acessória: se falhar, a análise segue válida na tela.
        if (photoId) {
          const { error } = await supabase.from('facial_analyses').upsert(
            {
              case_id: caseId,
              photo_id: photoId,
              // Mesmo padrão de serialização usado em useMeshAutoSave para colunas jsonb.
              mesh: JSON.parse(JSON.stringify(mesh)),
              status: 'landmarks_ready',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'photo_id' },
          );

          if (error) {
            console.error('[MediaPipe] Falha ao salvar o mesh:', error);
            toast.warning('Mesh detectado, mas não foi salvo', {
              description: 'Ele continua visível nesta sessão. Tente analisar novamente.',
            });
          }
        }
      } catch (error) {
        if (runId !== runIdRef.current) return;

        const message =
          error instanceof NoFaceDetectedError
            ? 'Nenhum rosto detectado. Verifique se a foto mostra a face de frente e com boa iluminação.'
            : error instanceof Error
              ? error.message
              : 'Erro desconhecido durante a detecção.';

        console.error('[MediaPipe] Erro na detecção:', error);
        setStatus('failed');
        setErrorMessage(message);
        toast.error('Não foi possível detectar o mesh facial', { description: message });
      }
    },
    [],
  );

  return {
    meshData,
    setMeshData,
    visible,
    setVisible,
    opacity,
    setOpacity,
    density,
    setDensity,
    visualStyle,
    setVisualStyle,
    status,
    errorMessage,
    triggerAnalysis,
    clearMesh,
  };
};
