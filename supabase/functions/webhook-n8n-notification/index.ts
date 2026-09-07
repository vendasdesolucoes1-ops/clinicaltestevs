import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Support both old format and new MediaPipe format
interface WebhookPayload {
  job_id: string;
  case_id: string;
  photo_id?: string;
  status: 'success' | 'completed' | 'failed' | 'processing' | 'pronto' | 'falhou' | 'processando';
  image_url?: string;
  error_message?: string;
  
  // MediaPipe format (new)
  face_mesh?: {
    points: Array<{
      id: number;
      x: number;
      y: number;
      z?: number;
    }>;
    connections: Array<[number, number]>;
  };
  
  // Legacy format
  landmarks_data?: {
    points?: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      anatomicalRegion: string;
    }>;
    faceROI?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    midlinePoints?: string[];
  };
  mesh_data?: {
    connections?: Array<{
      from: string;
      to: string;
      type: string;
    }>;
    customConnections?: Array<{
      from: string;
      to: string;
    }>;
    customPoints?: Array<{
      id: string;
      x: number;
      y: number;
    }>;
  };
  symmetry_score?: number;
  regional_scores?: Record<string, number>;
}

// Normalize status to database enum
function normalizeStatus(status: string): 'pending' | 'processing' | 'success' | 'failed' {
  const statusMap: Record<string, 'pending' | 'processing' | 'success' | 'failed'> = {
    'success': 'success',
    'sucess': 'success',
    'succes': 'success',
    'sucesso': 'success',
    'ok': 'success',
    'done': 'success',
    'completed': 'success',
    'complete': 'success',
    'concluido': 'success',
    'pronto': 'success',
    'failed': 'failed',
    'falhou': 'failed',
    'processing': 'processing',
    'processando': 'processing',
    'pending': 'pending',
  };
  return statusMap[status.toLowerCase()] || 'processing';
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== Webhook n8n notification received ===');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: WebhookPayload = await req.json();
    console.log('Payload received:', JSON.stringify(payload, null, 2));

    const { 
      job_id, 
      case_id, 
      status,
      photo_id,
      face_mesh,
      landmarks_data, 
      mesh_data, 
      symmetry_score,
      regional_scores,
      error_message,
    } = payload;

    // Validate required fields
    if (!job_id || !case_id || !status) {
      console.error('Missing required fields: job_id, case_id, or status');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: job_id, case_id, status' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedStatus = normalizeStatus(status);
    console.log(`Status normalized: ${status} -> ${normalizedStatus}`);

    // Update facial_analysis_jobs table (not simulation_jobs)
    const jobUpdateData: Record<string, unknown> = {
      status: normalizedStatus,
    };

    if (normalizedStatus === 'success' || normalizedStatus === 'failed') {
      jobUpdateData.timestamp_end = new Date().toISOString();
    }

    if (error_message) {
      jobUpdateData.error_message = error_message;
    }

    console.log('Updating facial_analysis_jobs:', job_id, jobUpdateData);
    
    const { error: jobError } = await supabase
      .from('facial_analysis_jobs')
      .update(jobUpdateData)
      .eq('job_id', job_id);

    if (jobError) {
      console.error('Error updating facial_analysis_jobs:', jobError);
      // Don't fail - job might have been created with different ID format
    } else {
      console.log('Job status updated successfully');
    }

    // If we have MediaPipe face_mesh data, save to facial_analyses
    if (photo_id && face_mesh) {
      console.log('Saving MediaPipe face_mesh for photo:', photo_id);
      console.log('Points count:', face_mesh.points?.length);
      console.log('Connections count:', face_mesh.connections?.length);
      
      const analysisData: Record<string, unknown> = {
        case_id: case_id,
        photo_id: photo_id,
        mesh: face_mesh, // Store complete MediaPipe mesh
        status: 'landmarks_ready',
        updated_at: new Date().toISOString(),
      };

      if (symmetry_score !== undefined) {
        analysisData.symmetry_score = symmetry_score;
      }
      if (regional_scores) {
        analysisData.regional_scores = regional_scores;
      }

      // Upsert - insert or update if exists
      const { error: analysisError } = await supabase
        .from('facial_analyses')
        .upsert(analysisData, { 
          onConflict: 'photo_id',
          ignoreDuplicates: false 
        });

      if (analysisError) {
        console.error('Error upserting facial_analyses:', analysisError);
      } else {
        console.log('MediaPipe face_mesh saved successfully');
      }
    }
    
    // Legacy format support
    else if (photo_id && (landmarks_data || mesh_data || symmetry_score)) {
      console.log('Saving legacy format analysis for photo:', photo_id);
      
      const analysisData: Record<string, unknown> = {
        case_id: case_id,
        photo_id: photo_id,
        status: 'landmarks_ready',
        updated_at: new Date().toISOString(),
      };

      if (landmarks_data?.points) {
        analysisData.points = landmarks_data.points;
      }
      if (landmarks_data?.faceROI) {
        analysisData.face_roi = landmarks_data.faceROI;
      }
      if (landmarks_data?.midlinePoints) {
        analysisData.midline_points = landmarks_data.midlinePoints;
      }
      if (mesh_data?.connections) {
        analysisData.connections = mesh_data.connections;
      }
      if (mesh_data?.customConnections) {
        analysisData.custom_connections = mesh_data.customConnections;
      }
      if (mesh_data?.customPoints) {
        analysisData.custom_points = mesh_data.customPoints;
      }
      if (symmetry_score !== undefined) {
        analysisData.symmetry_score = symmetry_score;
      }
      if (regional_scores) {
        analysisData.regional_scores = regional_scores;
      }

      const { error: analysisError } = await supabase
        .from('facial_analyses')
        .upsert(analysisData, { 
          onConflict: 'photo_id',
          ignoreDuplicates: false 
        });

      if (analysisError) {
        console.error('Error upserting facial_analyses:', analysisError);
      } else {
        console.log('Legacy facial analysis data saved successfully');
      }
    }

    // Log audit event
    try {
      await supabase.rpc('log_audit', {
        _case_id: case_id,
        _action: `n8n_webhook_${normalizedStatus}`,
        _description: normalizedStatus === 'failed' 
          ? `Pipeline n8n falhou: ${error_message || 'Erro desconhecido'}`
          : `Pipeline n8n completou com status: ${normalizedStatus}`,
        _metadata: { 
          job_id, 
          status: normalizedStatus, 
          has_face_mesh: !!face_mesh,
          has_landmarks: !!landmarks_data,
          photo_id 
        }
      });
    } catch (auditError) {
      console.error('Error logging audit:', auditError);
    }

    console.log('=== Webhook processed successfully ===');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Job ${job_id} updated to status: ${normalizedStatus}`,
        face_mesh_saved: !!face_mesh,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Webhook processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
