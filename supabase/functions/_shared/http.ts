// C-4: toda chamada a fornecedor externo com prazo.
//
// As chamadas à Meshy usavam `fetch` sem `AbortController`, enquanto a `analyze-face`
// já tinha 120s — a diferença entre as duas funções mostra que era omissão, não escolha.
// Uma requisição pendurada consome a invocação até o teto da plataforma.
//
// O download do modelo é o pior caso: arquivo grande, vindo de fora, sem prazo nem
// limite de tamanho. Um GLB inesperadamente enorme estouraria a memória da função.

export class TimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Tempo esgotado após ${ms}ms em ${new URL(url).host}`);
    this.name = 'TimeoutError';
  }
}

export class TooLargeError extends Error {
  constructor(bytes: number, limit: number) {
    super(`Arquivo de ${bytes} bytes excede o limite de ${limit}`);
    this.name = 'TooLargeError';
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (thrown) {
    // `AbortError` sem contexto não diz qual chamada expirou nem por quanto tempo.
    if (thrown instanceof Error && thrown.name === 'AbortError') {
      throw new TimeoutError(url, timeoutMs);
    }
    throw thrown;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Baixa um corpo binário com prazo e teto de tamanho.
 *
 * O `Content-Length` é checado antes de ler, o que recusa cedo o caso honesto. Mas ele é
 * opcional e pode mentir, então o tamanho real é conferido de novo depois da leitura.
 */
export async function downloadWithLimit(
  url: string,
  maxBytes: number,
  timeoutMs = 120_000,
): Promise<Uint8Array> {
  const response = await fetchWithTimeout(url, {}, timeoutMs);
  if (!response.ok) {
    throw new Error(`Falha ao baixar (${response.status})`);
  }

  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new TooLargeError(declared, maxBytes);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new TooLargeError(bytes.byteLength, maxBytes);
  }
  return bytes;
}
