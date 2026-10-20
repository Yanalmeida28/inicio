import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const api = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/lib/serviceChecklist.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: api });

test('legacy checkbox drafts and legacy prose never become invented functional results', () => {
  assert.equal(api.checklistComplete('Celular', { screen: true, touch: true, camera: true }), false);
  assert.equal(Object.keys(api.readChecklist('Checklist pré-reparo: Tela acende; Touch responde.', 'Celular', 'entrada')).length, 0);
});
test('all four outcomes round-trip independently between entry and exit, using equipment-specific items', () => {
  const items = api.checklistItems('iPad');
  assert.ok(items.some(([key]) => key === 'proximity'));
  assert.equal(api.checklistItems('Impressora').some(([key]) => key === 'sim'), false);
  const values = Object.fromEntries(items.map(([key], index) => [key, api.checklistResults[index % 4]]));
  assert.equal(api.checklistComplete('iPad', values), true);
  const entry = api.checklistText('iPad', values, 'entrada');
  const exit = api.checklistText('iPad', { ...values, touch: 'Com defeito' }, 'saída');
  assert.equal(JSON.stringify(api.readChecklist(entry, 'iPad', 'entrada')), JSON.stringify(values));
  assert.equal(Object.keys(api.readChecklist(entry, 'iPad', 'saída')).length, 0);
  assert.equal(api.readChecklist(exit, 'iPad', 'saída').touch, 'Com defeito');
  assert.equal(api.withoutExitChecklist(`Motivo original\n\n${exit}`), 'Motivo original');
});
