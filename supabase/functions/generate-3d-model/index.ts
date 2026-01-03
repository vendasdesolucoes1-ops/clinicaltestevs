import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MESHY_API_URL = "https://api.meshy.ai";

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
  
  const response = await fetch(`${MESHY_API_URL}/openapi/v1/image-to-3d`, {
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
  });

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
  const response = await fetch(`${MESHY_API_URL}/openapi/v1/image-to-3d/${taskId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Meshy status check error:", response.status, errorText);
    throw new Error(`Meshy status check error: ${response.status}`);
  }

  return await response.json();
}

async function downloadAndUploadModel(
  glbUrl: string,
  caseId: string,
  supabase: any
): Promise<{ storagePath: string; publicUrl: string }> {
  console.log("Downloading GLB from Meshy:", glbUrl);
  
  const response = await fetch(glbUrl);
  if (!response.ok) {
    throw new Error(`Failed to download GLB: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
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
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
      console.log("Checking status for task:", task_id);
      const status = await checkMeshyTaskStatus(task_id, MESHY_API_KEY);
      
      return new Response(JSON.stringify({
        task_id,
        status: status.status,
        progress: status.progress,
        model_urls: status.model_urls,
        thumbnail_url: status.thumbnail_url,
        error: status.task_error?.message,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: finalize - download and save model
    if (action === "finalize" && task_id && case_id) {
      console.log("Finalizing task:", task_id);
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
        console.error("Database insert error:", insertError);
        throw new Error(`Failed to save scan record: ${insertError.message}`);
      }

      console.log("3D model saved successfully:", scanRecord.id);

      return new Response(JSON.stringify({
        success: true,
        scan: scanRecord,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: create new task (default)
    if (!image_url || !case_id) {
      throw new Error("Missing required fields: image_url and case_id");
    }

    const taskId = await createMeshyTask(image_url, MESHY_API_KEY);

    return new Response(JSON.stringify({
      success: true,
      task_id: taskId,
      message: "3D model generation started. Use action='status' to check progress.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-3d-model:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
