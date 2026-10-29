import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const read=p=>readFile(new URL('../../src/'+p,import.meta.url),'utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const source=await read('components/PartnerPanel.tsx');
const fragment=source.slice(source.indexOf('  function getOperatorContext()'),source.indexOf('  function handleSelectBranch'));

test('stale owner or PIN selections cannot impersonate an operator in authenticated account operations',()=>{
 for(const salespersonId of [null,'employee']){
  const c=vm.createContext({exports:{},identity:{salespersonId},currentSalespersonId:'other-employee',activeOperatorPin:'1234',selectedOperatorId:'owner'});
  vm.runInContext(compile(fragment+'\nexports.getContext=getOperatorContext;'),c);
  const result=c.exports.getContext();
  assert.equal(result.operatorId,null);assert.equal(result.operatorPin,null);
 }
});

test('civil birthday formatting does not shift with a browser timezone',async()=>{
 const exports={};vm.runInNewContext(compile(await read('utils.ts')),{exports,Intl,require:()=>({})});
 for(const zone of ['UTC','America/Sao_Paulo','Pacific/Auckland']){const old=process.env.TZ;process.env.TZ=zone;try{assert.equal(exports.formatCivilDate('1990-05-10'),'10/05/1990');assert.equal(exports.formatCivilDate('2024-02-29'),'29/02/2024');}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}}
});
