import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const app = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(app, 'package.json'));
const esbuild = require('esbuild');
const dir = import.meta.dirname;
const company = { id: 'client', user_id: 'owner', business_name: 'Distribuidora com nome longo para conferir no celular', email: 'contato@empresa-exemplo.test', document: '12.345.678/0001-90', whatsapp: '(11) 99999-9999', segment: 'distribuidor', subscription_plan: 'basico', subscription_status: 'active', client_status: 'aprovado', orders_count: 12, orders_total: 1200, credit_limit: 1000 };
const subscription = { company_id: 'owner', company_name: company.business_name, plan_id: 'basico', effective_plan: 'basico', billing_mode: 'paid', full_access: false, status: 'active', can_access: true, features: [], monthly_amount: 49.9, auto_renew: true, trial_ends_at: '2026-09-01T00:00:00Z', paid_until: new Date(Date.now() + 86400000).toISOString(), admin_access_until: null };
const invoices = ['paid', 'pending'].map((status, index) => ({ id: `invoice-${index}`, company_id: 'owner', company_name: company.business_name, status, amount: 49.9, period_start: '2026-10-01T12:00:00Z', period_end: '2026-11-01T12:00:00Z', paid_at: status === 'paid' ? '2026-10-10T12:00:00Z' : null, created_at: '2026-10-01T12:00:00Z' }));
const mock = `export const isSupabaseConfigured=true;
const rows={support_messages:[{id:'message',user_id:'owner',sender_role:'cliente',message:'Preciso de ajuda para usar o aplicativo',created_at:'2026-10-12T12:00:00Z'}],admin_support_states:[],saas_billing_events:[{id:'event',company_id:'owner',actor_id:'admin',action:'admin_subscription_update',details:{reason:'Liberação solicitada pelo cliente'},created_at:'2026-10-12T12:00:00Z'}]};
function query(table){let row;return {select(){return this},order(){return this},eq(){return this},range(){return this},upsert(value){row=value;rows[table]=[value];return this},single(){return Promise.resolve({data:row,error:null})},then(resolve){return Promise.resolve({data:rows[table]??[],error:null}).then(resolve)}}}
export const supabase={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null})},from:query,channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},rpc:async(name)=>({data:name==='is_super_admin'?true:name==='get_super_admin_company_overview_auth'?[${JSON.stringify(company)}]:name==='get_saas_admin_overview'?${JSON.stringify({ subscriptions: [subscription], invoices, jobs: [] })}:name==='get_super_admin_pending_summary'?{support:1,plans:1}:name==='get_super_admin_plan_requests'?[{request_id:'request',company_name:${JSON.stringify(company.business_name)},current_plan:'basico',requested_plan:'profissional',status:'pending',created_at:'2026-10-12T12:00:00Z',resolved_at:null,resolution_reason:null}]:true,error:null})};`;
await esbuild.build({ stdin: { contents: "import React from 'react';import {createRoot} from 'react-dom/client';import {AdminPanel} from './components/AdminPanel';createRoot(document.getElementById('root')).render(<AdminPanel onBack={()=>{}}/>);", resolveDir: path.join(app, 'src'), loader: 'jsx' }, outfile: path.join(dir, 'fixture.js'), bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, plugins: [{ name: 'mock-data', setup(build) { build.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'mock', namespace: 'review' })); build.onLoad({ filter: /.*/, namespace: 'review' }, () => ({ contents: mock, loader: 'js' })); } }] });
const css = (await require('postcss')([require('tailwindcss')({ content: [path.join(app, 'src/**/*.{tsx,ts}')], theme: { extend: {} } }), require('autoprefixer')]).process(await fs.readFile(path.join(app, 'src/index.css'), 'utf8'), { from: path.join(app, 'src/index.css') })).css;
const server = http.createServer(async (req, res) => {
  if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await fs.readFile(path.join(dir, 'fixture.js'))); }
  else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/fixture.js"></script></html>'); }
});
await new Promise(resolve => server.listen(4182, '127.0.0.1', resolve));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9229', `--user-data-dir=${path.join(dir, 'browser-profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let target;
  for (let attempt = 0; attempt < 50; attempt++) { try { target = (await (await fetch('http://127.0.0.1:9229/json/list')).json()).find(t => t.type === 'page'); if (target) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  if (!target) throw Error('Browser did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(); const errors = [];
  socket.addEventListener('message', event => { const result = JSON.parse(event.data); if (result.id) { const p = pending.get(result.id); pending.delete(result.id); result.error ? p.reject(result.error) : p.resolve(result.result); } else if (result.method === 'Runtime.exceptionThrown') errors.push(result.params.exceptionDetails.exception?.description ?? result.params.exceptionDetails.text); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  const results = [];
  for (const width of [320, 390, 768, 1366]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
    await send('Page.navigate', { url: 'http://127.0.0.1:4182' });
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate("!!document.querySelector('.partner-tab')")) break; await new Promise(r => setTimeout(r, 100)); }
    for (const tab of ['Visão geral', 'Gestão de Clientes', 'Financeiro SaaS', 'Faturas SaaS', 'Acesso ao aplicativo', 'Solicitações de Plano', 'Suporte', 'Histórico administrativo']) {
      await evaluate(`(()=>{const buttons=Array.from(document.querySelectorAll('.partner-tab'));const target=buttons.find(b=>b.textContent.trim()===${JSON.stringify(tab)});if(!target)throw Error('Missing tab: '+JSON.stringify(buttons.map(b=>b.textContent))+'; '+document.body.innerText);target.click()})()`); await new Promise(r => setTimeout(r, 150));
      const result = await evaluate(`({width:${width},tab:${JSON.stringify(tab)},overflow:document.documentElement.scrollWidth>innerWidth+1,content:document.querySelector('.partner-content').textContent.includes('Supabase não configurado'),cards:document.querySelector('.admin-responsive-table tr')?getComputedStyle(document.querySelector('.admin-responsive-table tr')).display:null})`);
      results.push(result);
      if (width === 390) { const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await fs.writeFile(path.join(dir, `tab-${results.length}-390.png`), Buffer.from(shot.data, 'base64')); }
    }
  }
  await fs.writeFile(path.join(dir, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  if (errors.length || results.some(r => r.overflow || r.content || (r.width < 768 && r.cards && r.cards !== 'block'))) throw Error('Browser checks failed; inspect results.json');
  console.log(`Passed ${results.length} tab/viewport checks; no runtime errors or page overflow.`);
} finally { socket?.close(); browser.kill(); await new Promise(resolve => server.close(resolve)); }
