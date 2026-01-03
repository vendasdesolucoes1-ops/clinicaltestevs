import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Meshy3DState {
  isGenerating: boolean;
  taskId: string | null;
  progress: number;
  status: 'idle' | 'creating' | 'processing' | 'finalizing' | 'completed' | 'error';
  error: string | null;
}

interface MeshyScanResult {
  id: string;
  case_id: string;
  file_name: string;
  file_url: string;
  storage_path: string;
  scan_source: string;
  scan_type: string;
  notes: string;
  created_at: string;
}

export function useMeshy3D(onSuccess?: (scan: MeshyScanResult) => void) {
  const [state, setState] = useState<Meshy3DState>({
    isGenerating: false,
    taskId: null,
    progress: 0,
    status: 'idle',
    error: null,
  });

  const pollTaskStatus = useCallback(async (taskId: string, caseId: string) => {
    const maxAttempts = 120; // 10 minutes max (5 seconds per poll)
    let attempts = 0;

    const poll = async (): Promise<void> => {
      if (attempts >= maxAttempts) {
        setState(prev => ({
          ...prev,
          isGenerating: false,
          status: 'error',
          error: 'Timeout: geração demorou mais de 10 minutos',
        }));
        toast.error('Timeout na geração do modelo 3D');
        return;
      }

      attempts++;

      try {
        const { data, error } = await supabase.functions.invoke('generate-3d-model', {
          body: { action: 'status', task_id: taskId },
        });

        if (error) throw error;

        console.log('Meshy status:', data);

        setState(prev => ({
          ...prev,
          progress: data.progress || 0,
        }));

        if (data.status === 'SUCCEEDED') {
          // Finalize: download and save model
          setState(prev => ({ ...prev, status: 'finalizing', progress: 95 }));
          
          const { data: finalData, error: finalError } = await supabase.functions.invoke('generate-3d-model', {
            body: { action: 'finalize', task_id: taskId, case_id: caseId },
          });

          if (finalError) throw finalError;

          setState({
            isGenerating: false,
            taskId: null,
            progress: 100,
            status: 'completed',
            error: null,
          });

          toast.success('Modelo 3D gerado com sucesso!');
          onSuccess?.(finalData.scan);
          return;
        }

        if (data.status === 'FAILED' || data.status === 'EXPIRED') {
          throw new Error(data.error || 'Falha na geração do modelo 3D');
        }

        // Continue polling
        setTimeout(poll, 5000);
      } catch (err) {
        console.error('Polling error:', err);
        setState(prev => ({
          ...prev,
          isGenerating: false,
          status: 'error',
          error: err instanceof Error ? err.message : 'Erro ao verificar status',
        }));
        toast.error('Erro ao gerar modelo 3D');
      }
    };

    await poll();
  }, [onSuccess]);

  const generateModel = useCallback(async (imageUrl: string, caseId: string) => {
    if (!imageUrl || !caseId) {
      toast.error('Foto e caso são obrigatórios');
      return;
    }

    setState({
      isGenerating: true,
      taskId: null,
      progress: 0,
      status: 'creating',
      error: null,
    });

    try {
      toast.info('Iniciando geração do modelo 3D...', {
        description: 'Este processo pode levar 1-3 minutos',
      });

      const { data, error } = await supabase.functions.invoke('generate-3d-model', {
        body: { image_url: imageUrl, case_id: caseId },
      });

      if (error) throw error;

      if (!data.task_id) {
        throw new Error('Nenhum task_id retornado');
      }

      setState(prev => ({
        ...prev,
        taskId: data.task_id,
        status: 'processing',
      }));

      // Start polling
      await pollTaskStatus(data.task_id, caseId);
    } catch (err) {
      console.error('Generate model error:', err);
      setState(prev => ({
        ...prev,
        isGenerating: false,
        status: 'error',
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      }));
      toast.error('Erro ao iniciar geração do modelo 3D');
    }
  }, [pollTaskStatus]);

  const reset = useCallback(() => {
    setState({
      isGenerating: false,
      taskId: null,
      progress: 0,
      status: 'idle',
      error: null,
    });
  }, []);

  return {
    ...state,
    generateModel,
    reset,
  };
}
