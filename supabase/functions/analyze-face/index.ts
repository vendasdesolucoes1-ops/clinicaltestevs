import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Regiões anatômicas válidas
const ANATOMICAL_REGIONS = [
  'midline',
  'forehead',
  'eyebrow_left', 'eyebrow_right',
  'eye_left', 'eye_right',
  'nose_upper', 'nose_lower',
  'mouth_upper', 'mouth_lower', 'mouth_perioral',
  'cheek_left', 'cheek_right',
  'zygomatic_left', 'zygomatic_right',
  'mandible_left', 'mandible_right',
  'chin'
] as const;

const FACIAL_ANALYSIS_PROMPT = `Você é um especialista em anatomia facial para cirurgia reconstrutiva. Analise APENAS a região do ROSTO na imagem.

CRÍTICO - PRIMEIRA ETAPA: DETECÇÃO DA REGIÃO FACIAL (ROI)
1. Identifique o bounding box do rosto (excluindo cabelo, pescoço, ombros e fundo)
2. Retorne faceROI com coordenadas normalizadas (0-1) da área do rosto
3. TODOS os pontos devem estar DENTRO desta ROI facial

REGIÕES ANATÔMICAS (use exatamente estes nomes):
- midline: Linha média facial (eixo de simetria vertical)
- forehead: Testa
- eyebrow_left, eyebrow_right: Sobrancelhas
- eye_left, eye_right: Olhos
- nose_upper, nose_lower: Nariz
- mouth_upper, mouth_lower, mouth_perioral: Boca e região perioral
- cheek_left, cheek_right: Bochechas
- zygomatic_left, zygomatic_right: Região zigomática
- mandible_left, mandible_right: Mandíbula
- chin: Queixo

PONTOS OBRIGATÓRIOS POR REGIÃO (mínimo 50-70 pontos):

## LINHA MÉDIA (8 pontos) - Eixo de simetria
trichion, metopion, glabella, nasion, pronasale, subnasale, labiale_superius, stomion, labiale_inferius, pogonion, gnathion, menton

## TESTA (3 pontos)
temple_left, temple_right, metopion

## SOBRANCELHAS (10 pontos)
supercilium_left_1, supercilium_left_2, supercilium_left_3, supercilium_left_4, supercilium_left_5
supercilium_right_1, supercilium_right_2, supercilium_right_3, supercilium_right_4, supercilium_right_5

## OLHOS (16 pontos)
orbitale_left_inner, orbitale_left_outer, pupil_left
palpebra_sup_left_1, palpebra_sup_left_2, palpebra_sup_left_3
palpebra_inf_left_1, palpebra_inf_left_2, palpebra_inf_left_3
orbitale_right_inner, orbitale_right_outer, pupil_right
palpebra_sup_right_1, palpebra_sup_right_2, palpebra_sup_right_3
palpebra_inf_right_1, palpebra_inf_right_2, palpebra_inf_right_3

## NARIZ (8 pontos)
nasion, rhinion, pronasale, subnasale
alar_left_1, alar_left_2, alar_right_1, alar_right_2

## BOCA (12 pontos)
philtrum_left, philtrum_right
cupid_bow_left, cupid_bow_center, cupid_bow_right
labiale_superius, stomion, labiale_inferius
cheilion_left, cheilion_right
vermillion_sup_left_1, vermillion_sup_right_1

## QUEIXO/MANDÍBULA (10 pontos)
labiomental_crease, pogonion, gnathion, menton
gonion_left, gonion_right
mandible_left_1, mandible_left_2, mandible_right_1, mandible_right_2

## ZIGOMÁTICO/BOCHECHAS (6 pontos)
zygion_left, zygion_right
malar_left, malar_right
cheek_left_1, cheek_right_1

Responda APENAS com JSON válido:
{
  "faceROI": {
    "x": 0.15,
    "y": 0.05,
    "width": 0.7,
    "height": 0.9
  },
  "midlinePoints": ["trichion", "glabella", "nasion", "pronasale", "subnasale", "labiale_superius", "labiale_inferius", "gnathion", "menton"],
  "points": [
    {
      "id": "glabella",
      "name": "Glabela",
      "x": 0.5,
      "y": 0.25,
      "region": "midline",
      "adjacentRegions": ["forehead", "eyebrow_left", "eyebrow_right"]
    }
  ]
}

REGRAS CRÍTICAS:
1. Coordenadas x,y são normalizadas (0-1) relativas à IMAGEM COMPLETA
2. Cada ponto DEVE ter "region" indicando sua região anatômica
3. Cada ponto DEVE ter "adjacentRegions" listando regiões vizinhas válidas
4. NÃO inclua pontos fora do rosto (cabelo, pescoço, ombros)
5. Pontos da linha média devem ter x ≈ 0.5 (centro)
6. Pontos esquerdos (esquerda do paciente) devem ter x < 0.5
7. Pontos direitos devem ter x > 0.5`;

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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY não configurada');
      return new Response(
        JSON.stringify({ error: 'Configuração de API incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Iniciando análise facial anatômica com Lovable AI...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: FACIAL_ANALYSIS_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro da API Lovable:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos ao workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    console.log('Resposta da IA recebida, processando...');

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
      console.error('Erro ao parsear JSON:', parseError, 'Conteúdo:', jsonStr.substring(0, 500));
      return new Response(
        JSON.stringify({ error: 'Formato de resposta inválido da IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validar e filtrar pontos dentro da ROI
    const faceROI = parsedData.faceROI || { x: 0, y: 0, width: 1, height: 1 };
    const midlinePoints = parsedData.midlinePoints || [];
    
    // Filtrar pontos que estão fora da ROI facial
    const validatedPoints = (parsedData.points || []).filter((point: any) => {
      const inROI = point.x >= faceROI.x && 
                   point.x <= faceROI.x + faceROI.width &&
                   point.y >= faceROI.y && 
                   point.y <= faceROI.y + faceROI.height;
      
      if (!inROI) {
        console.log(`Ponto ${point.id} fora da ROI, removido`);
      }
      return inROI;
    });

    const pointCount = validatedPoints.length;
    console.log(`Análise facial concluída: ${pointCount} pontos válidos dentro da ROI`);
    console.log(`ROI facial: x=${faceROI.x}, y=${faceROI.y}, w=${faceROI.width}, h=${faceROI.height}`);
    
    return new Response(
      JSON.stringify({
        faceROI,
        midlinePoints,
        points: validatedPoints,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na função analyze-face:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
