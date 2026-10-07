import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';

const exports = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/lib/storeTheme.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports });

function luminance(hex) {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const levels = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (levels[0] + 0.05) / (levels[1] + 0.05);
}

test('cores inválidas usam padrão; hexadecimal curto é expandido', () => {
  assert.equal(exports.normalizeColor('red'), '#3193e5');
  assert.equal(exports.normalizeColor(null), '#3193e5');
  assert.equal(exports.normalizeColor('#ABC'), '#aabbcc');
});

test('texto mantém contraste em cores claras, escuras e saturadas', () => {
  for (const color of ['#ffffff', '#000000', '#ffff00', '#00ff00', '#ff0000', '#3193e5', '#5fd0d1', '#e3829b']) {
    const theme = exports.storeTheme(color, color);
    assert.equal(theme['--dh-blue'], color);
    assert.ok(contrast(color, theme['--dh-on-primary']) >= 4.5);
    assert.ok(contrast(color, theme['--store-nav-text']) >= 4.5);
    assert.ok(contrast(theme['--dh-blue-hover'], theme['--dh-on-primary-hover']) >= 4.5);
    assert.ok(contrast('#ffffff', theme['--dh-accent-text']) >= 4.5);
  }
});

test('destaques suaves acompanham a cor escolhida', () => {
  assert.equal(exports.storeTheme('#199863')['--dh-blue-soft'], 'rgba(25,152,99,0.08)');
});
