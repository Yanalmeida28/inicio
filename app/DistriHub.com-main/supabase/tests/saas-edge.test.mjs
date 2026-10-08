import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const pure = {};
vm.runInNewContext(compile(await read('../functions/_shared/mercadoPago.ts')), { exports: pure, URL });
const sources = Object.fromEntries(await Promise.all(['saas-checkout', 'saas-webhook', 'saas-provider-jobs'].map(async name =>
  [name, compile(await read(`../functions/${name}/index.ts`))])));
const uuid = '00000000-0000-0000-0000-000000000007';
const request = (body = {}, headers = {}) => new Request('https://example.com/function?data.id=7', {
  method: 'POST', headers: { authorization: 'Bearer jwt', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
function handler(name, overrides = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: uuid, email: 'owner@example.com' } }, error: null }) },
    rpc: async (method, args) => {
      calls.push({ method, args });
      if (method === 'begin_saas_checkout') return { data: { id: uuid, plan_id: 'basico', amount: 49.90, trial_ends_at: '2030-01-01', should_create: true }, error: null };
      if (method === 'finish_saas_checkout') return { data: { accepted: true }, error: null };
      return { data: true, error: null };
    },
  };
  const runtime = {
    corsHeaders: {},
    json: (value, status = 200) => new Response(JSON.stringify(value), { status }),
    userClient: () => client, adminClient: () => client,
    env: name => name === 'SAAS_RETURN_URL' ? 'https://distrihub.example.com' : 'secret',
    MpError: class extends Error { constructor(status) { super('Provider error'); this.status = status; } },
    mp: async (path, method, body) => {
      calls.push({ path, method, body });
      return { id: 'mp-sub', external_reference: uuid, init_point: 'https://www.mercadopago.com.br/checkout', status: 'pending' };
    },
    ...overrides,
  };
  let serve;
  vm.runInNewContext(sources[name], {
    exports: {}, URL, Response, Request, Date,
    Deno: { serve: callback => { serve = callback; } },
    require: path => path.endsWith('saasRuntime.ts') ? runtime : { ...pure, verifyMpSignature: async () => true, ...(overrides.pure ?? {}) },
  });
  return { serve, calls, client, runtime };
}

test('checkout autentica titular e usa preço e empresa do banco, ignorando o corpo enviado', async () => {
  const { serve, calls } = handler('saas-checkout');
  const response = await serve(request({ company_id: 'foreign', amount: 0.01, plan_id: 'enterprise' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).checkoutUrl, 'https://www.mercadopago.com.br/checkout');
  const begin = calls.find(c => c.method === 'begin_saas_checkout'); assert.equal(begin.args.p_company_id, uuid);
  const creation = calls.find(c => c.path === '/preapproval');
  assert.equal(creation.body.auto_recurring.transaction_amount, 49.90);
  assert.equal(creation.body.external_reference, uuid);
  assert.equal(creation.body.payer_email, 'owner@example.com');
});
test('checkout sem sessão, configuração ou tentativa concluída não cria assinatura duplicada', async () => {
  const unauth = handler('saas-checkout');
  unauth.client.auth.getUser = async () => ({ data: { user: null }, error: new Error('Invalid') });
  assert.equal((await unauth.serve(request())).status, 401);
  assert.equal(unauth.calls.length, 0);
  const notConfigured = handler('saas-checkout', { env: () => { throw new Error('Configure o gateway'); } });
  assert.equal((await notConfigured.serve(request())).status, 400);
  assert.equal(notConfigured.calls.length, 0);
  const reserved = handler('saas-checkout');
  reserved.client.rpc = async () => ({ data: { id: uuid, should_create: false, checkout_url: null }, error: null });
  assert.equal((await reserved.serve(request())).status, 409);
  assert.equal(reserved.calls.filter(c => c.path).length, 0);
});
test('timeout do gateway preserva reserva incerta; resposta de criação atrasada não abre checkout invalidado', async () => {
  const uncertain = handler('saas-checkout', { mp: async () => { throw new Error('timeout'); } });
  assert.equal((await uncertain.serve(request())).status, 400);
  assert.equal(uncertain.calls.find(c => c.method === 'mark_saas_checkout_uncertain').args.p_definitive_failure, false);
  const invalidated = handler('saas-checkout');
  const original = invalidated.client.rpc;
  invalidated.client.rpc = async (name, args) => name === 'finish_saas_checkout' ? { data: { accepted: false } } : original(name, args);
  assert.equal((await invalidated.serve(request())).status, 409);
});
test('webhook rejeita assinatura inválida ou ID adulterado antes de consultar o gateway', async () => {
  const invalid = handler('saas-webhook', { pure: { verifyMpSignature: async () => false } });
  assert.equal((await invalid.serve(request({ data: { id: 7 }, type: 'payment' }))).status, 401);
  assert.equal(invalid.calls.length, 0);
  const mismatch = handler('saas-webhook');
  assert.equal((await mismatch.serve(request({ data: { id: 8 }, type: 'payment' }))).status, 400);
  assert.equal(mismatch.calls.length, 0);
});
test('webhook consulta fatura e pagamento no Mercado Pago; body approved não substitui status real', async () => {
  const h = handler('saas-webhook', {
    mp: async path => {
      if (path.startsWith('/authorized_payments/')) return { id: 7, preapproval_id: 'mp-sub', transaction_amount: 49.90, currency_id: 'BRL', debit_date: '2030-01-01T00:00:00Z', payment: { id: 77 } };
      if (path.startsWith('/v1/payments/')) return { id: 77, status: 'pending', transaction_amount: 49.90, currency_id: 'BRL', date_approved: null };
      return { id: 'mp-sub', external_reference: uuid, status: 'authorized', auto_recurring: { transaction_amount: 49.90, currency_id: 'BRL' } };
    },
  });
  h.client.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: uuid, amount: 49.90, provider_subscription_id: 'mp-sub' } }) }) }) });
  const response = await h.serve(request({ type: 'subscription_authorized_payment', data: { id: 7 }, status: 'approved', amount: 0.01 }));
  assert.equal(response.status, 200);
  const apply = h.calls.find(c => c.method === 'apply_saas_payment');
  assert.equal(apply.args.p_status, 'pending'); assert.equal(apply.args.p_amount, 49.90); assert.equal(apply.args.p_payment_id, '77');
});
test('falha de persistência do webhook retorna 500 para permitir nova entrega', async () => {
  const h = handler('saas-webhook', { mp: async () => { throw new Error('Transport unavailable'); } });
  assert.equal((await h.serve(request({ type: 'subscription_preapproval', data: { id: 7 } }))).status, 500);
});
test('worker exige segredo, cancela assinatura uma vez e não cancela pagamento já recebido', async () => {
  const h = handler('saas-provider-jobs', { mp: async path => path.startsWith('/preapproval/') ? { status: 'cancelled' } : { status: 'approved' } });
  assert.equal((await h.serve(request())).status, 401); assert.equal(h.calls.length, 0);
  const rpc = h.client.rpc;
  h.client.rpc = async (name, args) => name === 'claim_saas_provider_jobs' ? { data: [
    { id: 'job-1', lease_token: uuid, kind: 'cancel_subscription', provider_id: 'mp-sub' },
    { id: 'job-2', lease_token: uuid, kind: 'cancel_payment', provider_id: '77' },
  ] } : rpc(name, args);
  const response = await h.serve(request({}, { 'x-saas-job-secret': 'secret' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).completed, 1);
  const finishes = h.calls.filter(c => c.method === 'finish_saas_provider_job');
  assert.equal(finishes[0].args.p_success, true); assert.equal(finishes[1].args.p_success, false);
  assert.match(finishes[1].args.p_error, /Pagamento recebido/);
});
