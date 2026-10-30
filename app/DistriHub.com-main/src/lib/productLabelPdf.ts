import {productLabelLayout,type LabelProduct,type ProductLabelSize} from './productLabelPrint';
import {money} from '../utils';

export async function createProductLabelPdf(product:LabelProduct,size:ProductLabelSize,codeUrl:string){
 const layout=productLabelLayout(size,codeUrl);
 if(!codeUrl.startsWith('data:image/svg+xml;charset=utf-8,'))throw new Error('Código inválido. Gere a etiqueta novamente.');
 const svg=new DOMParser().parseFromString(decodeURIComponent(codeUrl.slice(codeUrl.indexOf(',')+1)),'image/svg+xml');
 if(svg.querySelector('parsererror')||svg.documentElement.localName!=='svg')throw new Error('Código inválido. Gere a etiqueta novamente.');
 const view=svg.documentElement.getAttribute('viewBox')?.trim().split(/\s+/).map(Number);
 if(!view||view.length!==4||view.some(n=>!Number.isFinite(n))||view[0]!==0||view[1]!==0||view[2]<=0||view[3]<=0)throw new Error('Medidas do código inválidas.');
 const rectangles=Array.from(svg.getElementsByTagName('rect')).filter(rect=>['#000','#000000'].includes(rect.getAttribute('fill')??'')).map(rect=>{
  const [x,y,w,h]=['x','y','width','height'].map(name=>Number(rect.getAttribute(name)));
  if(![x,y,w,h].every(Number.isFinite)||x<0||y<0||w<=0||h<=0||x+w>view[2]||y+h>view[3])throw new Error('Desenho do código inválido.');
  return {x,y,w,h};
 });
 if(!rectangles.length)throw new Error('Código vazio. Gere a etiqueta novamente.');
 const {jsPDF}=await import('jspdf');
 const pdf=new jsPDF({unit:'mm',format:[size.width,size.height],orientation:size.width>size.height?'landscape':'portrait',compress:true,putOnlyUsedFonts:true});
 pdf.setProperties({title:'Etiqueta do produto'});
 pdf.setDisplayMode('original','single');
 pdf.setFillColor(0,0,0);
 for(const rect of rectangles)pdf.rect(layout.imageX+rect.x/view[2]*layout.imageWidth,layout.imageY+rect.y/view[3]*layout.imageHeight,rect.w/view[2]*layout.imageWidth,rect.h/view[3]*layout.imageHeight,'F');
 const code=product.barcode?.trim()||product.sku?.trim()||'';
 const groups:{lines:string[];font:'normal'|'bold';size:number;lineHeight:number}[]=[];
 function group(text:string,font:'normal'|'bold',fontSize:number,maxLines?:number){
  pdf.setFont('helvetica',font);pdf.setFontSize(fontSize);
  let lines=pdf.splitTextToSize(text,layout.textWidth) as string[];
  if(maxLines&&lines.length>maxLines){
   lines=lines.slice(0,maxLines);
   let last=lines[maxLines-1];
   while(last&&pdf.getTextWidth(last+'...')>layout.textWidth)last=last.slice(0,-1);
   lines[maxLines-1]=last+'...';
  }
  groups.push({lines,font,size:fontSize,lineHeight:fontSize*25.4/72*1.15});
 }
 group(product.name,'bold',size.width<45?7.5:9,3);
 group(layout.barcode||product.barcode?.trim()?'Código: '+code:'SKU: '+(product.sku?.trim()||'—'),'normal',6.75);
 if(size.showPrice!==false)group(money.format(product.sale_price),'bold',size.width<45?9:12);
 const height=groups.reduce((total,g)=>total+g.lines.length*g.lineHeight,0)+groups.length-1;
 if(height>layout.textHeight)throw new Error('As informações não cabem nesta etiqueta. Escolha papel maior ou retire o preço.');
 let y=layout.textY+(layout.textHeight-height)/2;
 pdf.setTextColor(0,0,0);
 for(const g of groups){
  pdf.setFont('helvetica',g.font);pdf.setFontSize(g.size);
  for(const line of g.lines){
   pdf.text(line,layout.stacked?layout.textX+layout.textWidth/2:layout.textX,y,{align:layout.stacked?'center':'left',baseline:'top'});
   y+=g.lineHeight;
  }
  y+=1;
 }
 return pdf;
}
