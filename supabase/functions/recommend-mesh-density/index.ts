import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { consumeQuota } from "../_shared/quota.ts";

interface MeshRecommendation {
  recommended: 'simetria' | 'clinico' | 'avancado' | 'completo';
  recommendedPoints: number;
  confidence: number;
  reasoning: string;
  focusAreas: string[];
}

const PRESET_POINTS = {
  simetria: 30,
  clinico: 120,
  avancado: 200,
  completo: 468,
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return preflight(req);
  }

  try {
    // S-2: chamada paga por imagem. Mesma proteção da analyze-face.
    const caller = await resolveCaller(req);
    if (!caller) {
      return jsonResponse(req, { error: 'Autenticação obrigatória' }, 401);
    }

    const { imageBase64, imageUrl, caseType, photoAngle, notes } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return jsonResponse(req, { error: 'Either imageBase64 or imageUrl is required' }, 400);
    }

    // Mesma ordem da analyze-face: validar o pedido, depois consumir a cota, depois
    // acionar o modelo.
    const denial = await consumeQuota(caller, 'recommend-mesh-density');
    if (denial) {
      return jsonResponse(
        req,
        { code: 'quota_exceeded', error: denial.message },
        429,
        { 'Retry-After': String(denial.retryAfterSeconds) },
      );
    }
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
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
      // Fetch the image ourselves: the AI gateway cannot always reach remote URLs
      // (signed storage links, hotlink-protected hosts), which returns a 400.
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        throw new Error(`Não foi possível baixar a imagem (${imgRes.status})`);
      }
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      const mime = imgRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
      imageContent = {
        type: "image_url",
        image_url: { url: `data:${mime};base64,${btoa(binary)}` }
      };
    } else {
      throw new Error('Either imageBase64 or imageUrl is required');
    }

    const systemPrompt = `Você é um especialista em cirurgia plástica reconstrutiva analisando imagens faciais para planejamento cirúrgico. 

Sua tarefa é recomendar a densidade ideal de mesh facial para análise, baseado na imagem do paciente.

NÍVEIS DE DENSIDADE DISPONÍVEIS:

1. SIMETRIA (30 pontos):
   - Análise básica de simetria facial
   - Ideal para: Triagem inicial, avaliação rápida
   - Quando usar: Casos simples, pequenas áreas, avaliação preliminar

2. CLÍNICO (120 pontos):
   - Padrão para planejamento cirúrgico
   - Ideal para: Queimaduras moderadas, trauma localizado, reconstrução padrão
   - Quando usar: Maioria dos casos clínicos, bom equilíbrio entre detalhe e velocidade

3. AVANÇADO (200 pontos):
   - Análise detalhada por região anatômica
   - Ideal para: Região periorbital, perioral, casos complexos
   - Quando usar: Áreas sensíveis, múltiplas regiões afetadas, planejamento detalhado

4. COMPLETO (468 pontos):
   - Máxima precisão com todos os pontos MediaPipe
   - Ideal para: Pesquisa, casos muito complexos, reconstrução total
   - Quando usar: Casos extensos, assimetria severa, planejamento de múltiplos procedimentos

CRITÉRIOS DE ANÁLISE:
1. Extensão da área afetada (% do rosto)
2. Proximidade de estruturas críticas (olhos, nariz, boca)
3. Complexidade anatômica
4. Assimetria facial visível
5. Tipo de caso (queimadura vs trauma)

Responda APENAS com um JSON válido no seguinte formato:
{
  "recommended": "simetria" | "clinico" | "avancado" | "completo",
  "recommendedPoints": <número de pontos>,
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

    console.log('Calling Lovable AI Gateway for mesh recommendation...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.7-flash',
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI Gateway');
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
        recommended: 'clinico',
        recommendedPoints: 120,
        confidence: 0.5,
        reasoning: 'Não foi possível analisar completamente a imagem. Usando configuração padrão clínica.',
        focusAreas: ['face_completa']
      };
    }

    // Validate and normalize the response
    const validPresets = ['simetria', 'clinico', 'avancado', 'completo'] as const;
    const validRecommendation: MeshRecommendation = {
      recommended: validPresets.includes(recommendation.recommended as any) 
        ? recommendation.recommended 
        : 'clinico',
      recommendedPoints: PRESET_POINTS[recommendation.recommended] || 120,
      confidence: typeof recommendation.confidence === 'number' 
        ? Math.max(0, Math.min(1, recommendation.confidence))
        : 0.7,
      reasoning: recommendation.reasoning || 'Análise automática baseada na imagem.',
      focusAreas: Array.isArray(recommendation.focusAreas) 
        ? recommendation.focusAreas 
        : []
    };

    console.log('Final recommendation:', validRecommendation);

    return jsonResponse(req, validRecommendation);

  } catch (error) {
    console.error('Error in recommend-mesh-density:', error);
    return jsonResponse(req, {
      error: error instanceof Error ? error.message : 'Unknown error',
      // Provide fallback recommendation on error
      fallback: {
        recommended: 'clinico',
        recommendedPoints: 120,
        confidence: 0.5,
        reasoning: 'Erro na análise automática. Usando configuração padrão clínica.',
        focusAreas: []
      }
    });
  }
});
