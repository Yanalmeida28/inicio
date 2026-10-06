import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import TestRenderer, { act } from 'react-test-renderer';
import { PGlite } from '@electric-sql/pglite';
import ts from '../../node_modules/typescript/lib/typescript.js';

const migration = await readFile(new URL('../migrations/20261006165722_link_rma_sale_items_and_stock.sql', import.meta.url), 'utf8');
const owner = '00000000-0000-0000-0000-000000000001';
const branch = '00000000-0000-0000-0000-000000000002';
const product = '00000000-0000-0000-0000-000000000003';
const sale = '00000000-0000-0000-0000-000000000004';
const customer = '00000000-0000-0000-0000-000000000005';
const foreign = '00000000-0000-0000-0000-000000000006';
const legacy = '00000000-0000-0000-0000-000000000007';

test('RMA links the sold item, enforces quantity, restores stock exactly once and preserves finance', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT COALESCE(NULLIF(current_setting('test.actor',true),''),'${owner}')::uuid $$;
      CREATE TABLE partner_branches(id uuid PRIMARY KEY,user_id uuid);
      CREATE TABLE partner_products(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,name text,sku text,stock integer,is_service boolean,updated_at timestamptz);
      CREATE TABLE partner_sales(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,customer_id uuid,customer_name text,items jsonb,status text,total numeric);
      CREATE TABLE stock_movements(user_id uuid,product_id uuid,product_name text,type text,quantity integer,reason text,branch_id uuid);
      CREATE TABLE rma_requests_v2(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,product_name text,product_sku text,batch_or_order text,defect_description text,status text DEFAULT 'aguardando_troca');
      ALTER TABLE rma_requests_v2 ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION partner_employee_can_access_branch(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE FUNCTION resolve_partner_pdv_operator(uuid,text,uuid) RETURNS TABLE(company_id uuid,salesperson_id uuid,role text,branch_id uuid) LANGUAGE plpgsql AS $$ BEGIN
        IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
        RETURN QUERY SELECT auth.uid(),NULL::uuid,'administrador'::text,$3;
      END $$;
      INSERT INTO partner_branches VALUES('${branch}','${owner}');
      INSERT INTO partner_products VALUES('${product}','${owner}','${branch}','Peça','SKU',4,false,now());
      INSERT INTO partner_sales VALUES('${sale}','${owner}','${branch}','${customer}','Cliente',
        '[{"product_id":"${product}","name":"Peça","quantity":3,"unit_price":20}]','concluida',60);
      INSERT INTO rma_requests_v2(id,user_id,product_name,product_sku,batch_or_order,status) VALUES
        ('${legacy}','${owner}','Peça','SKU','Venda #${sale}','reintegrado_estoque');`);
    await db.exec(migration);
    const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
    assert.equal((await one('SELECT sale_id FROM rma_requests_v2 WHERE id=$1',[legacy])).sale_id,sale);
    assert.equal((await one('SELECT stock FROM partner_products')).stock,4, 'backfill must not replay old stock');
    const insert = async (quantity=1, overrides={}) => (await one(`INSERT INTO rma_requests_v2(user_id,branch_id,sale_id,sale_item_index,product_id,customer_id,quantity,product_name,product_sku,batch_or_order)
      VALUES($1,$2,$3,$4,$5,$6,$7,'forged name','forged sku','forged reference') RETURNING *`,
      [overrides.owner ?? owner,overrides.branch ?? branch,overrides.sale ?? sale,overrides.index ?? 0,overrides.product ?? product,overrides.customer ?? customer,quantity]));
    const rma = await insert();
    assert.equal(rma.product_name,'Peça');
    assert.equal(rma.batch_or_order,`Venda #${sale}`);
    assert.equal(rma.customer_name,'Cliente');
    await assert.rejects(insert(2),/Quantidade devolvida excede/);
    await assert.rejects(insert(1,{index:2}),/Produto nao pertence/);
    await assert.rejects(insert(1,{customer:foreign}),/Venda invalida/);
    await assert.rejects(insert(1,{owner:foreign}),/Empresa ou filial/);
    await assert.rejects(db.query("UPDATE rma_requests_v2 SET stock_restored_at=now() WHERE id=$1",[rma.id]),/nao podem ser alterados/);
    await assert.rejects(db.query("UPDATE rma_requests_v2 SET quantity=2 WHERE id=$1",[rma.id]),/nao podem ser alterados/);
    await assert.rejects(db.query("UPDATE rma_requests_v2 SET status='reintegrado_estoque' WHERE id=$1",[rma.id]),/Transicao/);
    await db.query("UPDATE rma_requests_v2 SET status='retornou_fornecedor' WHERE id=$1",[rma.id]);
    await db.exec(`CREATE FUNCTION reject_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'movimento indisponivel'; END $$;
      CREATE TRIGGER fail_movement BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION reject_movement();`);
    await assert.rejects(db.query("UPDATE rma_requests_v2 SET status='reintegrado_estoque' WHERE id=$1",[rma.id]),/movimento indisponivel/);
    assert.equal((await one('SELECT stock FROM partner_products')).stock,4,'stock and status must roll back together');
    assert.equal((await one('SELECT status FROM rma_requests_v2 WHERE id=$1',[rma.id])).status,'retornou_fornecedor');
    await db.exec('DROP TRIGGER fail_movement ON stock_movements');
    await db.query("UPDATE rma_requests_v2 SET status='reintegrado_estoque' WHERE id=$1",[rma.id]);
    assert.equal((await one('SELECT stock FROM partner_products')).stock,5);
    assert.ok((await one('SELECT stock_restored_at FROM rma_requests_v2 WHERE id=$1',[rma.id])).stock_restored_at);
    await db.query("UPDATE rma_requests_v2 SET status='reintegrado_estoque' WHERE id=$1",[rma.id]);
    await db.query("UPDATE rma_requests_v2 SET status='credito_gerado' WHERE id=$1",[rma.id]);
    assert.equal((await one('SELECT stock FROM partner_products')).stock,5);
    assert.equal((await one('SELECT count(*)::int AS count FROM stock_movements')).count,1);
    assert.equal((await one('SELECT total FROM partner_sales')).total,'60');
    assert.equal((await one('SELECT status FROM partner_sales')).status,'concluida');
    await assert.rejects(db.query("UPDATE partner_sales SET status='cancelada' WHERE id=$1",[sale]),/Venda com devolucao/);
    await assert.rejects(db.query('DELETE FROM partner_sales WHERE id=$1',[sale]),/Venda com devolucao/);
    await assert.rejects(db.query('DELETE FROM rma_requests_v2 WHERE id=$1',[rma.id]),/permanecer no historico/);
    await assert.rejects(db.query("UPDATE rma_requests_v2 SET status='retornou_fornecedor' WHERE id=$1",[rma.id]),/Transicao/);
    const manual = await one(`INSERT INTO rma_requests_v2(user_id,branch_id,product_id,quantity,product_name,product_sku,batch_or_order)
      VALUES($1,$2,$3,2,'Peça','SKU','Manual') RETURNING id`,[owner,branch,product]);
    await db.query("UPDATE rma_requests_v2 SET status='retornou_fornecedor' WHERE id=$1",[manual.id]);
    await db.query("UPDATE rma_requests_v2 SET status='reintegrado_estoque' WHERE id=$1",[manual.id]);
    assert.equal((await one('SELECT stock FROM partner_products')).stock,7);
    await db.exec(`SET test.actor='${foreign}'`);
    await assert.rejects(db.query("UPDATE rma_requests_v2 SET status='credito_gerado' WHERE id=$1",[rma.id]),/Empresa ou filial/);
  } finally { await db.close(); }
});

const helperModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/lib/saleReturns.ts',import.meta.url),'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText,{ exports: helperModule.exports });
test('customer history identifies partial and complete returns without matching names or another company', () => {
  const s = { id:'sale',user_id:'owner',items:[{name:'Peça',quantity:3},{name:'Outra',quantity:1}] };
  const returns = [{ sale_id:'sale',user_id:'owner',sale_item_index:0,quantity:2 }];
  assert.equal(helperModule.exports.saleReturnLabel(s,returns),'Devolução parcial');
  assert.match(helperModule.exports.saleItemDescription(s,returns),/Peça \(3\) — 2 devolvido/);
  returns.push({sale_id:'sale',user_id:'owner',sale_item_index:0,quantity:1},{sale_id:'sale',user_id:'owner',sale_item_index:1,quantity:1});
  assert.equal(helperModule.exports.saleReturnLabel(s,returns),'Devolução total');
  assert.equal(helperModule.exports.saleReturnLabel(s,[{...returns[0],user_id:'foreign'}]),'');
  assert.equal(helperModule.exports.saleReturnLabel(s,[{product_name:'Peça',quantity:3}]),'');
});

test('return form submits the item identity and quantity, bounds remaining units and retains a failed draft', async () => {
  const component = { exports:{} };
  vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/components/partner/RmaModule.tsx',import.meta.url),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},
  }).outputText, { exports:component.exports, require(name) {
    if(name==='react') return React;
    if(name==='react/jsx-runtime') return jsx;
    if(name==='lucide-react') return new Proxy({}, {get:()=>()=>null});
    if(name==='../../lib/saleReturns') return helperModule.exports;
    if(name==='../../utils') return {money:{format:String}};
    if(name==='../../data') return {rmaStatusLabels:{aguardando_troca:'Aguardando Troca'},rmaStatusColors:{},rmaStatusFlow:['aguardando_troca','retornou_fornecedor','reintegrado_estoque','credito_gerado']};
    return {};
  }});
  const calls=[];
  let fail=true;
  let view;
  act(()=>{view=TestRenderer.create(React.createElement(component.exports.RmaModule, {
    customers:[{id:customer,name:'Cliente'}],products:[{id:product,name:'Peça',sku:'SKU',is_service:false}],
    sales:[{id:sale,user_id:owner,customer_id:customer,status:'concluida',created_at:new Date().toISOString(),total:60,items:[{product_id:product,name:'Peça',quantity:3}]}],
    rmaRequests:[{id:legacy,user_id:owner,sale_id:sale,sale_item_index:0,quantity:1,product_name:'Peça',status:'aguardando_troca'}],
    walletBalance:0,warrantyTerms:'',currentRole:'administrador',
    onCreate:async payload=>{calls.push(payload);if(fail)throw new Error('Falha de conexão');},onUpdateStatus:async()=>{},onDelete:async()=>{},
  }));});
  try {
    act(()=>view.root.findByProps({className:'module-action-btn'}).props.onClick());
    act(()=>view.root.findByProps({placeholder:'Digite nome, documento ou telefone'}).props.onChange({target:{value:'Cliente'}}));
    act(()=>view.root.findByProps({role:'option'}).props.onClick());
    act(()=>view.root.findByType('form').findAllByType('select')[0].props.onChange({target:{value:sale}}));
    act(()=>view.root.findByType('form').findAllByType('select')[1].props.onChange({target:{value:'0'}}));
    act(()=>view.root.findByType('textarea').props.onChange({target:{value:'Defeito'}}));
    const quantity=()=>view.root.findByProps({type:'number'});
    assert.equal(quantity().props.max,2);
    act(()=>quantity().props.onChange({target:{value:'3'}}));
    await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
    assert.equal(calls.length,0);
    act(()=>quantity().props.onChange({target:{value:'2'}}));
    await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
    assert.equal(calls.length,1);
    assert.equal(calls[0].sale_id,sale);
    assert.equal(calls[0].sale_item_index,0);
    assert.equal(calls[0].product_id,product);
    assert.equal(calls[0].customer_id,customer);
    assert.equal(calls[0].quantity,2);
    assert.match(JSON.stringify(view.toJSON()),/Falha de conexão/);
    assert.equal(view.root.findByType('textarea').props.value,'Defeito');
    fail=false;
    await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
    assert.equal(view.root.findAllByType('form').length,0);
  } finally {act(()=>view.unmount());}
});
