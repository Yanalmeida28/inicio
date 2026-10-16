import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const read=p=>readFile(new URL('../../src/'+p,import.meta.url),'utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const gateExports={};vm.runInNewContext(compile(await read('lib/operatorConfirmation.ts')),{exports:gateExports});
const source=await read('components/PartnerPanel.tsx');
const fragment=source.slice(source.indexOf('  function invalidateOperatorConfirmation()'),source.indexOf('  const defaultSettings'));
function harness(){
 const replies=[],updates=[],errors=[];
 const c=vm.createContext({exports:{},console,Error,isEmployeeRestricted:false,identity:null,selectedOperatorId:'a',currentSalespersonId:null,effectiveBranchId:'branch',operatorPinInput:'1234',operatorConfirming:false,
 operatorConfirmation:{current:new gateExports.OperatorConfirmationGate()},operatorContextRef:{current:'company:branch'},
 partner:{salespeople:[{id:'a',branch_id:'branch'},{id:'b',branch_id:'branch'}]},
 supabase:{rpc:()=>new Promise((resolve,reject)=>replies.push({resolve,reject}))},
 setCurrentSalespersonId:v=>updates.push(v),setActiveOperatorPin(){},setSelectedBranchId(){},setShowOperatorModal(){},setOperatorPinInput(){},setSelectedOperatorId(){},setOperatorPinError:v=>{if(v)errors.push(v);},setOperatorConfirming:v=>{c.operatorConfirming=v;}});
 vm.runInContext(compile(fragment+'\nexports.confirm=handleConfirmOperator;exports.close=closeOperatorModal;exports.invalidate=invalidateOperatorConfirmation;'),c);
 return {c,replies,updates,errors};
}
const ok={data:[{salesperson_id:'a'}],error:null};
test('cancelled operator confirmation cannot apply a late success or error',async()=>{
 for(const fail of [false,true]){const h=harness(),p=h.c.exports.confirm();h.c.exports.close();fail?h.replies[0].reject(new Error('network')):h.replies[0].resolve(ok);await p;assert.deepEqual(h.updates,[]);assert.deepEqual(h.errors,[]);assert.equal(h.c.operatorConfirming,false);}
});
test('operator selection invalidates the prior request; only the new confirmation applies',async()=>{
 const h=harness(),first=h.c.exports.confirm();h.c.exports.invalidate();h.c.selectedOperatorId='b';const second=h.c.exports.confirm();h.replies[0].resolve(ok);await first;assert.deepEqual(h.updates,[]);assert.equal(h.c.operatorConfirming,true);h.replies[1].resolve(ok);await second;assert.deepEqual(h.updates,['b']);assert.equal(h.c.operatorConfirming,false);
});
test('duplicate confirmation is blocked and branch changes invalidate replies',async()=>{
 const h=harness(),first=h.c.exports.confirm();await h.c.exports.confirm();assert.equal(h.replies.length,1);h.c.operatorContextRef.current='company:other-branch';h.c.exports.invalidate();h.replies[0].resolve(ok);await first;assert.deepEqual(h.updates,[]);
});
test('current network error releases confirmation for retry',async()=>{
 const h=harness(),first=h.c.exports.confirm();h.replies[0].reject(new Error('network'));await first;assert.equal(h.c.operatorConfirming,false);assert.deepEqual(h.errors,['network']);const retry=h.c.exports.confirm();h.replies[1].resolve(ok);await retry;assert.deepEqual(h.updates,['a']);
});
test('civil birthday formatting does not shift with a browser timezone',async()=>{
 const exports={};vm.runInNewContext(compile(await read('utils.ts')),{exports,Intl,require:()=>({})});
 for(const zone of ['UTC','America/Sao_Paulo','Pacific/Auckland']){const old=process.env.TZ;process.env.TZ=zone;try{assert.equal(exports.formatCivilDate('1990-05-10'),'10/05/1990');assert.equal(exports.formatCivilDate('2024-02-29'),'29/02/2024');}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}}
});
