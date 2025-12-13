import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FACIAL_ANALYSIS_PROMPT = `Você é um especialista em anatomia facial para cirurgia reconstrutiva. Analise a imagem e identifique pontos anatômicos faciais.

Retorne APENAS um JSON válido com coordenadas normalizadas (0 a 1), onde (0,0) é o canto superior esquerdo.

Identifique EXATAMENTE estes pontos (mínimo 60-80 pontos):

## TESTA (5 pontos)
trichion, metopion, glabella, temple_left, temple_right

## SOBRANCELHAS (10 pontos)
supercilium_left_1 a supercilium_left_5, supercilium_right_1 a supercilium_right_5

## OLHOS (16 pontos)
orbitale_left_inner, orbitale_left_outer, pupil_left
palpebra_sup_left_1, palpebra_sup_left_2, palpebra_sup_left_3
palpebra_inf_left_1, palpebra_inf_left_2, palpebra_inf_left_3
orbitale_right_inner, orbitale_right_outer, pupil_right
palpebra_sup_right_1, palpebra_sup_right_2, palpebra_sup_right_3
palpebra_inf_right_1, palpebra_inf_right_2, palpebra_inf_right_3

## NARIZ (10 pontos)
nasion, rhinion, pronasale, subnasale
alar_left_1, alar_left_2, alar_right_1, alar_right_2
columella_left, columella_right

## BOCA (14 pontos)
philtrum_left, philtrum_right
cupid_bow_left, cupid_bow_center, cupid_bow_right
labiale_superius, stomion, labiale_inferius
cheilion_left, cheilion_right
vermillion_sup_left_1, vermillion_sup_right_1
vermillion_inf_left_1, vermillion_inf_right_1

## QUEIXO/MANDÍBULA (15 pontos)
labiomental_crease, pogonion, gnathion, menton
gonion_left, gonion_right
mandible_left_1, mandible_left_2, mandible_left_3
mandible_right_1, mandible_right_2, mandible_right_3
zygion_left, zygion_right
malar_left, malar_right

## BOCHECHAS (6 pontos)
cheek_left_1, cheek_left_2, cheek_left_3
cheek_right_1, cheek_right_2, cheek_right_3

Responda APENAS com JSON:
{"points": [{"id": "glabella", "name": "Glabela", "x": 0.5, "y": 0.25, "category": "forehead"}, ...]}

Categorias: forehead, eyebrows, eyes, nose, mouth, chin, contour, cheeks

CRÍTICO: Posicione os pontos PRECISAMENTE nos contornos faciais reais da pessoa na foto.`;

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

    console.log('Iniciando análise facial com Lovable AI...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash', // Flash é mais rápido
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

    const pointCount = parsedData.points?.length || 0;
    console.log(`Análise facial concluída com sucesso: ${pointCount} pontos detectados`);
    
    return new Response(
      JSON.stringify(parsedData),
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
