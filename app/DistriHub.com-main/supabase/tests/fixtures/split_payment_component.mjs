import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../../node_modules/typescript/lib/typescript.js';
import * as jsx from 'react/jsx-runtime';
import { pdvHelpers } from './pdv_helpers.mjs';
const exports = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../../src/components/partner/SplitPaymentFields.tsx', import.meta.url),'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},
}).outputText,{exports,require(name){
  if(name==='react/jsx-runtime') return jsx;
  if(name==='../../lib/pdv') return pdvHelpers;
  if(name==='../../utils') return {money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})};
  throw Error(name);
}});
export const splitPaymentComponent = exports;
