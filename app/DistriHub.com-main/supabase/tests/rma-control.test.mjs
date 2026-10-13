import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmaControlExports as api } from './fixtures/rma-control.mjs';
const rows = [
 { id:'a',product_id:'p',sale_id:'s',quantity:2,destination:'avaria',customer_name:'João',product_name:'Peça',created_at:'2026-10-13T02:00:00Z',refund_amount:20,refund_method:'pix',refunded_at:'2026-10-13T16:00:00Z' },
 { id:'b',product_id:'p',quantity:3,destination:'fornecedor',created_at:'2026-10-13T16:00:00Z',credit_amount:30,credit_used_amount:10 },
 { id:'c',quantity:1,destination:'avaliacao',created_at:'2026-10-13T16:00:00Z' },
];
const filters = {search:'',from:'',to:'',destination:'all',settlement:'all',dateBasis:'solicitacao'};
test('RMA separates units and historical, estimated and unknown costs; sums credit and refund in cents',()=>{
 const result=api.rmaControl(rows,[{id:'p',cost_price:8}],[{id:'s',cost_snapshot:{p:5}}]);
 assert.equal(result.groups.avaria.quantity,2);assert.equal(result.groups.avaria.cost,1000);
 assert.equal(result.groups.fornecedor.cost,2400);assert.equal(result.groups.fornecedor.estimated,3);
 assert.equal(result.groups.avaliacao.unknown,1);
 assert.equal(result.refunded,20);assert.equal(result.refunds.pix,20);
 assert.equal(result.credits,30);assert.equal(result.used,10);assert.equal(result.available,20);
});
test('RMA filters use Sao Paulo dates and allow refund date instead of request date',()=>{
 assert.equal(api.filterRmas(rows,{...filters,from:'2026-10-13',to:'2026-10-13'}).length,2);
 assert.equal(api.filterRmas(rows,{...filters,dateBasis:'reembolso',from:'2026-10-13'}).length,1);
 assert.equal(api.filterRmas(rows,{...filters,search:'joao',destination:'avaria',settlement:'reembolso'}).length,1);
 assert.equal(api.filterRmas(rows,{...filters,settlement:'pendente'}).length,1);
});
test('unknown credit utilization never invents an available balance and zero historical cost remains valid',()=>{
 const result=api.rmaControl([{...rows[1],sale_id:'s',credit_used_amount:null}],[{id:'p',cost_price:8}],[{id:'s',cost_snapshot:{p:0}}]);
 assert.equal(result.available,null);assert.equal(result.groups.fornecedor.cost,0);assert.equal(result.groups.fornecedor.estimated,0);
});
