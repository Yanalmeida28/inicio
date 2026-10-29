import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';

const require = createRequire(import.meta.url);
const exports = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/components/partner/AccountAccessDialog.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports, require });

for (const mode of ['employee', 'owner']) {
  test(`${mode} access requires explicit account switch and never offers a free-access selector`, async () => {
    let exits = 0, closes = 0, renderer;
    await act(async () => { renderer = TestRenderer.create(React.createElement(exports.AccountAccessDialog, {
      mode, onContinue: async () => { exits++; }, onClose: () => { closes++; },
    })); });
    try {
      assert.equal(exits, 0);
      assert.equal(renderer.root.findAllByType('select').length, 0);
      assert.match(JSON.stringify(renderer.toJSON()), /e-mail e.{0,6} senha/);
      const cancel = renderer.root.findAllByType('button').find(button => button.children.includes('Cancelar'));
      await act(async () => cancel.props.onClick());
      assert.equal(closes, 1);
      assert.equal(exits, 0);
      const proceed = renderer.root.findByProps({ className: 'module-submit-btn' });
      await act(async () => proceed.props.onClick());
      assert.equal(exits, 1);
    } finally { await act(async () => renderer.unmount()); }
  });
}

test('pending logout blocks duplicate submission and failure allows retry without granting access', async () => {
  let exits = 0, fail, renderer;
  const pending = new Promise((_, reject) => { fail = reject; });
  await act(async () => { renderer = TestRenderer.create(React.createElement(exports.AccountAccessDialog, {
    mode: 'owner', onContinue: () => { exits++; return exits === 1 ? pending : Promise.resolve(); }, onClose: () => {},
  })); });
  try {
    const proceed = () => renderer.root.findByProps({ className: 'module-submit-btn' });
    await act(async () => { proceed().props.onClick(); proceed().props.onClick(); });
    assert.equal(exits, 1);
    assert.equal(proceed().props.disabled, true);
    await act(async () => fail(new Error('Network error')));
    assert.ok(renderer.root.findByProps({ role: 'alert' }));
    assert.equal(proceed().props.disabled, false);
    await act(async () => proceed().props.onClick());
    assert.equal(exits, 2);
  } finally { await act(async () => renderer.unmount()); }
});
