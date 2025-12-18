import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MeshRecommendation {
  recommended2D: 'simple' | 'dense';
  recommended3D: 'rapido' | 'balanceado' | 'maximo';
  confidence: number;
  reasoning: string;
  focusAreas: string[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageUrl, caseType, photoAngle, notes } = await req.json();
    
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Prepare the image content
    let imageContent: { type: string; image_url: { url: string } };
    
    if (imageBase64) {
      imageContent = {
        type: "image_url",
        image_url: {
          url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
        }
      };
    } else if (imageUrl) {
      imageContent = {
        type: "image_url",
        image_url: { url: imageUrl }
      };
    } else {
      throw new Error('Either imageBase64 or imageUrl is required');
    }

    const systemPrompt = `Você é um especialista em cirurgia plástica reconstrutiva analisando imagens faciais para planejamento cirúrgico. 

Sua tarefa é recomendar a densidade ideal de mesh facial para análise, baseado na imagem do paciente.

NÍVEIS DE DENSIDADE 2D:
- simple (24 pontos): Casos leves, área pequena, avaliação inicial rápida
- dense (114 pontos): Casos moderados a complexos, planejamento detalhado

NÍVEIS DE DENSIDADE 3D:
- rapido: Visualização rápida, menor precisão
- balanceado: Equilíbrio entre velocidade e precisão (recomendado para maioria)
- maximo (468 pontos): Máxima precisão para casos complexos

CRITÉRIOS DE ANÁLISE:
1. Extensão da área afetada (% do rosto)
2. Proximidade de estruturas críticas (olhos, nariz, boca)
3. Complexidade anatômica
4. Assimetria facial visível
5. Tipo de caso (queimadura vs trauma)

Responda APENAS com um JSON válido no seguinte formato:
{
  "recommended2D": "simple" | "dense",
  "recommended3D": "rapido" | "balanceado" | "maximo",
  "confidence": 0.0-1.0,
  "reasoning": "explicação breve em português",
  "focusAreas": ["area1", "area2"]
}`;

    const userPrompt = `Analise esta imagem facial e recomende a densidade de mesh ideal.

Contexto do caso:
- Tipo: ${caseType || 'Não especificado'}
- Ângulo da foto: ${photoAngle || 'frente'}
- Observações: ${notes || 'Nenhuma'}

Forneça sua recomendação no formato JSON especificado.`;

    console.log('Calling OpenAI GPT-4 Vision for mesh recommendation...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: [
              { type: 'text', text: userPrompt },
              imageContent
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    console.log('OpenAI response:', content);

    // Parse the JSON response
    let recommendation: MeshRecommendation;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      recommendation = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      // Provide fallback recommendation
      recommendation = {
        recommended2D: 'dense',
        recommended3D: 'balanceado',
        confidence: 0.5,
        reasoning: 'Não foi possível analisar completamente a imagem. Usando configuração padrão balanceada.',
        focusAreas: ['face_completa']
      };
    }

    // Validate and normalize the response
    const validRecommendation: MeshRecommendation = {
      recommended2D: ['simple', 'dense'].includes(recommendation.recommended2D) 
        ? recommendation.recommended2D 
        : 'dense',
      recommended3D: ['rapido', 'balanceado', 'maximo'].includes(recommendation.recommended3D)
        ? recommendation.recommended3D
        : 'balanceado',
      confidence: typeof recommendation.confidence === 'number' 
        ? Math.max(0, Math.min(1, recommendation.confidence))
        : 0.7,
      reasoning: recommendation.reasoning || 'Análise automática baseada na imagem.',
      focusAreas: Array.isArray(recommendation.focusAreas) 
        ? recommendation.focusAreas 
        : []
    };

    console.log('Final recommendation:', validRecommendation);

    return new Response(JSON.stringify(validRecommendation), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in recommend-mesh-density:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        // Provide fallback recommendation on error
        fallback: {
          recommended2D: 'dense',
          recommended3D: 'balanceado',
          confidence: 0.5,
          reasoning: 'Erro na análise automática. Usando configuração padrão.',
          focusAreas: []
        }
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
