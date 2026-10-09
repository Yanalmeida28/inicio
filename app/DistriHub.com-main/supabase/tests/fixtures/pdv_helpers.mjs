import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../../node_modules/typescript/lib/typescript.js';
export const pdvHelpers = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../../src/lib/pdv.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: pdvHelpers });
