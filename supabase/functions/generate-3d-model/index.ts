import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { jsonResponse, preflight } from "../_shared/cors.ts";
import { canAccessCase, resolveCaller } from "../_shared/auth.ts";
import { downloadWithLimit, fetchWithTimeout } from "../_shared/http.ts";

const MESHY_API_URL = "https://api.meshy.ai";

// C-4: prazos por tipo de chamada. Criar e consultar tarefa são operações rápidas da
// API; baixar o modelo é transferência de arquivo e merece muito mais folga.
const MESHY_API_TIMEOUT_MS = 30_000;
const MODEL_DOWNLOAD_TIMEOUT_MS = 120_000;
// O alvo é 50.000 polígonos; um GLB assim fica na casa de poucos megabytes. 200 MB é
// teto largo o bastante para não recusar caso legítimo e estreito o bastante para não
// deixar a função tentar carregar um arquivo absurdo na memória.
const MAX_MODEL_BYTES = 200 * 1024 * 1024;

interface MeshyTaskResponse {
  result: string;
}

interface MeshyTaskStatus {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  progress: number;
  model_urls?: {
    glb?: string;
    fbx?: string;
    obj?: string;
    usdz?: string;
  };
  thumbnail_url?: string;
  task_error?: {
    message: string;
  };
}

async function createMeshyTask(imageUrl: string, apiKey: string): Promise<string> {
  console.log("Creating Meshy task for image:", imageUrl);
  
  const response = await fetchWithTimeout(`${MESHY_API_URL}/openapi/v1/image-to-3d`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      ai_model: "meshy-6-turbo",
      topology: "triangle",
      target_polycount: 50000,
      symmetry_mode: "auto",
      should_remesh: true,
    }),
  }, MESHY_API_TIMEOUT_MS);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Meshy API error:", response.status, errorText);
    throw new Error(`Meshy API error: ${response.status} - ${errorText}`);
  }

  const data: MeshyTaskResponse = await response.json();
  console.log("Meshy task created:", data.result);
  return data.result;
}

async function checkMeshyTaskStatus(taskId: string, apiKey: string): Promise<MeshyTaskStatus> {
  const response = await fetchWithTimeout(`${MESHY_API_URL}/openapi/v1/image-to-3d/${taskId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  }, MESHY_API_TIMEOUT_MS);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Meshy status check error:", response.status, errorText);
    throw new Error(`Meshy status check error: ${response.status}`);
  }

  return await response.json();
}

/** Código do Postgres para violação de restrição única. */
const UNIQUE_VIOLATION = "23505";

/** A linha já gravada para esta tarefa da Meshy, se existir. */
async function findScanByTask(supabase: SupabaseClient, taskId: string) {
  const { data, error } = await supabase
    .from("case_3d_scans")
    .select("*")
    .eq("meshy_task_id", taskId)
    .maybeSingle();

  if (error) {
    console.error("Falha ao consultar scan por task_id:", error.message);
    return null;
  }
  return data;
}

async function downloadAndUploadModel(
  glbUrl: string,
  caseId: string,
  supabase: any
): Promise<{ storagePath: string; publicUrl: string }> {
  console.log("Downloading GLB from Meshy:", glbUrl);

  const uint8Array = await downloadWithLimit(
    glbUrl,
    MAX_MODEL_BYTES,
    MODEL_DOWNLOAD_TIMEOUT_MS,
  );

  const fileName = `${caseId}/meshy-${Date.now()}.glb`;
  
  console.log("Uploading to Supabase Storage:", fileName);
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("case-3d-models")
    .upload(fileName, uint8Array, {
      contentType: "model/gltf-binary",
      upsert: false,
    });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("case-3d-models")
    .getPublicUrl(fileName);

  return {
    storagePath: fileName,
    publicUrl: urlData.publicUrl,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return preflight(req);
  }

  try {
    // S-1: quem está chamando? Sem isso, a chave de serviço logo abaixo torna o RLS
    // do banco irrelevante para esta rota.
    const caller = await resolveCaller(req);
    if (!caller) {
      return jsonResponse(req, { error: "Autenticação obrigatória" }, 401);
    }

    const MESHY_API_KEY = Deno.env.get("MESHY_API_KEY");
    if (!MESHY_API_KEY) {
      throw new Error("MESHY_API_KEY is not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { image_url, case_id, action, task_id } = await req.json();

    // Action: check status of existing task
    if (action === "status" && task_id) {
      // S-1: a resposta da Meshy traz as URLs do modelo pronto. Sem amarrar a consulta a
      // um caso do próprio chamador, qualquer autenticado que descobrisse um task_id
      // receberia o modelo 3D de outro paciente.
      if (!case_id || !(await canAccessCase(caller, case_id))) {
        return jsonResponse(req, { error: "Sem acesso a este caso" }, 403);
      }

      console.log("Checking status for task:", task_id);
      const status = await checkMeshyTaskStatus(task_id, MESHY_API_KEY);
      
      return jsonResponse(req, {
        task_id,
        status: status.status,
        progress: status.progress,
        model_urls: status.model_urls,
        thumbnail_url: status.thumbnail_url,
        error: status.task_error?.message,
      });
    }

    // Action: finalize - download and save model
    if (action === "finalize" && task_id && case_id) {
      // S-1: o caso vem do corpo da requisição. Perguntar ao banco COM O TOKEN DO
      // CHAMADOR é o que impede gravar o modelo 3D no caso de outra pessoa.
      if (!(await canAccessCase(caller, case_id))) {
        return jsonResponse(req, { error: "Sem acesso a este caso" }, 403);
      }

      console.log("Finalizing task:", task_id);

      // C-2: esta tarefa já foi finalizada? O cliente consulta a cada 5s por até dez
      // minutos, e um retry ou uma segunda aba criariam um segundo download e uma
      // segunda linha do mesmo modelo.
      const existing = await findScanByTask(supabase, task_id);
      if (existing) {
        console.log("Task already finalized, returning existing scan:", existing.id);
        return jsonResponse(req, { success: true, scan: existing, reused: true });
      }

      const status = await checkMeshyTaskStatus(task_id, MESHY_API_KEY);

      if (status.status !== "SUCCEEDED" || !status.model_urls?.glb) {
        throw new Error("Task not completed or GLB not available");
      }

      const { storagePath, publicUrl } = await downloadAndUploadModel(
        status.model_urls.glb,
        case_id,
        supabase
      );

      // Insert record into case_3d_scans
      const { data: scanRecord, error: insertError } = await supabase
        .from("case_3d_scans")
        .insert({
          case_id,
          meshy_task_id: task_id,
          file_name: `meshy-model-${Date.now()}.glb`,
          file_url: publicUrl,
          storage_path: storagePath,
          scan_source: "meshy-ai",
          scan_type: "face",
          notes: "Modelo 3D gerado automaticamente via Meshy AI",
        })
        .select()
        .single();

      if (insertError) {
        // C-2: duas finalizações simultâneas passam as duas pela consulta acima — é o
        // índice único que decide. Quem perder a corrida encontra a linha da outra e
        // devolve ela, em vez de estourar um erro que o usuário não pode resolver.
        if (insertError.code === UNIQUE_VIOLATION) {
          const winner = await findScanByTask(supabase, task_id);
          if (winner) {
            console.log("Perdeu a corrida de finalização; devolvendo:", winner.id);
            // O upload desta chamada virou órfão: a linha aponta para o do vencedor.
            await supabase.storage.from("case-3d-models").remove([storagePath]);
            return jsonResponse(req, { success: true, scan: winner, reused: true });
          }
        }
        console.error("Database insert error:", insertError);
        throw new Error(`Failed to save scan record: ${insertError.message}`);
      }

      console.log("3D model saved successfully:", scanRecord.id);

      return jsonResponse(req, { success: true, scan: scanRecord });
    }

    // Action: create new task (default)
    if (!image_url || !case_id) {
      throw new Error("Missing required fields: image_url and case_id");
    }

    // S-1: gerar modelo custa crédito da Meshy e é sempre em nome de um caso.
    if (!(await canAccessCase(caller, case_id))) {
      return jsonResponse(req, { error: "Sem acesso a este caso" }, 403);
    }

    const taskId = await createMeshyTask(image_url, MESHY_API_KEY);

    return jsonResponse(req, {
      success: true,
      task_id: taskId,
      message: "3D model generation started. Use action='status' to check progress.",
    });

  } catch (error) {
    console.error("Error in generate-3d-model:", error);
    return jsonResponse(
      req,
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
