import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';

const sql = await readFile(new URL('../migrations/20261029161603_independent_owner_access_password.sql', import.meta.url), 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const staff = '33333333-3333-4333-8333-333333333333';
test('owner password has independent storage, current-password checks, rate limits and tenant isolation', async () => {
  const db = new PGlite();
  try {
    // Crypto stubs exercise the authorization/state machine; deployment uses
    // the existing pgcrypto crypt/gen_salt functions, never these test stubs.
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA extensions;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, encrypted_password text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
      CREATE FUNCTION extensions.crypt(text,text) RETURNS text LANGUAGE sql AS $$ SELECT 'hash:'||$1 $$;
      CREATE FUNCTION extensions.gen_salt(text,integer) RETURNS text LANGUAGE sql AS $$ SELECT 'test-salt'::text $$;
      CREATE TABLE public.partner_profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.partner_salespeople(auth_user_id uuid);
      INSERT INTO auth.users VALUES ('${owner}','hash:login-password'),('${other}','hash:other-login'),('${staff}','hash:staff-login');
      INSERT INTO public.partner_profiles VALUES ('${owner}'),('${other}');
      INSERT INTO public.partner_salespeople VALUES ('${staff}');`);
    await db.exec(sql);
    const actor = id => db.query("select set_config('test.actor',$1,false)", [id]);
    const verify = async password => (await db.query('select public.verify_partner_owner_password($1) as ok', [password])).rows[0].ok;
    const change = async (current, next) => (await db.query('select public.change_partner_owner_password($1,$2) as ok', [current, next])).rows[0].ok;
    const configured = async () => (await db.query('select public.partner_owner_password_configured() as ok')).rows[0].ok;
    await actor(owner);
    assert.equal(await configured(), false);
    assert.equal(await verify('login-password'), true);
    assert.equal(await change('bad-current', 'owner-password'), false);
    assert.equal(await change('login-password', 'short'), false);
    assert.equal(await change('login-password', 'owner-password'), true);
    assert.equal(await configured(), true);
    assert.equal(await verify('login-password'), false);
    assert.equal(await verify('owner-password'), true);
    assert.equal(await change('owner-password', 'next-owner-password'), true);
    assert.equal(await verify('owner-password'), false);
    assert.equal(await verify('next-owner-password'), true);
    assert.equal((await db.query('select encrypted_password from auth.users where id=$1', [owner])).rows[0].encrypted_password, 'hash:login-password');
    for (let i = 0; i < 5; i++) assert.equal(await verify('wrong'), false);
    assert.equal(await verify('next-owner-password'), false);
    assert.equal(await change('next-owner-password', 'cannot-change-locked'), false);
    await actor(other);
    assert.equal(await configured(), false);
    assert.equal(await verify('next-owner-password'), false);
    assert.equal(await verify('other-login'), true);
    await actor(staff);
    assert.equal(await verify('staff-login'), false);
    assert.equal(await change('staff-login', 'staff-owner-password'), false);
    await actor('');
    assert.equal(await verify('next-owner-password'), false);
    const grants = (await db.query(`select has_function_privilege('anon','public.verify_partner_owner_password(text)','EXECUTE') as anon,
      has_function_privilege('authenticated','partner_owner_private.verify(text)','EXECUTE') as internal,
      has_schema_privilege('authenticated','partner_owner_private','USAGE') as private_schema`)).rows[0];
    assert.deepEqual(grants, { anon: false, internal: false, private_schema: false });
    assert.equal((await db.query('select password_hash from partner_owner_private.credentials where company_id=$1', [owner])).rows[0].password_hash, 'hash:next-owner-password');
  } finally { await db.close(); }
});

test('owner password settings validate confirmation, use only the dedicated RPC and clear secrets after saving', async () => {
  const calls = [], exports = {};
  const client = { async rpc(name, args) { calls.push({ name, args });
    return { data: name === 'partner_owner_password_configured' ? false : args.p_current_password === 'login-password', error: null };
  }, auth: { updateUser() { throw new Error('Must not change login password'); } } };
  const source = await readFile(new URL('../../src/components/partner/OwnerPasswordSettings.tsx', import.meta.url), 'utf8');
  const require = createRequire(import.meta.url);
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, Error, TextEncoder, require: name => name === '../../lib/supabase' ? { supabase: client } : require(name) });
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(exports.OwnerPasswordSettings)); });
  const input = label => renderer.root.findByProps({ 'aria-label': label });
  const fill = async (label, value) => act(async () => input(label).props.onChange({ target: { value } }));
  const save = () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} });
  try {
    await fill('Senha atual do proprietário', 'login-password');
    await fill('Nova senha do proprietário', 'owner-new-password');
    await fill('Confirmar senha do proprietário', 'different');
    await act(async () => save());
    assert.equal(calls.filter(call => call.name === 'change_partner_owner_password').length, 0);
    await fill('Confirmar senha do proprietário', 'owner-new-password');
    await act(async () => { await Promise.all([save(), save()]); });
    assert.equal(calls.filter(call => call.name === 'change_partner_owner_password').length, 1);
    assert.equal(input('Senha atual do proprietário').props.value, '');
    assert.equal(input('Nova senha do proprietário').props.value, '');
    assert.equal(input('Confirmar senha do proprietário').props.value, '');
    assert.ok(renderer.root.findAllByProps({ role: 'status' }).some(node => node.children.join('').includes('login continua igual')));
    await fill('Senha atual do proprietário', 'wrong');
    await fill('Nova senha do proprietário', 'another-owner-password');
    await fill('Confirmar senha do proprietário', 'another-owner-password');
    await act(async () => save());
    assert.ok(renderer.root.findByProps({ role: 'alert' }).children.join('').includes('Senha atual incorreta'));
    const panel = await readFile(new URL('../../src/components/PartnerPanel.tsx', import.meta.url), 'utf8');
    assert.match(panel, /canManageOwnerPassword={Boolean\(identity && !isEmployeeRestricted && !pinOperator\)}/);
  } finally { await act(async () => renderer.unmount()); }
});
