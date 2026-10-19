import assert from 'node:assert/strict';
import { test } from 'node:test';
import { helpers as h, sale, product, invoice, payable, input } from './fixtures/business_intelligence_helpers.mjs';
const expense = (patch = {}) => payable({ amount: 30, paid_amount: 0, status: 'aberta', due_date: '2026-10-10', ...patch });
const model = (patch = {}) => h.buildBusinessIntelligence(input({ payables: [expense()], rmas: [], ...patch }));
const rma = (patch = {}) => ({ id: 'return', user_id: 'company', branch_id: 'A', sale_id: 's', sale_item_index: 0, product_id: 'p',
  quantity: 1, credit_amount: 0, refund_amount: 0, created_at: '2026-10-10T12:00:00Z', status: 'aguardando_troca', ...patch });

test('open and partially paid expenses reduce the registered result once, not once per payment', () => {
  const open = model();
  assert.equal(open.result.expenses, 30); assert.equal(open.result.result, 30); assert.equal(open.result.margin, 30); assert.equal(open.result.status, 'profit');
  const partial = model({ payables: [expense({ paid_amount: 5, status: 'parcial' })], payments: [{ id: 'pay', user_id: 'company', payable_id: 'bill', amount: 5, created_at: '2026-10-10T12:00:00Z' }] });
  assert.equal(partial.result.result, 30); assert.equal(partial.paid, 5); assert.equal(partial.cashResult, 115);
});

test('billed revenue and receipts remain separate: profit can be positive while cash movement is negative', () => {
  const result = model({ sales: [sale({ payment_method: 'faturado' })],
    invoices: [invoice({ sale_id: 's', paid_amount: 25 })], payables: [expense({ paid_amount: 30, status: 'paga' })],
    receipts: [{ id: 'receipt', user_id: 'company', branch_id: 'A', invoice_id: 'i', amount: 25, occurred_at: '2026-10-10T12:00:00Z' }],
    payments: [{ id: 'pay', user_id: 'company', payable_id: 'bill', amount: 30, created_at: '2026-10-10T12:00:00Z' }] });
  assert.equal(result.currentRevenue, 100); assert.equal(result.result.result, 30); assert.equal(result.received, 25); assert.equal(result.cashResult, -5);
  assert.ok(result.alerts.some(alert => alert.id === 'cash-deficit'));
});

test('inventory purchases are reported separately and paid purchases affect cash without duplicating COGS', () => {
  const result = model({ payables: [expense(), expense({ id: 'inventory', category: 'fornecedor', amount: 1000, paid_amount: 1000, status: 'paga' })],
    payments: [{ id: 'purchase', user_id: 'company', payable_id: 'inventory', amount: 1000, created_at: '2026-10-10T12:00:00Z' }] });
  assert.equal(result.result.purchases, 1000); assert.equal(result.result.expenses, 30); assert.equal(result.result.result, 30); assert.equal(result.cashResult, -880);
});

test('cancelled and out-of-period expenses do not enter the calculation; pending balances are not used as total expense', () => {
  const result = model({ payables: [expense({ amount: 80, paid_amount: 70, status: 'parcial' }), expense({ id: 'cancel', status: 'cancelada', amount: 999 }),
    expense({ id: 'future', due_date: '2026-10-25', amount: 500 }), expense({ id: 'old', due_date: '2026-09-01', amount: 500 })] });
  assert.equal(result.result.expenses, 80); assert.equal(result.result.result, -20); assert.equal(result.result.status, 'loss');
  assert.equal(result.result.categories[0].amount, 80); assert.ok(result.alerts.some(alert => alert.id === 'registered-loss'));
  assert.equal(model({ payables: [expense({ amount: 60 })] }).result.status, 'balanced');
});

test('refunds reduce revenue and a confirmed restock reverses only the cost of the returned quantity', () => {
  const result = model({ rmas: [rma({ refund_amount: 50, refunded_at: '2026-10-10T12:00:00Z', stock_restored_at: '2026-10-10T12:00:00Z' })],
    refunds: [{ id: 'return', user_id: 'company', branch_id: 'A', refund_amount: 50, refunded_at: '2026-10-10T12:00:00Z' }] });
  assert.equal(result.result.netRevenue, 50); assert.equal(result.result.restoredCost, 20); assert.equal(result.result.netCost, 20);
  assert.equal(result.result.result, 0); assert.equal(result.cashResult, 70);
});

test('issuing a return credit reduces revenue once; using that credit is not a new expense or a cash receipt', () => {
  const credit = rma({ credit_amount: 30, credit_used_amount: 20, credited_at: '2026-10-10T12:00:00Z' });
  const result = model({ sales: [sale({ payment_method: 'faturado' })], rmas: [credit, credit],
    invoices: [invoice({ sale_id: 's', paid_amount: 20, return_credit_amount: 20 })] });
  assert.equal(result.result.returns, 30); assert.equal(result.result.result, 0); assert.equal(result.result.returnCount, 1);
  assert.equal(result.received, 0); assert.equal(result.cashResult, 0);
});

test('a return from an earlier sale affects its actual event period, without introducing the old sale revenue again', () => {
  const result = model({ sales: [sale({ completed_at: '2026-09-01T12:00:00Z' })],
    rmas: [rma({ refund_amount: 50, refunded_at: '2026-10-10T12:00:00Z', stock_restored_at: '2026-10-10T12:00:00Z' })] });
  assert.equal(result.currentRevenue, 0); assert.equal(result.result.netRevenue, -50); assert.equal(result.result.restoredCost, 20);
  assert.equal(result.result.result, -60); assert.equal(result.result.margin, null);
});

test('missing, invalid or unclassifiable expenses and absent return coverage never produce a fictitious result', () => {
  for (const payables of [[], [expense({ category: 'fornecedor' })], [expense({ due_date: '' })], [expense({ due_date: '2026-02-30' })],
    [expense({ amount: NaN })], [expense({ category: 'unknown' })]]) assert.equal(model({ payables }).result.result, null);
  assert.equal(model({ rmas: undefined }).result.result, null);
  assert.equal(model({ sales: [sale({ cost_snapshot: null })], products: [] }).result.result, null);
});

test('invalid return dates, missing sale links, conflicting settlements and excessive returned quantities fail closed', () => {
  for (const record of [rma({ refund_amount: 10 }), rma({ credit_amount: 10, refund_amount: 10 }),
    rma({ credit_amount: 10, credited_at: '2026-10-10', sale_id: 'missing' }), rma({ refund_amount: 999, refunded_at: '2026-10-10' }),
    rma({ stock_restored_at: '2026-10-10', sale_id: 'missing' }), rma({ stock_restored_at: '2026-10-10', quantity: 3 })]) {
    const result = model({ rmas: [record] }); assert.equal(result.result.result, null); assert.ok(result.result.invalidReturns > 0);
  }
  assert.equal(model({ rmas: [rma({ id: 'one', quantity: 2, stock_restored_at: '2026-10-10' }), rma({ id: 'two', stock_restored_at: '2026-10-10' })] }).result.result, null);
});

test('company and branch scopes also protect expenses and return adjustments; shared accounts are consolidated only', () => {
  const result = model({ payables: [expense(), expense({ id: 'foreign', user_id: 'other', amount: 999 }), expense({ id: 'other-branch', branch_id: 'B', amount: 999 }), expense({ id: 'shared', branch_id: null, amount: 10 })],
    rmas: [rma({ user_id: 'other', refund_amount: 999 }), rma({ id: 'other-branch', branch_id: 'B', refund_amount: 999 })] });
  assert.equal(result.result.result, 30);
  const consolidated = model({ branch: '', payables: [expense(), expense({ id: 'shared', branch_id: null, amount: 10 })] });
  assert.equal(consolidated.result.expenses, 40); assert.equal(consolidated.result.result, 20);
});

test('month-to-date and today include current registrations using the Sao Paulo day; closed periods remain unchanged', () => {
  const sales = [sale(), sale({ id: 'today', completed_at: '2026-10-19T03:00:00Z' })];
  const month = model({ period: 'month', sales, payables: [expense({ amount: 20, due_date: '2026-10-19' })] });
  assert.equal(month.first, '2026-10-01'); assert.equal(month.last, '2026-10-19'); assert.equal(month.result.result, 100);
  const today = model({ period: 'today', sales, payables: [expense({ amount: 20, due_date: '2026-10-19' })] });
  assert.equal(today.first, today.last); assert.equal(today.result.result, 40); assert.equal(today.comparisonReady, false);
  assert.equal(model({ sales }).currentRevenue, 100);
});

test('missing dated payment history disables the cash movement but does not deduct a payable twice from profit', () => {
  const result = model({ payables: [expense({ paid_amount: 5, status: 'parcial' })] });
  assert.equal(result.missingCashHistory, 1); assert.equal(result.cashResult, null); assert.equal(result.result.result, 30);
});

test('decimal amounts are reconciled in cents and unsafe results are never displayed as valid profit', () => {
  const decimal = model({ sales: [sale({ total: 0.30, items: [{ product_id: 'p', quantity: 3, unit_price: 0.10 }], cost_snapshot: { p: 0.03 } })], payables: [expense({ amount: 0.21 })] });
  assert.equal(decimal.result.result, 0);
  const huge = model({ payables: [expense({ amount: Number.MAX_VALUE })] }); assert.equal(huge.result.result, null);
});
