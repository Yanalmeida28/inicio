import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Configure ${name} no Supabase antes de ativar as cobranças.`);
  return value;
}
export function adminClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}
export function userClient(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('Sessão obrigatória.');
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
}
export class MpError extends Error {
  constructor(public status: number) { super(`Mercado Pago respondeu com HTTP ${status}.`); }
}
export async function mp<T>(path: string, method = 'GET', body?: unknown, idempotencyKey?: string): Promise<T> {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method, headers: { Authorization: `Bearer ${env('MERCADO_PAGO_ACCESS_TOKEN')}`, 'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new MpError(response.status);
  return await response.json() as T;
}
