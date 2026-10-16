import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { PartnerInvoice } from '../../types';
import { money } from '../../utils';
type Receipt = { id: string; amount: number; occurred_at: string };
export function InvoiceReceipts({ invoice }: { invoice: PartnerInvoice }) {
  const [receipts,setReceipts] = useState<Receipt[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [version,setVersion] = useState(0);
  useEffect(()=>{
    let current=true;
    async function load() {
      setLoading(true);setError('');setReceipts([]);
      try {
        if(!supabase) throw new Error('Banco indisponível.');
        const rows: Receipt[]=[];
        for(let offset=0;;offset+=500) {
          const {data,error}=await supabase.from('partner_invoice_receipts').select('id,amount,occurred_at').eq('invoice_id',invoice.id).eq('user_id',invoice.user_id).order('occurred_at',{ascending:false}).order('id').range(offset,offset+499);
          if(error) throw error;
          rows.push(...(data ?? []) as Receipt[]);if((data?.length ?? 0)<500) break;
        }
        if(current)setReceipts(rows);
      }catch(cause){if(current)setError(cause && typeof cause==='object' && 'message' in cause ? String(cause.message) : 'Não foi possível carregar recebimentos.');}
      finally{if(current)setLoading(false);}
    }
    void load();return()=>{current=false;};
  },[invoice.id,invoice.user_id,invoice.paid_amount,version]);
  return <div><h4>Recebimentos da fatura {invoice.number}</h4><p>Crédito de devolução: {money.format(Number(invoice.return_credit_amount ?? 0))}. Esse crédito não é entrada de dinheiro.</p>
    {loading && <p role="status">Carregando recebimentos…</p>}{error && <p role="alert">{error} <button type="button" onClick={()=>setVersion(v=>v+1)}>Tentar novamente</button></p>}
    {!loading && !error && <><p>Dinheiro recebido: {money.format(receipts.reduce((sum,r)=>sum+Number(r.amount),0))}</p><table className="rma-table directory-card-table invoice-receipts-table" aria-label="Histórico de recebimentos"><thead><tr><th>Registro</th><th>Data</th><th>Valor</th></tr></thead><tbody>{receipts.map(r=><tr key={r.id}><td data-label="Registro">{r.id.slice(0,8)}</td><td data-label="Data">{new Date(r.occurred_at).toLocaleString('pt-BR')}</td><td data-label="Valor">{money.format(r.amount)}</td></tr>)}{!receipts.length && <tr><td colSpan={3} className="empty-row">Sem recebimentos registrados.</td></tr>}</tbody></table></>}
  </div>;
}
