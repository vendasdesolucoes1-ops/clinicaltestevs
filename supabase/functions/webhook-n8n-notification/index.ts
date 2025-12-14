import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  job_id: string;
  case_id: string;
  status: 'pronto' | 'falhou' | 'processando';
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
  error_message?: string;
  photo_id?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Webhook n8n notification received');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: WebhookPayload = await req.json();
    console.log('Payload received:', JSON.stringify(payload, null, 2));

    const { 
      job_id, 
      case_id, 
      status, 
      landmarks_data, 
      mesh_data, 
      symmetry_score,
      regional_scores,
      error_message,
      photo_id
    } = payload;

    // Validate required fields
    if (!job_id || !case_id || !status) {
      console.error('Missing required fields: job_id, case_id, or status');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: job_id, case_id, status' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update simulation_jobs table with status
    const jobUpdateData: Record<string, unknown> = {
      status: status,
      progress: status === 'pronto' ? 100 : status === 'falhou' ? 0 : 50,
    };

    if (status === 'pronto' || status === 'falhou') {
      jobUpdateData.completed_at = new Date().toISOString();
    }

    if (error_message) {
      jobUpdateData.parameters = { error_message };
    }

    console.log('Updating simulation_jobs:', job_id, jobUpdateData);
    
    const { error: jobError } = await supabase
      .from('simulation_jobs')
      .update(jobUpdateData)
      .eq('id', job_id);

    if (jobError) {
      console.error('Error updating simulation_jobs:', jobError);
      return new Response(
        JSON.stringify({ error: 'Failed to update job status', details: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If we have facial analysis data and a photo_id, insert/update facial_analyses
    if (photo_id && (landmarks_data || mesh_data || symmetry_score)) {
      console.log('Inserting/updating facial_analyses for photo:', photo_id);
      
      const analysisData: Record<string, unknown> = {
        case_id: case_id,
        photo_id: photo_id,
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

      // Upsert - insert or update if exists
      const { error: analysisError } = await supabase
        .from('facial_analyses')
        .upsert(analysisData, { 
          onConflict: 'photo_id',
          ignoreDuplicates: false 
        });

      if (analysisError) {
        console.error('Error upserting facial_analyses:', analysisError);
        // Don't fail the whole request, just log the error
      } else {
        console.log('Facial analysis data saved successfully');
      }
    }

    // Log audit event
    try {
      await supabase.rpc('log_audit', {
        _case_id: case_id,
        _action: `n8n_webhook_${status}`,
        _description: status === 'falhou' 
          ? `Pipeline n8n falhou: ${error_message || 'Erro desconhecido'}`
          : `Pipeline n8n completou com status: ${status}`,
        _metadata: { job_id, status, has_landmarks: !!landmarks_data }
      });
    } catch (auditError) {
      console.error('Error logging audit:', auditError);
    }

    console.log('Webhook processed successfully');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Job ${job_id} updated to status: ${status}` 
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
