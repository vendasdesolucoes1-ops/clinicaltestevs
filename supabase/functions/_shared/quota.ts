// S-2: teto de uso das funções de IA.
//
// `analyze-face` chama um modelo de visão com uma imagem por requisição, e
// `recommend-mesh-density` faz o mesmo. Nenhuma das duas contabilizava nada. A chave
// anônima está no bundle do frontend — como é o padrão — e é um JWT válido, então
// qualquer visitante podia disparar chamadas pagas em laço. A própria função já tratava
// o 402 de "créditos insuficientes", o que confirma que o cenário era esperado.
//
// DUAS PROTEÇÕES, NESTA ORDEM:
//   1. exigir usuário autenticado (ver `resolveCaller`), o que já tira o anônimo;
//   2. teto por usuário, por hora e por dia.
//
// O REGISTRO É FEITO ANTES DA CHAMADA AO MODELO, de propósito. Registrar depois faria
// com que falhas do fornecedor não contassem, e quem estivesse martelando a função com
// retry nunca atingiria o teto — justamente o caso que o teto existe para conter.

import type { Caller } from './auth.ts';

/** Chamadas por usuário em cada janela. Ponto de partida, ajustável por uso real. */
export const HOURLY_LIMIT = 20;
export const DAILY_LIMIT = 100;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface QuotaDenial {
  /** Segundos até a próxima chamada ser permitida. */
  retryAfterSeconds: number;
  message: string;
}

/**
 * Consome uma unidade de cota, ou explica por que não pode.
 *
 * Devolve `null` quando a chamada está liberada. A leitura e a escrita passam pelo RLS
 * com o token do chamador: cada um só enxerga e grava o próprio consumo, e não existe
 * policy de DELETE, então ninguém zera o próprio contador.
 */
export async function consumeQuota(
  caller: Caller,
  functionName: string,
): Promise<QuotaDenial | null> {
  const since = new Date(Date.now() - DAY_MS).toISOString();

  // Uma consulta só: o dia inteiro vem e as duas janelas são contadas em memória. Com o
  // teto diário na casa da centena, isso é mais barato que dois COUNT no banco.
  const { data, error } = await caller.client
    .from('ai_usage')
    .select('created_at')
    .eq('function_name', functionName)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) {
    // Falha ao ler o consumo não pode virar porta aberta: sem saber o gasto, recusa.
    console.error('Falha ao ler ai_usage:', error.message);
    return {
      retryAfterSeconds: 60,
      message: 'Não foi possível verificar o limite de uso. Tente novamente em instantes.',
    };
  }

  const now = Date.now();
  const timestamps = (data ?? []).map(row => new Date(row.created_at as string).getTime());
  const lastHour = timestamps.filter(time => now - time < HOUR_MS);

  if (lastHour.length >= HOURLY_LIMIT) {
    const oldest = Math.min(...lastHour);
    return {
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + HOUR_MS - now) / 1000)),
      message: `Limite de ${HOURLY_LIMIT} análises por hora atingido.`,
    };
  }

  if (timestamps.length >= DAILY_LIMIT) {
    const oldest = Math.min(...timestamps);
    return {
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + DAY_MS - now) / 1000)),
      message: `Limite de ${DAILY_LIMIT} análises por dia atingido.`,
    };
  }

  const { error: insertError } = await caller.client
    .from('ai_usage')
    .insert({ user_id: caller.userId, function_name: functionName });

  if (insertError) {
    console.error('Falha ao registrar ai_usage:', insertError.message);
    return {
      retryAfterSeconds: 60,
      message: 'Não foi possível registrar o uso. Tente novamente em instantes.',
    };
  }

  return null;
}
