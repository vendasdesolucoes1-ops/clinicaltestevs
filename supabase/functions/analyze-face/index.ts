import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FACIAL_ANALYSIS_PROMPT = `Você é um especialista em anatomia facial. Analise a imagem do rosto e identifique os pontos anatômicos faciais com precisão.

Retorne APENAS um JSON válido com as coordenadas normalizadas (0 a 1) de cada ponto, onde (0,0) é o canto superior esquerdo e (1,1) é o canto inferior direito da imagem.

Os pontos a identificar são:
1. glabella - ponto entre as sobrancelhas
2. nasion - raiz do nariz (entre os olhos)
3. pronasale - ponta do nariz
4. subnasale - base do nariz
5. labiale_superius - centro do lábio superior
6. labiale_inferius - centro do lábio inferior
7. gnathion - ponta do queixo
8. orbitale_left_inner - canto interno do olho esquerdo
9. orbitale_left_outer - canto externo do olho esquerdo
10. orbitale_right_inner - canto interno do olho direito
11. orbitale_right_outer - canto externo do olho direito
12. cheilion_left - comissura labial esquerda
13. cheilion_right - comissura labial direita
14. zygion_left - ponto mais lateral da maçã do rosto esquerda
15. zygion_right - ponto mais lateral da maçã do rosto direita
16. gonion_left - ângulo da mandíbula esquerda
17. gonion_right - ângulo da mandíbula direita
18. temple_left - têmpora esquerda (lateral da testa)
19. temple_right - têmpora direita (lateral da testa)

Responda APENAS com o JSON no formato:
{
  "points": [
    {"id": "glabella", "name": "Glabela", "x": 0.5, "y": 0.15, "category": "forehead"},
    ...
  ]
}

Categorias válidas: forehead, eyes, nose, mouth, chin, contour`;

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

    console.log('Iniciando análise facial com Lovable AI...');

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
      console.error('Erro ao parsear JSON:', parseError, 'Conteúdo:', jsonStr);
      return new Response(
        JSON.stringify({ error: 'Formato de resposta inválido da IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Análise facial concluída com sucesso');
    
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
