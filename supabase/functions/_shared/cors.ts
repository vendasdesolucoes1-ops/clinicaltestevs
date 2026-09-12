// S-3: origem permitida, em vez de `*`.
//
// As três funções respondiam `Access-Control-Allow-Origin: *`, o que permite que
// qualquer página na web as chame usando a chave anônima — que está no bundle do
// frontend, como é o padrão do Supabase, e é um JWT válido.
//
// LIMITE DESTA PROTEÇÃO: CORS é regra de navegador. Um `curl` ignora por completo.
// Quem de fato impede abuso é a cota em `quota.ts`; isto aqui é camada adicional,
// contra abuso originado de outra página.
//
// COMPORTAMENTO SEM CONFIGURAÇÃO: se `ALLOWED_ORIGINS` não estiver definida, a função
// mantém o comportamento antigo e registra aviso. É deliberado — falhar fechado aqui
// derrubaria a aplicação inteira no primeiro deploy em que a variável faltasse, e a
// proteção que importa contra custo não depende desta.

const BASE_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

function allowList(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

/** Cabeçalhos de CORS para esta requisição. */
export function corsHeaders(req: Request): Record<string, string> {
  const allowed = allowList();
  const origin = req.headers.get('Origin');

  if (allowed.length === 0) {
    console.warn(
      'ALLOWED_ORIGINS não configurada: respondendo com Access-Control-Allow-Origin: *. ' +
        'Defina a variável com os domínios da aplicação para restringir.',
    );
    return { ...BASE_HEADERS, 'Access-Control-Allow-Origin': '*' };
  }

  // Sem Origin (chamada servidor a servidor) não há o que autorizar no navegador.
  if (!origin) return { ...BASE_HEADERS };

  return allowed.includes(origin)
    ? { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin }
    : { ...BASE_HEADERS };
}

/** Resposta ao preflight. */
export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** Resposta JSON já com os cabeçalhos de CORS desta requisição. */
export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...extraHeaders },
  });
}
