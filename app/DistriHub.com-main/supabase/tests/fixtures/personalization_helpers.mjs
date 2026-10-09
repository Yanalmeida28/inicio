import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../../node_modules/typescript/lib/typescript.js';
export const personalizationHelpers = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../../src/lib/personalization.ts', import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText,{exports:personalizationHelpers});
