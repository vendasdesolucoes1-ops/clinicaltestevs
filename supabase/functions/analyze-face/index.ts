import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FACIAL_ANALYSIS_PROMPT = `You are a facial anatomy expert for reconstructive surgery. Analyze the face in this image and detect anatomical landmarks.

CRITICAL: Return a complete JSON with 60-80+ facial landmark points distributed across all facial regions.

FACE REGION OF INTEREST (ROI):
First, identify the bounding box of the face (excluding hair, neck, shoulders, background).
Return faceROI with normalized coordinates (0-1) relative to the full image.

ANATOMICAL REGIONS (use these exact names):
- midline: Facial midline (vertical symmetry axis)
- forehead: Forehead area
- eyebrow_left, eyebrow_right: Eyebrows
- eye_left, eye_right: Eyes
- nose_upper, nose_lower: Nose
- mouth_upper, mouth_lower, mouth_perioral: Mouth and perioral region
- cheek_left, cheek_right: Cheeks
- zygomatic_left, zygomatic_right: Zygomatic region
- mandible_left, mandible_right: Mandible/jaw
- chin: Chin

REQUIRED POINTS BY REGION (minimum 60-80 total points):

## MIDLINE (10 points) - Symmetry axis
- trichion (hairline center)
- metopion (forehead center) 
- glabella (between eyebrows)
- nasion (bridge of nose)
- rhinion (nasal dorsum)
- pronasale (nasal tip)
- subnasale (base of nose)
- labiale_superius (upper lip)
- stomion (mouth center)
- labiale_inferius (lower lip)
- pogonion (chin projection)
- gnathion (chin point)
- menton (lowest chin point)

## FOREHEAD (4 points)
- temple_left, temple_right
- forehead_left, forehead_right

## EYEBROWS (10 points)
- supercilium_left_1, supercilium_left_2, supercilium_left_3, supercilium_left_4, supercilium_left_5
- supercilium_right_1, supercilium_right_2, supercilium_right_3, supercilium_right_4, supercilium_right_5

## EYES (16 points)
- orbitale_left_inner, orbitale_left_outer, pupil_left
- palpebra_sup_left_1, palpebra_sup_left_2, palpebra_sup_left_3
- palpebra_inf_left_1, palpebra_inf_left_2
- orbitale_right_inner, orbitale_right_outer, pupil_right
- palpebra_sup_right_1, palpebra_sup_right_2, palpebra_sup_right_3
- palpebra_inf_right_1, palpebra_inf_right_2

## NOSE (8 points)
- alar_left_1, alar_left_2
- alar_right_1, alar_right_2
- columella_left, columella_right
- nasal_bridge_1, nasal_bridge_2

## MOUTH (12 points)
- philtrum_left, philtrum_right
- cupid_bow_left, cupid_bow_center, cupid_bow_right
- cheilion_left, cheilion_right (mouth corners)
- vermillion_sup_left, vermillion_sup_right
- vermillion_inf_left, vermillion_inf_right
- labiomental_crease

## CHIN/MANDIBLE (10 points)
- gonion_left, gonion_right (jaw angles)
- mandible_left_1, mandible_left_2, mandible_left_3
- mandible_right_1, mandible_right_2, mandible_right_3
- mental_left, mental_right

## ZYGOMATIC/CHEEKS (8 points)
- zygion_left, zygion_right
- malar_left, malar_right
- cheek_left_1, cheek_left_2
- cheek_right_1, cheek_right_2

RESPONSE FORMAT - Return ONLY valid JSON:
{
  "faceROI": {
    "x": 0.15,
    "y": 0.05,
    "width": 0.7,
    "height": 0.9
  },
  "midlinePoints": ["trichion", "metopion", "glabella", "nasion", "rhinion", "pronasale", "subnasale", "labiale_superius", "stomion", "labiale_inferius", "pogonion", "gnathion", "menton"],
  "points": [
    {"id": "glabella", "name": "Glabela", "x": 0.5, "y": 0.25, "region": "midline", "adjacentRegions": ["forehead", "eyebrow_left", "eyebrow_right"]},
    {"id": "nasion", "name": "Násion", "x": 0.5, "y": 0.32, "region": "nose_upper", "adjacentRegions": ["midline", "eye_left", "eye_right"]},
    {"id": "pupil_left", "name": "Pupila Esquerda", "x": 0.38, "y": 0.35, "region": "eye_left", "adjacentRegions": ["eyebrow_left", "nose_upper", "cheek_left"]},
    {"id": "pupil_right", "name": "Pupila Direita", "x": 0.62, "y": 0.35, "region": "eye_right", "adjacentRegions": ["eyebrow_right", "nose_upper", "cheek_right"]}
  ]
}

CRITICAL RULES:
1. x,y coordinates are normalized (0-1) relative to the FULL IMAGE
2. Each point MUST have "region" indicating its anatomical region
3. Each point MUST have "adjacentRegions" listing valid neighboring regions
4. DO NOT include points outside the face (hair, neck, shoulders)
5. Midline points should have x ≈ 0.5 (center)
6. Left points (patient's left) should have x < 0.5
7. Right points should have x > 0.5
8. Include ALL points listed above - at least 60-80 points total
9. Be precise with coordinates based on actual facial features in the image

Generate the complete JSON with ALL the landmark points now.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY não configurada');
      return new Response(
        JSON.stringify({ error: 'Configuração de API incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Iniciando análise facial anatômica com OpenAI GPT-4 Vision...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

    // Preparar a URL da imagem
    const imageUrl = imageBase64.startsWith('data:') 
      ? imageBase64 
      : `data:image/jpeg;base64,${imageBase64}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a precise facial anatomy expert. You must return COMPLETE JSON responses with ALL requested facial landmark points. Never abbreviate or truncate the response. Always include 60-80+ landmark points.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: FACIAL_ANALYSIS_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 8192, // Increased for complete response
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro da API OpenAI:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Chave de API inválida ou expirada.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 400) {
        console.error('Erro 400 - Bad Request:', errorText);
        return new Response(
          JSON.stringify({ error: 'Imagem inválida ou formato não suportado.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Erro ao processar análise facial' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('Resposta vazia da IA');
      return new Response(
        JSON.stringify({ error: 'Resposta inválida da IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Resposta da OpenAI recebida, tamanho:', content.length, 'caracteres');
    console.log('Preview da resposta:', content.substring(0, 500));

    // Extrair JSON da resposta (pode vir com markdown)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    // Tentar parsear o JSON
    let parsedData;
    try {
      parsedData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Erro ao parsear JSON:', parseError);
      console.error('Conteúdo recebido:', jsonStr.substring(0, 1000));
      return new Response(
        JSON.stringify({ error: 'Formato de resposta inválido da IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validar e filtrar pontos dentro da ROI
    const faceROI = parsedData.faceROI || { x: 0, y: 0, width: 1, height: 1 };
    const midlinePoints = parsedData.midlinePoints || [];
    
    console.log('Pontos recebidos da IA:', parsedData.points?.length || 0);
    console.log('ROI facial:', JSON.stringify(faceROI));
    
    // Filtrar pontos que estão fora da ROI facial
    const validatedPoints = (parsedData.points || []).filter((point: any) => {
      if (!point.x || !point.y || !point.id) {
        console.log('Ponto inválido ignorado:', JSON.stringify(point));
        return false;
      }
      
      const inROI = point.x >= faceROI.x && 
                   point.x <= faceROI.x + faceROI.width &&
                   point.y >= faceROI.y && 
                   point.y <= faceROI.y + faceROI.height;
      
      if (!inROI) {
        console.log(`Ponto ${point.id} fora da ROI (x=${point.x}, y=${point.y}), removido`);
      }
      return inROI;
    });

    const pointCount = validatedPoints.length;
    console.log(`Análise facial concluída: ${pointCount} pontos válidos dentro da ROI`);
    
    if (pointCount < 10) {
      console.warn('AVISO: Poucos pontos detectados! A IA pode não ter retornado todos os landmarks.');
    }
    
    return new Response(
      JSON.stringify({
        faceROI,
        midlinePoints,
        points: validatedPoints,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Erro na função analyze-face:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return new Response(
        JSON.stringify({ error: 'Timeout na análise. A imagem pode ser muito complexa.' }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
