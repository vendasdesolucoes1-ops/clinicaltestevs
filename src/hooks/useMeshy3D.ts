import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Meshy3DState {
  isGenerating: boolean;
  taskId: string | null;
  progress: number;
  status: 'idle' | 'creating' | 'processing' | 'finalizing' | 'completed' | 'error';
  error: string | null;
  /** A Meshy recusou por plano: repetir não muda o resultado. */
  planBlocked: boolean;
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

/**
 * Mensagem real de uma falha de `supabase.functions.invoke`.
 *
 * O `FunctionsHttpError` traz sempre o mesmo texto genérico ("Edge Function returned a
 * non-2xx status code") e guarda a resposta em `context`. Sem ler o `context`, o motivo
 * — plano da Meshy esgotado, chave ausente, imagem inacessível — nunca chega à tela.
 *
 * `planBlocked` distingue "não adianta tentar de novo" de falha transitória.
 */
async function describeInvokeError(
  err: unknown,
): Promise<{ message: string; planBlocked: boolean }> {
  const context = (err as { context?: unknown })?.context;

  if (context instanceof Response) {
    const status = context.status;
    let detail = '';

    try {
      const body = await context.clone().text();
      if (body) {
        try {
          const parsed = JSON.parse(body) as { error?: string; message?: string };
          detail = parsed.error || parsed.message || body;
        } catch {
          detail = body;
        }
      }
    } catch {
      // Corpo já consumido ou ilegível: resta o status.
    }

    // 402 é decisão de plano da Meshy, não falha transitória: repetir não resolve.
    if (status === 402 || /no longer supported|NoMorePendingTasks/i.test(detail)) {
      return {
        message:
          'O plano da Meshy não permite mais gerar modelos 3D. Use a malha reconstruída a partir da foto.',
        planBlocked: true,
      };
    }

    return {
      message: detail ? `Meshy (${status}): ${detail}` : `Meshy respondeu ${status}`,
      planBlocked: false,
    };
  }

  return {
    message: err instanceof Error ? err.message : 'Erro desconhecido',
    planBlocked: false,
  };
}

export function useMeshy3D(onSuccess?: (scan: MeshyScanResult) => void) {
  const [state, setState] = useState<Meshy3DState>({
    isGenerating: false,
    taskId: null,
    progress: 0,
    status: 'idle',
    error: null,
    planBlocked: false,
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
          // O caso vai junto: a função confere o acesso antes de devolver as URLs do
          // modelo, e sem ele a consulta é recusada.
          body: { action: 'status', task_id: taskId, case_id: caseId },
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
            planBlocked: false,
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
        const { message, planBlocked } = await describeInvokeError(err);
        setState(prev => ({
          ...prev,
          isGenerating: false,
          status: 'error',
          error: message,
          planBlocked,
        }));
        toast.error('Erro ao gerar modelo 3D', { description: message });
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
      planBlocked: false,
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
      const { message, planBlocked } = await describeInvokeError(err);
      setState(prev => ({
        ...prev,
        isGenerating: false,
        status: 'error',
        error: message,
        planBlocked,
      }));
      toast.error('Erro ao iniciar geração do modelo 3D', { description: message });
    }
  }, [pollTaskStatus]);

  const reset = useCallback(() => {
    setState({
      isGenerating: false,
      taskId: null,
      progress: 0,
      status: 'idle',
      error: null,
      planBlocked: false,
    });
  }, []);

  return {
    ...state,
    generateModel,
    reset,
  };
}
