import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FACIAL_ANALYSIS_PROMPT = `Você é um especialista em anatomia facial para cirurgia reconstrutiva. Analise a imagem do rosto com MÁXIMA PRECISÃO e identifique PELO MENOS 100 pontos anatômicos faciais distribuídos por todas as regiões do rosto.

IMPORTANTE: Os pontos devem estar PERFEITAMENTE enquadrados no rosto real da pessoa na imagem. Analise cuidadosamente os contornos faciais antes de posicionar cada ponto.

Retorne APENAS um JSON válido com as coordenadas normalizadas (0 a 1) de cada ponto, onde (0,0) é o canto superior esquerdo e (1,1) é o canto inferior direito da imagem.

REGIÕES E PONTOS A IDENTIFICAR (mínimo 100 pontos):

## TESTA E SOBRANCELHAS (15 pontos)
- trichion: linha do cabelo centro
- metopion: centro da testa
- glabella: entre as sobrancelhas
- supercilium_left_1 a supercilium_left_5: 5 pontos ao longo da sobrancelha esquerda
- supercilium_right_1 a supercilium_right_5: 5 pontos ao longo da sobrancelha direita
- temple_left: têmpora esquerda
- temple_right: têmpora direita

## OLHOS (20 pontos - 10 por olho)
- orbitale_left_inner: canto interno olho esquerdo
- orbitale_left_outer: canto externo olho esquerdo
- palpebra_sup_left_1 a palpebra_sup_left_3: pálpebra superior esquerda
- palpebra_inf_left_1 a palpebra_inf_left_3: pálpebra inferior esquerda
- pupil_left: centro da pupila esquerda
- orbitale_right_inner: canto interno olho direito
- orbitale_right_outer: canto externo olho direito
- palpebra_sup_right_1 a palpebra_sup_right_3: pálpebra superior direita
- palpebra_inf_right_1 a palpebra_inf_right_3: pálpebra inferior direita
- pupil_right: centro da pupila direita

## NARIZ (15 pontos)
- nasion: raiz do nariz
- rhinion: dorso do nariz (ponto médio)
- pronasale: ponta do nariz
- subnasale: base do nariz
- alar_left_1 a alar_left_3: contorno asa nasal esquerda
- alar_right_1 a alar_right_3: contorno asa nasal direita
- columella_left: base columela esquerda
- columella_right: base columela direita
- dorsum_1 a dorsum_3: pontos ao longo do dorso nasal

## BOCA E LÁBIOS (20 pontos)
- philtrum_left: crista filtral esquerda
- philtrum_right: crista filtral direita
- cupid_bow_left: arco de cupido esquerdo
- cupid_bow_center: centro arco de cupido
- cupid_bow_right: arco de cupido direito
- labiale_superius: centro lábio superior
- vermillion_sup_left_1 a vermillion_sup_left_3: contorno vermelhão superior esquerdo
- vermillion_sup_right_1 a vermillion_sup_right_3: contorno vermelhão superior direito
- cheilion_left: comissura labial esquerda
- cheilion_right: comissura labial direita
- labiale_inferius: centro lábio inferior
- vermillion_inf_left_1 a vermillion_inf_left_2: contorno vermelhão inferior esquerdo
- vermillion_inf_right_1 a vermillion_inf_right_2: contorno vermelhão inferior direito
- stomion: ponto de encontro dos lábios

## QUEIXO E MANDÍBULA (15 pontos)
- labiomental_crease: sulco labiomentoniano
- pogonion: ponto mais anterior do queixo
- gnathion: ponto inferior do queixo
- menton: base do queixo
- mandible_left_1 a mandible_left_5: contorno mandibular esquerdo
- mandible_right_1 a mandible_right_5: contorno mandibular direito
- gonion_left: ângulo mandibular esquerdo
- gonion_right: ângulo mandibular direito

## BOCHECHAS E ZIGOMÁTICO (15 pontos)
- zygion_left: ponto mais lateral zigomático esquerdo
- zygion_right: ponto mais lateral zigomático direito
- cheek_left_1 a cheek_left_5: contorno da bochecha esquerda
- cheek_right_1 a cheek_right_5: contorno da bochecha direita
- malar_left: proeminência malar esquerda
- malar_right: proeminência malar direita

## ORELHAS (opcionais se visíveis - 6 pontos por orelha)
- tragus_left, tragus_right: trago
- antitragus_left, antitragus_right: antitrago
- lobule_left, lobule_right: lóbulo
- helix_left_1 a helix_left_3: contorno helix esquerdo
- helix_right_1 a helix_right_3: contorno helix direito

Responda APENAS com o JSON no formato:
{
  "points": [
    {"id": "trichion", "name": "Trichion", "x": 0.5, "y": 0.05, "category": "forehead"},
    {"id": "glabella", "name": "Glabela", "x": 0.5, "y": 0.25, "category": "forehead"},
    ...continue com TODOS os 100+ pontos...
  ]
}

Categorias válidas: forehead, eyebrows, eyes, nose, mouth, chin, contour, cheeks, ears

CRÍTICO: 
1. Analise CUIDADOSAMENTE a posição real do rosto na imagem
2. Os pontos devem se AJUSTAR PERFEITAMENTE aos contornos faciais reais
3. Gere NO MÍNIMO 100 pontos bem distribuídos
4. Se alguma região não for visível, omita apenas esses pontos específicos`;

serve(async (req) => {
  // Handle CORS preflight
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

    console.log('Iniciando análise facial detalhada com Lovable AI (100+ pontos)...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', // Usando Pro para análise mais precisa
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
    });

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
