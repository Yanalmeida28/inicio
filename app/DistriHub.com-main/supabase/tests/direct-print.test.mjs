import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { createRequire } from 'node:module';
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
  await assert.rejects(api.sendReceipt('Cupom'), /Confira a impressora antes de reimprimir/); assert.equal(calls, 1);
  await assert.rejects(api.listReceiptPrinters(), /Abra o Conector DistriHub/); assert.equal(calls, 2);
});
test('Windows queue acknowledgment is required and invalid printer lists are rejected', async () => {
  const api = harness(async () => ({ ok: true, json: async () => ({ status: 'unknown', printers: [123] }) }));
  await assert.rejects(api.listReceiptPrinters(), /inválida/);
  await assert.rejects(api.sendReceipt('Cupom', { name: 'Elgin i8', width: '58' }), /não foi confirmada/);
});

test('printer setup requires physical confirmation and changing paper invalidates the test', async () => {
  const require = createRequire(import.meta.url);
  const saved = []; let sends = 0;
  const component = {};
  const setupSource = await readFile(new URL('../../src/components/partner/PrinterSettings.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(setupSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: component, Error,
    require: name => name === '../../lib/directPrint' ? {
      printerPreferences: () => null, listReceiptPrinters: async () => ['Elgin i8'],
      sendReceipt: async () => { sends++; }, savePrinter: value => saved.push(value),
    } : require(name),
  });
  let renderer;
  try {
    await act(async () => { renderer = TestRenderer.create(React.createElement(component.PrinterSettings)); });
    const button = text => renderer.root.findAllByType('button').find(node => node.children.join('').includes(text));
    await act(async () => button('Buscar impressoras').props.onClick());
    await act(async () => button('Imprimir cupom de teste').props.onClick());
    assert.equal(sends, 1); assert.equal(saved.length, 0);
    assert.ok(button('O cupom saiu corretamente'));
    await act(async () => renderer.root.findAllByType('select')[1].props.onChange({ target: { value: '58' } }));
    assert.equal(button('O cupom saiu corretamente'), undefined);
    await act(async () => button('Imprimir cupom de teste').props.onClick());
    await act(async () => button('O cupom saiu corretamente').props.onClick());
    assert.equal(saved.length, 1); assert.equal(saved[0].width, '58');
    assert.equal(sends, 2);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});
