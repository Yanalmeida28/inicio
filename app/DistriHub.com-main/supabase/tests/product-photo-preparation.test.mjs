import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const source = ts.transpileModule(await readFile(new URL('../../src/lib/productPhoto.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function harness({ decodeFailure = false, heicFailure = false, sizes = [1000] } = {}) {
  const exports = {}, released = [], qualities = [], converted = [], dimensions = {};
  const canvas = { getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob(callback, type, quality) { qualities.push(quality); dimensions.width = canvas.width; dimensions.height = canvas.height; callback(new Blob([new Uint8Array(sizes.shift() ?? 1000)], { type })); } };
  vm.runInNewContext(source, { exports, Error, File, Blob, URL: { createObjectURL: () => 'blob:test', revokeObjectURL: url => released.push(url) }, Image: class { naturalWidth = 4000; naturalHeight = 3000; set src(_value) { if (decodeFailure) this.onerror(); else this.onload(); } }, document: { createElement: () => canvas }, require(name) { assert.equal(name, 'heic-to/csp'); return { async heicTo(options) { converted.push(options); if (heicFailure) throw new Error('decode'); return new Blob(['jpeg'], { type: 'image/jpeg' }); } }; } });
  return { prepare: exports.prepareProductPhoto, released, qualities, converted, dimensions };
}
test('small supported files keep their identity and blank MIME is inferred from the filename', async () => {
  const h = harness(), file = new File(['photo'], 'photo.png', { type: 'image/png' });
  assert.equal(await h.prepare(file), file);
  assert.equal((await h.prepare(new File(['photo'], 'photo.JFIF'))).type, 'image/jpeg');
});
test('large phone photos are resized and compressed below the storage limit', async () => {
  const h = harness({ sizes: [3 * 1024 * 1024, 1000] });
  const result = await h.prepare(new File([new Uint8Array(4 * 1024 * 1024)], 'camera.jpg', { type: 'image/jpeg' }));
  assert.equal(result.type, 'image/jpeg'); assert.equal(result.size, 1000);
  assert.deepEqual(h.dimensions, { width: 1600, height: 1200 }); assert.deepEqual(h.qualities, [0.85, 0.7]); assert.deepEqual(h.released, ['blob:test']);
});
test('HEIC is decoded before a displayable JPEG is uploaded', async () => {
  const h = harness(), file = new File(['heic'], 'iphone.heic', { type: 'image/heic' });
  const result = await h.prepare(file);
  assert.equal(result.type, 'image/jpeg'); assert.equal(h.converted[0].blob, file); assert.equal(h.converted[0].type, 'image/jpeg');
});
test('invalid, oversized and unreadable photos fail visibly and release object URLs', async () => {
  const h = harness({ decodeFailure: true });
  await assert.rejects(h.prepare(new File(['svg'], 'image.svg', { type: 'image/svg+xml' })), /Escolha uma foto/);
  await assert.rejects(h.prepare(new File([], 'empty.png', { type: 'image/png' })), /25 MB/);
  await assert.rejects(h.prepare(new File([new Uint8Array(26 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })), /25 MB/);
  await assert.rejects(h.prepare(new File(['bad'], 'image.avif', { type: 'image/avif' })), /abrir esta foto/);
  assert.deepEqual(h.released, ['blob:test']);
  await assert.rejects(harness({ heicFailure: true }).prepare(new File(['bad'], 'image.heic', { type: 'image/heic' })), /converter/);
});
