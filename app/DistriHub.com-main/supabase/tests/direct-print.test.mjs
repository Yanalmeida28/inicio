import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { createRequire } from 'node:module';
const source = await readFile(new URL('../../src/lib/directPrint.ts', import.meta.url), 'utf8');
function harness(fetch, navigator) {
  const entries = new Map(); const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, fetch, navigator, AbortController, setTimeout, clearTimeout, Error, TypeError,
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

test('Mac uses browser printing even when restored settings request the Windows connector', () => {
  for (const browser of [
    { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17 Safari/605.1.15' },
    { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130 Safari/537.36' },
  ]) {
    const api = harness(() => { throw Error('Mac must not call connector'); }, browser);
    assert.equal(api.isMacComputer(), true);
    api.savePrinter({ name: 'Migrated Windows printer', width: '80', mode: 'image' });
    assert.equal(api.printerPreferences().mode, 'personalized');
  }
  const windows = harness(undefined, { platform: 'Win32', userAgent: 'Windows NT 10.0' });
  windows.savePrinter({ name: 'Printer', width: '80', mode: 'image' });
  assert.equal(windows.printerPreferences().mode, 'image');
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

test('Mac printer settings explain system printing without offering the Windows installer',async()=>{
  const require = createRequire(import.meta.url);
  const api=harness(()=>{throw Error('unexpected connector call');},{platform:'MacIntel',userAgent:'Macintosh Safari'});
  const exports={};
  const source=await readFile(new URL('../../src/components/partner/PrinterSettings.tsx',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    exports,require:name=>name==='../../lib/directPrint'?api:name==='../../lib/receiptImage'?{}:require(name),
  });
  let renderer;
  try{
    await act(async()=>{renderer=TestRenderer.create(React.createElement(exports.PrinterSettings));});
    assert.match(JSON.stringify(renderer.toJSON()),/No Mac/);
    assert.equal(renderer.root.findAllByType('a').length,0);
    assert.equal(renderer.root.findAllByType('button').length,0);
  }finally{if(renderer)await act(async()=>renderer.unmount());}
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

test('image printing refuses old connectors before any job is submitted', async () => {
  for (const metadata of [{ version: 1 }, { capabilities: ['receipt-png-v1'] }, { version: 2, capabilities: [] }]) {
    const calls=[];
    const api=harness(async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>metadata};});
    await assert.rejects(api.sendReceiptImage({png:'aGVsbG8=',pixelWidth:640,pixelHeight:800},{name:'Printer',width:'80',mode:'image'}),/Atualize o Conector/);
    assert.equal(calls.length,1);assert.equal(calls[0].options.method,'GET');
  }
});

test('image jobs preserve PNG and dimensions, deduplicate concurrent sends and never retry a lost acknowledgment', async () => {
  const calls=[]; let release;
  const api=harness(async(url,options)=>{
    calls.push({url,options});
    if(options.method==='GET')return {ok:true,json:async()=>({version:2,capabilities:['receipt-png-v1']})};
    return new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({status:'queued'})});});
  });
  const image={png:'aGVsbG8=',pixelWidth:640,pixelHeight:800};
  const preferences={name:'Printer',width:'80',mode:'image'};
  const first=api.sendReceiptImage(image,preferences);const second=api.sendReceiptImage(image,preferences);
  assert.equal(first,second);await new Promise(resolve=>setTimeout(resolve,0));
  const body=JSON.parse(calls[1].options.body);
  assert.equal(body.format,'receipt-png-v1');assert.equal(body.png,image.png);assert.equal(body.pixelWidth,640);
  assert.equal(body.width,80);release();await first;assert.equal(calls.length,2);
  let posts=0;
  const failing=harness(async(url,options)=>{
    if(options.method==='GET')return {ok:true,json:async()=>({version:2,capabilities:['receipt-png-v1']})};
    posts++;throw new TypeError('lost response');
  });
  await assert.rejects(failing.sendReceiptImage(image,preferences),/Confira a impressora/);assert.equal(posts,1);
  await assert.rejects(api.sendReceiptImage({...image,pixelHeight:30001},preferences),/inválida/);
});

test('printer setup requires physical confirmation and changing paper invalidates the test', async () => {
  const require = createRequire(import.meta.url);
  const saved = []; let sends = 0;
  const component = {};
  const setupSource = await readFile(new URL('../../src/components/partner/PrinterSettings.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(setupSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: component, Error,
    require: name => name === '../../lib/receiptImage' ? { renderReceiptImage: async () => ({ png: 'test', pixelWidth: 640, pixelHeight: 800 }) } : name === '../../lib/directPrint' ? {
      isMacComputer: () => false, printerPreferences: () => null, listReceiptPrinters: async () => ['Elgin i8'],
      sendReceipt: async () => { sends++; }, savePrinter: value => saved.push(value),
      requireImageConnector: async () => {}, sendReceiptImage: async () => { sends++; },
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
    assert.equal(saved[0].mode, 'image');
    await act(async () => renderer.root.findAllByType('select')[2].props.onChange({ target: { value: 'text' } }));
    assert.equal(button('O cupom saiu corretamente'), undefined);
    await act(async () => button('Imprimir cupom de teste').props.onClick());
    await act(async () => button('O cupom saiu corretamente').props.onClick());
    assert.equal(saved[1].mode, 'text');
    await act(async () => button('Usar cupom personalizado').props.onClick());
    assert.equal(saved[2].mode, 'personalized');
    assert.equal(sends, 3);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});
