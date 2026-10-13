import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const source = await readFile(new URL('../../src/lib/directPrint.ts', import.meta.url), 'utf8');
function harness(fetch) {
  const entries = new Map(); const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, fetch, AbortController, setTimeout, clearTimeout, Error, TypeError,
    crypto: { randomUUID: () => 'job-id' }, localStorage: { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) },
  });
  return exports;
}
test('printer settings remain local and malformed settings do not activate direct printing', () => {
  const api = harness(); assert.equal(api.printerPreferences(), null);
  api.savePrinter({ name: 'Elgin i8', width: '80' }); assert.equal(api.printerPreferences().name, 'Elgin i8');
  assert.equal(harness().printerPreferences(), null);
  api.savePrinter({ name: 'bad', width: 'invalid' }); assert.equal(api.printerPreferences(), null);
  api.savePrinter(null); assert.equal(api.printerPreferences(), null);
});
test('simultaneous receipt clicks submit once and a later intentional reprint remains possible', async () => {
  let release; const calls = [];
  const api = harness((url, options) => { calls.push({ url, ...options }); return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ status: 'queued' }) }); }); });
  api.savePrinter({ name: 'Elgin i8', width: '80' });
  const first = api.sendReceipt('Cupom R$ 90'); const second = api.sendReceipt('Cupom R$ 90');
  assert.equal(first, second); assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:17891/print');
  assert.equal(JSON.parse(calls[0].body).printer, 'Elgin i8'); assert.equal(JSON.parse(calls[0].body).width, 80);
  release(); await first;
  const reprint = api.sendReceipt('Cupom R$ 90'); assert.equal(calls.length, 2); release(); await reprint;
});
test('connector failure is reported without retrying or opening the browser print dialog', async () => {
  let calls = 0;
  const api = harness(async () => { calls++; throw new TypeError('offline'); });
  api.savePrinter({ name: 'Elgin i8', width: '80' });
  await assert.rejects(api.sendReceipt('Cupom'), /Conector DistriHub/); assert.equal(calls, 1);
});
test('Windows queue acknowledgment is required and invalid printer lists are rejected', async () => {
  const api = harness(async () => ({ ok: true, json: async () => ({ status: 'unknown', printers: [123] }) }));
  await assert.rejects(api.listReceiptPrinters(), /inválida/);
  await assert.rejects(api.sendReceipt('Cupom', { name: 'Elgin i8', width: '58' }), /não foi confirmada/);
});
