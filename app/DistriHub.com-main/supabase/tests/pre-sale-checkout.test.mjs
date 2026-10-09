import { splitPaymentComponent } from './fixtures/split_payment_component.mjs';
import assert from 'node:assert/strict';
import { pdvHelpers } from './fixtures/pdv_helpers.mjs';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/components/partner/PreSaleCheckout.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},
}).outputText,{exports:module.exports,require(name) {
    if(name==='./SplitPaymentFields') return splitPaymentComponent;
  if(name==='react')return React;
  if(name==='react/jsx-runtime')return jsx;
  if(name==='../../utils')return {money:{format:String}};
  if(name==='../../lib/pdv')return pdvHelpers;
  return {};
}});
const sale={id:'original-pre-sale',status:'pre_venda',branch_id:'branch',customer_name:'Cliente',payment_method:'dinheiro',items:[{product_id:'p',name:'Peça',quantity:2,unit_price:25}],total:50};
const button=(view,label)=>view.root.findAllByType('button').find(node=>node.children.includes(label));
test('rescued pre-sale uses its saved method and finalizes the same ID once with the selected payment',async()=>{
  let view,resolve,closed=0;const calls=[];
  act(()=>{view=TestRenderer.create(React.createElement(module.exports.PreSaleCheckout,{
    sale,selectedBranchId:'branch',canCheckout:true,onClose:()=>closed++,
    onFinalize:(...args)=>{calls.push(args);return new Promise(done=>{resolve=done;});},
  }));});
  try{
    assert.equal(view.root.findByType('select').props.value,'dinheiro');
    act(()=>view.root.findByType('select').props.onChange({target:{value:'pix'}}));
    act(()=>{button(view,'Finalizar pré-venda').props.onClick();button(view,'Finalizar pré-venda').props.onClick();});
    assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['original-pre-sale','pix',[]]]);
    assert.equal(button(view,'Voltar ao PDV').props.disabled,true);
    await act(async()=>resolve());
    assert.equal(closed,1);
  }finally{act(()=>view.unmount());}
});
test('failed checkout retains the rescued order and changed branches block finalization',async()=>{
  let view,closed=0;
  const props={sale,selectedBranchId:'branch',canCheckout:true,onClose:()=>closed++,onFinalize:async()=>{throw new Error('Abra o caixa');}};
  act(()=>{view=TestRenderer.create(React.createElement(module.exports.PreSaleCheckout,props));});
  try{
    await act(async()=>button(view,'Finalizar pré-venda').props.onClick());
    assert.equal(view.root.findByProps({role:'alert'}).children.join(''),'Abra o caixa');
    assert.equal(closed,0);
    act(()=>view.update(React.createElement(module.exports.PreSaleCheckout,{...props,selectedBranchId:'other'})));
    assert.equal(button(view,'Finalizar pré-venda').props.disabled,true);
  }finally{act(()=>view.unmount());}
});
