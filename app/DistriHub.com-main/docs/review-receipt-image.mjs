import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, 'docs/receipt-image-review');
await fs.mkdir(output, { recursive: true });
const server = await createServer({ root: app, server: { host: '127.0.0.1', port: 5187, strictPort: true }, plugins: [{ name: 'review-page', configureServer(server) {
  server.middlewares.use('/receipt-review', (request, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><title>Receipt review</title></head><body></body></html>'); });
} } ] });
await server.listen();
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9237',`--user-data-dir=${path.join(output,'browser-profile')}`,'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let target;
  for(let attempt=0;attempt<60;attempt++) {
    try { target=(await(await fetch('http://127.0.0.1:9237/json/list')).json()).find(page=>page.type==='page');if(target)break; } catch {}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!target)throw Error('Headless browser did not start');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  let id=0;const pending=new Map();
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const request=pending.get(message.id);pending.delete(message.id);message.error?request.reject(message.error):request.resolve(message.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;};
  await send('Page.enable');await send('Page.navigate',{url:'http://127.0.0.1:5187/receipt-review'});
  for(let attempt=0;attempt<50;attempt++){if(await evaluate('location.pathname==="/receipt-review" && document.readyState==="complete"'))break;await new Promise(resolve=>setTimeout(resolve,100));}
  const result=await evaluate(`(async()=>{
    const {printSale,directReceiptEnabled}=await import('/src/lib/salePrint.ts');
    const {savePrinter}=await import('/src/lib/directPrint.ts');
    const originalFetch=window.fetch;let version=2;let posts=[];let opened=0;
    window.open=()=>{opened++;throw Error('Unexpected print dialog');};
    window.fetch=async(url,options)=>{
      if(String(url).startsWith('http://localhost:17891')) {
        if(options.method==='GET')return new Response(JSON.stringify({version,capabilities:version===2?['receipt-png-v1']:[],printers:['Mock printer']}),{status:200});
        posts.push(JSON.parse(options.body));return new Response(JSON.stringify({status:'queued'}),{status:200});
      }
      return originalFetch(url,options);
    };
    const logo=document.createElement('canvas');logo.width=100;logo.height=40;const logoContext=logo.getContext('2d');logoContext.fillStyle='#ff0000';logoContext.fillRect(0,0,100,40);
    const results=[];
    for(const width of ['58','80'])for(const font of [10,16]){
      savePrinter({name:'Mock printer',width,mode:'image'});
      const sale={id:'review',sale_number:1,branch_id:'branch',created_at:'2026-10-15T12:00:00Z',customer_name:'Cliente de exemplo',items:Array.from({length:font===16?45:2},(_,index)=>({product_id:'sample-'+index,name:'Produto de exemplo '+index,quantity:1,unit_price:100})),total:font===16?4500:200,freight_fee:15,payment_method:'pix',status:'concluida'};
      const details={companyName:'Saunier Atacado',companyAddress:'Rua de exemplo, 100',salespersonName:'Equipe',settings:{show_logo_on_receipt:true,logo_url:logo.toDataURL(),show_cnpj_on_receipt:true,receipt_footer_text:'Rodape personalizado\\nSegunda linha',personalization:{receipt:{paper_width:width,font_size:font,header_text:'Cabecalho personalizado'}}}};
      const first=printSale(sale,'receipt',details);const second=printSale(sale,'receipt',details);
      if(first!==second)throw Error('Concurrent image generation was not deduplicated');
      const before=posts.length;await first;if(posts.length!==before+1)throw Error('Expected one print job');
      const job=posts.at(-1);const image=new Image();image.src='data:image/png;base64,'+job.png;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,image.width,image.height).data;let red=0,ink=0;
      for(let i=0;i<pixels.length;i+=4){if(pixels[i]>200&&pixels[i+1]<60&&pixels[i+2]<60)red++;if(pixels[i]<180&&pixels[i+1]<180&&pixels[i+2]<180)ink++;}
      if(red<100||ink<500)throw Error('Missing logo or receipt content');
      if(job.pixelWidth!==Math.ceil(Number(width)/25.4*203)||job.pixelWidth!==image.width||job.pixelHeight!==image.height)throw Error('Incorrect raster dimensions');
      results.push({width,font,height:image.height,red,ink,png:job.png});
    }
    const count=posts.length;version=1;let blocked=false;
    try{await printSale({id:'old',items:[],total:0,branch_id:null,created_at:'2026-10-15T12:00:00Z'},'receipt',{settings:{personalization:{receipt:{paper_width:'80'}}}});}catch(error){blocked=error.message.includes('Atualize');}
    if(!blocked||posts.length!==count)throw Error('Old connector was not blocked');
    if(opened||document.querySelector('iframe'))throw Error('Popup or iframe leak');
    return {results,opened,oldConnectorBlocked:blocked};
  })()`);
  for(const item of result.results){await fs.writeFile(path.join(output,`receipt-${item.width}-${item.font}.png`),Buffer.from(item.png,'base64'));delete item.png;}
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally { socket?.close();browser.kill();await server.close(); }
