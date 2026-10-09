import { useCallback, useEffect, useRef, useState } from 'react';
import { Wallet, Printer, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isDefinitiveSaleRejection, pdvErrorMessage } from '../../lib/pdv';
import { CashRequestStore, cashAmount, cashPaymentLabels, cashTotals, printCashReport, type CashMovement, type CashRequest, type CashSession } from '../../lib/cashRegister';
import { money } from '../../utils';
import type { PartnerSale, PartnerSalesperson } from '../../types';

type Props = {
  branchId: string;
  branchName: string;
  scopeKey: string;
  sales: PartnerSale[];
  operatorId: string | null;
  operatorPin: string | null;
  salespeople: PartnerSalesperson[];
};

export function CashRegisterModule({ branchId, branchName, scopeKey, sales, operatorId, operatorPin, salespeople }: Props) {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [opening, setOpening] = useState('0');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'sangria' | 'suprimento'>('sangria');
  const [reason, setReason] = useState('');
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [refundSaleId, setRefundSaleId] = useState('');
  const [refundMethod, setRefundMethod] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<CashRequest | null>(null);
  const [actorKey, setActorKey] = useState('');
  const inFlight = useRef(false);
  const generation = useRef(0);
  const context = useRef({ branchId, operatorId, operatorPin, scopeKey });
  context.current = { branchId, operatorId, operatorPin, scopeKey };
  const invalidateReads = useCallback(() => { generation.current++; }, []);

  const refresh = useCallback(async () => {
    if (!supabase) throw new Error('Conecte-se para usar o controle de caixa.');
    const request = ++generation.current;
    const { data, error } = await supabase.rpc('read_partner_cash_register', {
      p_branch_id: branchId, p_salesperson_id: operatorId, p_pin: operatorPin,
    });
    if (error) throw error;
    if (request === generation.current) {
      setSessions(data.sessions ?? []);
      setMovements(data.movements ?? []);
      setActorKey(data.actor_key);
    }
  }, [branchId, operatorId, operatorPin]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setNotice(null); setSessions([]); setMovements([]);
    setSelectedId(''); setSupervisorPin(''); setCounted(''); setNotes('');
    try { setPending(new CashRequestStore(sessionStorage, scopeKey).read()); }
    catch (e) { setError(pdvErrorMessage(e)); setLoading(false); return; }
    if (!branchId) { setLoading(false); return; }
    void refresh().catch(e => { if (active) setError(pdvErrorMessage(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; invalidateReads(); };
  }, [branchId, operatorId, operatorPin, scopeKey, refresh, invalidateReads]);

  const current = sessions.find(s => !s.closed_at && s.actor_key === actorKey);
  const otherOpenSessions = sessions.filter(s => !s.closed_at && s.actor_key !== actorKey);
  const selected = sessions.find(s => s.id === selectedId) ?? current ?? sessions[0];
  const selectedMovements = movements.filter(m => m.session_id === selected?.id);
  const totals = selected?.closing_totals ?? cashTotals(selectedMovements);
  const expected = selected ? Math.round((Number(selected.opening_amount) + (totals.dinheiro ?? 0)) * 100) / 100 : 0;
  const managers = salespeople.filter(p => p.is_active && ['administrador', 'gerente'].includes(p.role));
  const originalSaleMovements = movements.filter(movement => movement.kind === 'venda');
  const eligiblePayments = (saleId: string) => originalSaleMovements.filter(original =>
    original.sale_id === saleId && ['dinheiro', 'pix', 'cartao'].includes(original.payment_method) &&
    sessions.some(session => session.id === original.session_id && session.closed_at));
  const paymentRemaining = (original: CashMovement) => Math.round((Number(original.amount) - movements
    .filter(movement => movement.sale_id === original.sale_id && movement.payment_method === original.payment_method && ['devolucao', 'estorno'].includes(movement.kind))
    .reduce((sum, movement) => sum + Number(movement.amount), 0)) * 100) / 100;
  const refundableSales = sales.filter(sale => sale.branch_id === branchId && sale.status === 'concluida' &&
    eligiblePayments(sale.id).some(original => paymentRemaining(original) > 0));
  const selectedRefundSale = refundableSales.find(sale => sale.id === refundSaleId);
  const refundPayments = selectedRefundSale ? eligiblePayments(selectedRefundSale.id).filter(original => paymentRemaining(original) > 0) : [];
  const refundOriginal = refundPayments.find(original => original.payment_method === refundMethod) ?? refundPayments[0];
  const refundRemaining = refundOriginal ? paymentRemaining(refundOriginal) : 0;

  async function mutate(action: 'abrir' | 'movimentar' | 'fechar' | 'devolver', recovery = false) {
    if (!supabase || inFlight.current) return;
    const startedContext = context.current;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    const store = new CashRequestStore(sessionStorage, scopeKey);
    try {
      const previous = store.read();
      if (previous && !recovery) throw new Error('Confirme a operação pendente antes de registrar outra movimentação.');
      const request: CashRequest | null = recovery ? previous : {
        id: crypto.randomUUID(), action, sessionId: action === 'abrir' ? null : current?.id ?? null,
        saleId: action === 'devolver' ? refundSaleId : null,
        paymentMethod: action === 'devolver' ? refundOriginal?.payment_method ?? null : null,
        amount: cashAmount(action === 'abrir' ? opening : action === 'fechar' ? counted : action === 'devolver' ? refundAmount : amount),
        kind: action === 'devolver' ? 'dinheiro' : kind,
        reason: action === 'fechar' ? notes.trim() : action === 'devolver' ? refundReason.trim() : reason.trim(),
      };
      if (!request) throw new Error('Nenhuma operação pendente.');
      if (request.action === 'movimentar' && (!request.reason || request.amount <= 0)) throw new Error('Informe um valor maior que zero e o motivo da movimentação.');
      if (request.action === 'devolver') {
        if (!request.saleId || !request.reason || request.amount <= 0) {
          throw new Error('A solicitação de devolução pendente está incompleta.');
        }
        if (!recovery && (!selectedRefundSale || !refundOriginal ||
          !['dinheiro', 'pix', 'cartao'].includes(refundOriginal.payment_method) ||
          request.amount > refundRemaining)) {
          throw new Error('Selecione uma venda elegível e informe um valor dentro do saldo disponível.');
        }
      }
      store.save(request); setPending(request);
      const { error } = request.action === 'devolver'
        ? await supabase.rpc('record_partner_cash_refund', {
          p_branch_id: branchId,
          p_salesperson_id: operatorId,
          p_pin: operatorPin,
          p_session_id: request.sessionId,
          p_sale_id: request.saleId,
          p_refund_method: request.paymentMethod ?? null,
          p_amount: request.amount,
          p_reason: request.reason,
          p_supervisor_id: supervisorId || null,
          p_supervisor_pin: supervisorPin || null,
          p_request_id: request.id,
        })
        : await supabase.rpc('mutate_partner_cash_register', {
          p_action: request.action, p_branch_id: branchId, p_salesperson_id: operatorId, p_pin: operatorPin,
          p_session_id: request.sessionId,
          p_amount: request.amount, p_kind: request.kind, p_reason: request.reason,
          p_supervisor_id: supervisorId || null, p_supervisor_pin: supervisorPin || null,
          p_request_id: request.id,
        });
      if (error) {
        if (!previous && isDefinitiveSaleRejection(error.code ?? '')) { store.clear(); setPending(null); }
        throw error;
      }
      store.clear();
      if (context.current !== startedContext && (context.current.scopeKey !== scopeKey || context.current.branchId !== branchId || context.current.operatorId !== operatorId || context.current.operatorPin !== operatorPin)) return;
      setPending(null);
      setNotice(request.action === 'abrir' ? 'Caixa aberto.' : request.action === 'fechar' ? 'Caixa fechado. O relatório está no histórico.' : request.action === 'devolver' ? 'Devolução financeira registrada nesta sessão.' : 'Movimentação registrada.');
      setAmount(''); setReason(''); setCounted(''); setNotes(''); setSupervisorPin(''); setSelectedId('');
      if (request.action === 'devolver') { setRefundSaleId(''); setRefundMethod(''); setRefundAmount(''); setRefundReason(''); }
      try { await refresh(); } catch (e) { setError('Operação confirmada, mas a atualização falhou. Clique em Atualizar. ' + pdvErrorMessage(e)); }
    } catch (e) { setError(pdvErrorMessage(e)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  function authorization() {
    return <div className="cash-fields">
      <label>Responsável (gerente ou administrador)<select value={supervisorId} onChange={e => setSupervisorId(e.target.value)} disabled={busy}>
        <option value="">Operador atual, se autorizado</option>
        {managers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <label>PIN do responsável<input type="password" autoComplete="off" value={supervisorPin} onChange={e => setSupervisorPin(e.target.value)} disabled={busy} /></label>
    </div>;
  }

  if (!branchId) return <div className="panel-module"><h3>Caixa</h3><p>Selecione uma filial para abrir ou consultar o caixa.</p></div>;
  return <div className="panel-module cash-module">
    <div className="module-header"><span className="module-icon"><Wallet size={20} /></span><div><h3>Caixa</h3><p>{branchName} · Abertura, movimentações e fechamento por operador</p></div></div>
    <button type="button" className="rma-advance-btn" disabled={busy || loading} onClick={async () => {
      setLoading(true); setError(null);
      try { await refresh(); } catch (e) { setError(pdvErrorMessage(e)); } finally { setLoading(false); }
    }}><RefreshCw size={14} /> Atualizar</button>
    {error && <p className="otp-error-msg" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {pending && <section className="cash-card"><p>Há uma operação com resultado ainda não confirmado: {pending.action} · {money.format(pending.amount)}. Confirme antes de iniciar outra operação.</p>
      {authorization()}<button className="module-submit-btn" disabled={busy || loading} onClick={() => void mutate(pending.action, true)}>Confirmar operação pendente</button>
    </section>}
    {loading ? <p>Carregando caixa...</p> : <>
      {!current && !error && otherOpenSessions.length > 0 && <p role="status">Os caixas abertos de {otherOpenSessions.map(session => session.operator_name).join(', ')} pertencem a outros operadores. Para finalizar vendas, confirme o operador correspondente ou abra o seu próprio caixa nesta filial.</p>}
      {!current && !error && <section className="cash-card"><h4>Abrir caixa</h4><p>Informe o dinheiro disponível para troco. Pré-vendas não entram no saldo até serem finalizadas.</p>
        <form onSubmit={e => { e.preventDefault(); void mutate('abrir'); }} className="cash-fields">
          <label>Troco inicial (R$)<input inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} disabled={busy} required /></label>
          <button className="module-submit-btn" disabled={busy}>{busy ? 'Aguarde...' : 'Abrir caixa'}</button>
        </form>
      </section>}
      {current && <section className="cash-card"><h4>Caixa aberto · {current.operator_name}</h4><p>Aberto em {new Date(current.opened_at).toLocaleString('pt-BR')}</p>
        <form onSubmit={e => { e.preventDefault(); void mutate('movimentar'); }}>
          <h4>Registrar movimentação</h4><div className="cash-fields">
            <label>Tipo<select value={kind} onChange={e => setKind(e.target.value as typeof kind)} disabled={busy}><option value="sangria">Sangria (retirada)</option><option value="suprimento">Suprimento (entrada)</option></select></label>
            <label>Valor (R$)<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required disabled={busy} /></label>
            <label>Motivo<input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} required disabled={busy} /></label>
          </div>{kind === 'sangria' && authorization()}<button className="module-submit-btn" disabled={busy}>Registrar</button>
        </form>
        <form onSubmit={e => { e.preventDefault(); void mutate('devolver'); }}>
          <h4>Registrar devolução financeira</h4>
          <p>A devolução fica vinculada à venda original e à sessão aberta. O caixa já fechado permanece imutável. Vendas faturadas e devoluções de estoque precisam do fluxo correspondente.</p>
          <div className="cash-fields">
            <label>Venda<select value={refundSaleId} onChange={e => { setRefundSaleId(e.target.value); setRefundMethod(''); setRefundAmount(''); }} required disabled={busy}>
              <option value="">Selecione uma venda elegível</option>
              {refundableSales.map(sale => {
                const remaining = eligiblePayments(sale.id).reduce((sum, original) => sum + paymentRemaining(original), 0);
                return <option key={sale.id} value={sale.id}>#{sale.id.slice(0, 8).toUpperCase()} · {money.format(remaining)} restantes</option>;
              })}
            </select></label>
            {selectedRefundSale && refundOriginal && <>
              <label>Forma da devolução<select value={refundOriginal.payment_method} onChange={e => { setRefundMethod(e.target.value); setRefundAmount(''); }} disabled={busy}>
                {refundPayments.map(original => <option key={original.payment_method} value={original.payment_method}>{cashPaymentLabels[original.payment_method] ?? original.payment_method} · {money.format(paymentRemaining(original))} disponíveis</option>)}
              </select></label>
              <label>Valor da devolução (máx. {money.format(refundRemaining)})<input inputMode="decimal" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} required disabled={busy} /></label>
              <label>Motivo<input value={refundReason} onChange={e => setRefundReason(e.target.value)} maxLength={500} required disabled={busy} /></label>
              <p>Forma de saída: {cashPaymentLabels[refundOriginal.payment_method] ?? refundOriginal.payment_method} (mesma forma da venda).</p>
            </>}
          </div>
          {authorization()}
          <button className="module-submit-btn" disabled={busy || !selectedRefundSale || !refundAmount || !refundReason.trim()}>Registrar devolução</button>
        </form>
        <form onSubmit={e => { e.preventDefault(); void mutate('fechar'); }}>
          <h4>Fechar caixa</h4><p>Dinheiro esperado: <strong>{money.format(Number(current.opening_amount) + (cashTotals(movements.filter(m => m.session_id === current.id)).dinheiro ?? 0))}</strong></p>
          <div className="cash-fields"><label>Dinheiro contado (R$)<input inputMode="decimal" value={counted} onChange={e => setCounted(e.target.value)} required disabled={busy} /></label>
            <label>Observação / justificativa da diferença<input value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} disabled={busy} /></label></div>
          <p>Fechamentos com diferença exigem justificativa e autorização de gerente ou administrador.</p>{authorization()}
          <button className="module-submit-btn" disabled={busy}>Confirmar fechamento</button>
        </form>
      </section>}
      <section className="cash-card"><h4>Histórico e relatório</h4><label>Caixa<select value={selected?.id ?? ''} onChange={e => setSelectedId(e.target.value)}>
        {!sessions.length && <option value="">Nenhum caixa registrado</option>}
        {sessions.map(s => <option key={s.id} value={s.id}>{new Date(s.opened_at).toLocaleString('pt-BR')} · {s.operator_name} · {s.closed_at ? 'Fechado' : 'Aberto'}</option>)}
      </select></label>
      {selected && <>
        {selected.actor_key !== actorKey && <p>Consulta do caixa de {selected.operator_name}. Selecionar este relatório não troca o operador nem o caixa usado nas vendas.</p>}
        <div className="cash-summary"><div><small>Troco inicial</small><strong>{money.format(selected.opening_amount)}</strong></div>
          {Object.entries(totals).map(([key, value]) => <div key={key}><small>{cashPaymentLabels[key] ?? key} · líquido</small><strong>{money.format(value)}</strong></div>)}
          <div><small>Dinheiro esperado</small><strong>{money.format(selected.expected_amount ?? expected)}</strong></div>
          {selected.closed_at && <><div><small>Dinheiro contado</small><strong>{money.format(selected.counted_amount ?? 0)}</strong></div><div><small>Diferença</small><strong>{money.format(selected.difference ?? 0)}</strong></div></>}
        </div>
        <p>O líquido em dinheiro inclui sangrias e suprimentos. Faturado é valor a receber e não compõe o dinheiro do caixa.</p>
        <button className="rma-advance-btn" onClick={() => { try { printCashReport(selected, selectedMovements, branchName); } catch (e) { setError(pdvErrorMessage(e)); } }}><Printer size={14} /> Imprimir relatório</button>
        <div className="stock-table-wrap"><table className="rma-table"><thead><tr><th>Data</th><th>Tipo</th><th>Pagamento</th><th>Valor</th><th>Motivo / pedido</th></tr></thead><tbody>
          {selectedMovements.length ? selectedMovements.map(m => <tr key={m.id}><td>{new Date(m.created_at).toLocaleString('pt-BR')}</td><td>{m.kind}</td><td>{cashPaymentLabels[m.payment_method] ?? m.payment_method}</td><td>{money.format(m.amount)}</td><td>{m.reason}{m.sale_id && ` · #${m.sale_id.slice(0, 8).toUpperCase()}`}</td></tr>) : <tr><td colSpan={5}>Nenhuma movimentação.</td></tr>}
        </tbody></table></div>
      </>}
      </section>
    </>}
  </div>;
}
