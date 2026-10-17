import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
let authOptions;
const source = (await readFile(new URL('../../src/lib/supabase.ts', import.meta.url), 'utf8'))
  .replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://auth.example.test'")
  .replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY', "'synthetic-public-key'");
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports: {}, require: () => ({ createClient: (_url, _key, options) => { authOptions = options.auth; return {}; } }),
});

test('persisted sessions survive reload and refresh on another device after local logout using the real auth SDK', async () => {
  assert.equal(authOptions.persistSession, true);
  assert.equal(authOptions.autoRefreshToken, true);
  const sessions = new Map(), clients = [], requests = [];
  let serial = 0;
  const user = { id: 'synthetic-user', aud: 'authenticated', role: 'authenticated', email: 'user@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const token = (id, version) => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, session_id: id, version, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`;
  function issue(id) {
    const row = { id, access: token(id, ++serial), refresh: `refresh-${serial}` };
    sessions.set(id, row);
    return { access_token: row.access, refresh_token: row.refresh, token_type: 'bearer', expires_in: 3600, user };
  }
  const fetch = async (url, init) => {
    const parsed = new URL(url), body = init.body ? JSON.parse(init.body) : {};
    requests.push(parsed.pathname + parsed.search);
    let result;
    if (parsed.searchParams.get('grant_type') === 'password') result = issue(`device-${++serial}`);
    else if (parsed.searchParams.get('grant_type') === 'refresh_token') {
      const row = [...sessions.values()].find(value => value.refresh === body.refresh_token);
      if (!row) return new Response(JSON.stringify({ message: 'Invalid refresh token', code: 'refresh_token_not_found' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      result = issue(row.id);
    } else if (parsed.pathname.endsWith('/logout')) {
      assert.equal(parsed.searchParams.get('scope'), 'local');
      const headers = new Headers(init.headers);
      const row = [...sessions.values()].find(value => `Bearer ${value.access}` === headers.get('authorization'));
      if (row) sessions.delete(row.id);
      result = {};
    } else throw new Error('Unexpected auth request: ' + url);
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const makeClient = values => {
    const client = createClient('https://auth.example.test', 'synthetic-public-key', {
      global: { fetch }, auth: { ...authOptions, storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } },
    });
    clients.push(client);
    return client;
  };
  const firstStorage = new Map(), mobileStorage = new Map();
  try {
    const first = makeClient(firstStorage), mobile = makeClient(mobileStorage);
    assert.equal((await first.auth.signInWithPassword({ email: user.email, password: 'synthetic' })).error, null);
    assert.equal((await mobile.auth.signInWithPassword({ email: user.email, password: 'synthetic' })).error, null);
    await mobile.auth.stopAutoRefresh();
    const before = JSON.parse(mobileStorage.get(authOptions.storageKey));
    assert.equal((await first.auth.signOut({ scope: 'local' })).error, null);
    assert.equal(firstStorage.has(authOptions.storageKey), false);
    assert.equal(sessions.size, 1);
    // Simulate a suspended mobile browser being reloaded after token expiry.
    mobileStorage.set(authOptions.storageKey, JSON.stringify({ ...before, expires_at: Math.floor(Date.now() / 1000) - 60 }));
    const reloaded = makeClient(mobileStorage);
    const restored = await reloaded.auth.getSession();
    assert.equal(restored.error, null);
    assert.equal(restored.data.session.user.id, user.id);
    assert.notEqual(restored.data.session.refresh_token, before.refresh_token);
    assert.equal(requests.filter(url => url.includes('grant_type=password')).length, 2);
    assert.ok(requests.some(url => url.includes('grant_type=refresh_token')));
  } finally { for (const client of clients) await client.auth.stopAutoRefresh(); }
});
