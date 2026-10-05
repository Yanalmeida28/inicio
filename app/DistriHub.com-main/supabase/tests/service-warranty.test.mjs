import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../src/components/partner/WhiteLabelModule.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { exports: module.exports, require });
const Component = module.exports.WhiteLabelModule;
const settings = {
  id: 'settings', user_id: 'owner', logo_url: null, banner_url: null,
  primary_color: '#3193e5', nav_color: '#0b1927', internal_notice: '',
  warranty_terms: 'Garantia dos produtos', receipt_footer_text: 'Rodapé do cupom',
  show_logo_on_receipt: true, show_cnpj_on_receipt: true, updated_at: '',
  service_warranty_terms: '',
};
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
const saveButton = () => renderer.root.findAllByType('button').find(button => button.props.className === 'module-save-btn');

test('personalization saves multiline service terms independently and reloads the saved text', async () => {
  let submitted;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Component, { settings, onUpdate: async value => { submitted = value; } })); });
  const text = 'Garantia do serviço\nCondições de atendimento';
  await act(async () => renderer.root.findByProps({ id: 'service-warranty-terms' }).props.onChange({ target: { value: text } }));
  await act(async () => saveButton().props.onClick());
  assert.equal(submitted.service_warranty_terms, text);
  assert.equal(submitted.receipt_footer_text, settings.receipt_footer_text);
  assert.equal(submitted.warranty_terms, undefined);
  await act(async () => renderer.update(React.createElement(Component, { settings: { ...settings, service_warranty_terms: text }, onUpdate: async () => {} })));
  assert.equal(renderer.root.findByProps({ id: 'service-warranty-terms' }).props.value, text);
});

test('failed service-term save retains the draft and shows an error until a successful retry', async () => {
  let fail = true;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Component, { settings, onUpdate: async () => { if (fail) throw new Error('Falha ao salvar'); } })); });
  await act(async () => renderer.root.findByProps({ id: 'service-warranty-terms' }).props.onChange({ target: { value: 'Meu termo' } }));
  await act(async () => saveButton().props.onClick());
  assert.equal(renderer.root.findByProps({ role: 'alert' }).children.join(''), 'Falha ao salvar');
  assert.equal(renderer.root.findByProps({ id: 'service-warranty-terms' }).props.value, 'Meu termo');
  assert.equal(saveButton().children.join(''), 'Salvar personalização');
  fail = false;
  await act(async () => saveButton().props.onClick());
  assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 0);
});
