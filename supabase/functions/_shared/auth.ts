// S-1 e S-2: quem está chamando, e ele pode fazer isto?
//
// As três funções aceitavam qualquer requisição. A `generate-3d-model` ia além: criava o
// cliente com `SUPABASE_SERVICE_ROLE_KEY` — que ignora RLS por definição — e usava o
// `case_id` vindo do corpo sem verificar nada. Todo o RLS construído no banco era
// contornado por essa rota.
//
// O PRINCÍPIO AQUI: a autorização volta para o banco. Em vez de reimplementar a regra de
// acesso em TypeScript, a função consulta o caso COM O TOKEN DO CHAMADOR e deixa o RLS
// decidir. `has_case_access` continua sendo a fonte única. A chave de serviço só entra
// depois, e só para o que precisa dela.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface Caller {
  userId: string;
  /** Cliente com o token do chamador: toda consulta passa pelo RLS. */
  client: SupabaseClient;
}

/**
 * Identifica o chamador a partir do header `Authorization`.
 *
 * Devolve `null` quando não há token válido — inclusive quando o token é apenas a chave
 * anônima sem sessão de usuário, que é o caso que deixava as funções de IA abertas a
 * qualquer visitante.
 */
export async function resolveCaller(req: Request): Promise<Caller | null> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return null;

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    console.error('SUPABASE_URL ou SUPABASE_ANON_KEY ausente no ambiente da função');
    return null;
  }

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;

  return { userId: data.user.id, client };
}

/**
 * O chamador tem acesso a este caso?
 *
 * A pergunta é feita ao banco com o token dele: se o RLS não deixa ler a linha, ele não
 * tem acesso. Não há regra de autorização duplicada aqui.
 */
export async function canAccessCase(caller: Caller, caseId: string): Promise<boolean> {
  const { data, error } = await caller.client
    .from('clinical_cases')
    .select('id')
    .eq('id', caseId)
    .maybeSingle();

  if (error) {
    console.error('Falha ao verificar acesso ao caso:', error.message);
    return false;
  }
  return data !== null;
}
