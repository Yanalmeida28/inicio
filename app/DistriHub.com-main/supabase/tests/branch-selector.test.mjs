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
const source = await readFile(new URL('../../src/components/partner/BranchSelector.tsx', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require });
const branches = [{ id: 'a', name: 'Centro' }, { id: 'b', name: 'Norte' }];

test('filiais aparecem abaixo do resumo e a seleção usa o callback sem navegação', async () => {
  let selected;
  let closed = false;
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(exports.BranchSelector, { branches, selectedBranchId: 'a', isEmployeeLocked: false, onSelectBranch: id => { selected = id; } })); });
  try {
    const details = renderer.root.findByType('details');
    assert.equal(details.children[0].type, 'summary');
    const buttons = details.findAllByType('button');
    assert.equal(buttons.length, 3);
    assert.equal(buttons[1].props['aria-pressed'], true);
    await act(async () => buttons[2].props.onClick({ currentTarget: { closest: () => ({ removeAttribute: name => { closed = name === 'open'; } }) } }));
    assert.equal(selected, 'b');
    assert.equal(closed, true);
  } finally { await act(async () => renderer.unmount()); }
});

test('funcionário com filial fixa não recebe opções para trocar de filial', async () => {
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(exports.BranchSelector, { branches, selectedBranchId: 'a', isEmployeeLocked: true, onSelectBranch: () => assert.fail('filial fixa') })); });
  try {
    assert.equal(renderer.root.findAllByType('details').length, 0);
    assert.equal(renderer.root.findAllByType('button').length, 0);
    assert.ok(renderer.root.findAllByType('span').some(node => node.children.includes('Centro')));
  } finally { await act(async () => renderer.unmount()); }
});
