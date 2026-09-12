// Lê o motivo real de uma falha de `supabase.functions.invoke`.
//
// O `FunctionsHttpError` traz sempre o mesmo texto genérico ("Edge Function returned a
// non-2xx status code") e guarda a resposta em `context`. Sem abrir o `context`, o motivo
// — cota estourada, autenticação ausente, falha do fornecedor — nunca chega à tela, e o
// usuário vê um "erro" sem saber o que fazer a respeito.
//
// `useMeshy3D` tem uma versão própria disto, com a semântica específica do plano da Meshy
// (402 = não adianta repetir). Quando aquela for revisitada, pode passar a se apoiar
// nesta; por ora ela permanece intocada, por estar em uso e funcionando.

export interface InvokeFailure {
  /** Código devolvido pela função, quando ela envia um. Ex.: `quota_exceeded`. */
  code?: string;
  /** Mensagem para mostrar ao usuário. */
  message: string;
  status?: number;
}

export async function describeInvokeFailure(
  error: unknown,
  fallbackMessage: string,
): Promise<InvokeFailure> {
  const context = (error as { context?: unknown })?.context;

  if (context instanceof Response) {
    const status = context.status;
    try {
      // `clone()` porque o corpo pode já ter sido lido por outro consumidor.
      const body = await context.clone().text();
      if (body) {
        try {
          const parsed = JSON.parse(body) as { code?: string; error?: string; message?: string };
          const message = parsed.error || parsed.message;
          if (message) return { code: parsed.code, message, status };
        } catch {
          return { message: body, status };
        }
      }
    } catch {
      // Corpo ilegível: resta o status.
    }
    return { message: `${fallbackMessage} (${status})`, status };
  }

  return { message: error instanceof Error ? error.message : fallbackMessage };
}
