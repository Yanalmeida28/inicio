import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const source=ts.transpileModule(await readFile(new URL('../../src/lib/appUpdateSession.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const session={user:{id:'user'},access_token:'synthetic-access',refresh_token:'synthetic-refresh'};
function harness({stored=JSON.stringify(session),read=async()=>({data:{session},error:null}),storageError=false}={}){
 const api={};let value=stored,reads=0;
 vm.runInNewContext(source,{exports:api,Error,localStorage:{getItem:key=>{assert.equal(key,'distrihub-auth');if(storageError)throw Error('storage blocked');return value;}},
  require:()=>({AUTH_STORAGE_KEY:'distrihub-auth',supabase:{auth:{getSession:()=>{reads++;return read();},signOut(){throw Error('Logout is forbidden');},setSession(){throw Error('Token copying is forbidden');}}}})});
 return {...api,setStored:v=>{value=v;},get reads(){return reads;}};
}
test('update waits for SDK recovery and checks that the latest session is persisted',async()=>{
 let finish;const h=harness({read:()=>new Promise(resolve=>{finish=resolve;})});
 let done=false;const pending=h.prepareAppUpdate().then(()=>{done=true;});
 await Promise.resolve();assert.equal(done,false);
 const renewed={...session,access_token:'renewed-access',refresh_token:'renewed-refresh'};
 h.setStored(JSON.stringify(renewed));finish({data:{session:renewed},error:null});
 await pending;assert.equal(done,true);assert.equal(h.reads,1);
});
test('network failure, missing persistence, stale tokens and account switches refuse reload without copying credentials',async()=>{
 for(const stored of [null,'invalid','{}',JSON.stringify({...session,user:{id:'other'}}),JSON.stringify({...session,access_token:'old'})]){
  await assert.rejects(harness({stored}).prepareAppUpdate(),/salvo/);
 }
 await assert.rejects(harness({read:async()=>({data:{session:null},error:Error('offline')})}).prepareAppUpdate(),/conexão/);
 await assert.rejects(harness({read:async()=>({data:{session:null},error:null})}).prepareAppUpdate(),/recuperar/);
 await assert.rejects(harness({storageError:true}).prepareAppUpdate(),/armazenamento/);
 await harness({stored:null,read:async()=>({data:{session:null},error:null})}).prepareAppUpdate();
 await assert.rejects(harness({stored:null,read:async()=>({data:{session:null},error:null})}).prepareAppUpdate('user'),/recuperar/);
 await assert.rejects(harness().prepareAppUpdate('other-user'),/salvo/);
});
