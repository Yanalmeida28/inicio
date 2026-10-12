import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const helpers = {};
const source = await readFile(new URL('../../src/lib/adminOverview.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: helpers, Date, require: () => ({}) });
test('filtro de período respeita o dia em São Paulo e inclui os limites', () => {
  assert.equal(helpers.adminDay('2026-10-12T01:30:00Z'), '2026-10-11');
  assert.equal(helpers.matchesPeriod('2026-10-12T01:30:00Z', '2026-10-11', '2026-10-11'), true);
  assert.equal(helpers.matchesPeriod('2026-10-12T01:30:00Z', '2026-10-12', ''), false);
  assert.equal(helpers.matchesPeriod(null, '2026-10-12', ''), false);
});
test('vencimento considera o maior acesso pago ou manual e ignora empresas isentas', () => {
  const s = { status: 'active', can_access: true, billing_mode: 'paid', paid_until: '2030-01-01T00:00:00Z', admin_access_until: '2030-02-01T00:00:00Z' };
  assert.equal(helpers.accessDeadline(s), s.admin_access_until);
  assert.equal(helpers.accessDeadline({ ...s, billing_mode: 'exempt' }), null);
  assert.equal(helpers.accessDeadline({ ...s, can_access: false }), null);
  assert.equal(helpers.accessDeadline({ ...s, status: 'past_due', grace_until: '2030-03-01T00:00:00Z' }), '2030-03-01T00:00:00Z');
});
test('previsão recorrente exclui teste, isenção, suspensão e plano sem renovação', () => {
  const s = { status: 'active', can_access: true, billing_mode: 'paid', auto_renew: true, monthly_amount: 99.9 };
  assert.equal(helpers.recurringRevenue([s, { ...s, status: 'trial' }, { ...s, billing_mode: 'exempt' }, { ...s, can_access: false }, { ...s, auto_renew: false }]), 99.9);
});
test('evolução mensal conta apenas pagamentos recebidos pelo mês local', () => {
  const rows = helpers.monthlyReceipts([
    { status: 'paid', paid_at: '2026-11-01T01:00:00Z', amount: '49.90' },
    { status: 'paid', paid_at: '2026-10-02T12:00:00Z', amount: 50.1 },
    { status: 'refunded', paid_at: '2026-10-02T12:00:00Z', amount: 500 },
    { status: 'pending', paid_at: null, amount: 300 },
  ]);
  assert.equal(JSON.stringify(rows), JSON.stringify([['2026-10', 100]]));
});
test('motivo explica bloqueio, isenção e liberação manual', () => {
  assert.match(helpers.accessExplanation({ status: 'suspended', can_access: false }), /suspenso/);
  assert.match(helpers.accessExplanation({ status: 'expired', can_access: false }), /vencidos/);
  assert.match(helpers.accessExplanation({ can_access: true, billing_mode: 'exempt' }), /isenta/);
  assert.match(helpers.accessExplanation({ can_access: true, status: 'active', billing_mode: 'paid', admin_access_until: '2099-01-01T00:00:00Z' }), /manual/);
});
