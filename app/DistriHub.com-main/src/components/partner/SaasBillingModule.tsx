import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { mercadoPagoCheckoutUrl, saasInvoiceLabels, saasStatusLabels } from '../../lib/saas';
import { useSaasSubscription } from '../../hooks/useSaasSubscription';
import { money } from '../../utils';

const date = (value: string | null) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
export function SaasBillingModule({ companyId, onChanged }: { companyId: string; onChanged?: () => void }) {
  const { subscription, error, loading, refresh } = useSaasSubscription(companyId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  async function checkout() {
    if (!supabase || busy) return;
    setBusy(true); setMessage(null);
    try {
      const { data, error: checkoutError } = await supabase.functions.invoke('saas-checkout', { body: {} });
      if (checkoutError) {
        if (checkoutError.context instanceof Response) {
          const details = await checkoutError.context.json().catch(() => null);
          throw new Error(details?.error ?? 'Não foi possível abrir o checkout.');
        }
        throw checkoutError;
      }
      const url = mercadoPagoCheckoutUrl(data?.checkoutUrl);
      if (!url) throw new Error(data?.error ?? 'Checkout indisponível. Tente atualizar a assinatura.');
      window.location.assign(url);
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Não foi possível abrir o pagamento.'); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!supabase || busy) return;
    setBusy(true); setMessage(null);
    try {
      const { error: cancelError } = await supabase.rpc('cancel_saas_renewal', { p_company_id: companyId });
      if (cancelError) throw cancelError;
      setCancelConfirm(false);
      setMessage('Renovação cancelada. O período já pago permanece disponível; o cancelamento no Mercado Pago será processado.');
      await refresh(); onChanged?.();
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Falha ao cancelar.'); }
    finally { setBusy(false); }
  }
  return <section className="module-card subscription-card" aria-label="Cobrança da assinatura">
    <h3>Assinatura DistriHub</h3>
    {loading && <p role="status">Verificando assinatura...</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {subscription && <>
      <p><strong>{saasStatusLabels[subscription.status]}</strong> · Plano {subscription.effective_plan}</p>
      <div className="subscription-details-grid">
        <p>{subscription.billing_mode === 'exempt' ? 'Conta isenta de cobrança' : `${money.format(subscription.monthly_amount)}/mês`}</p>
        {subscription.status === 'trial' && <p>Teste até: {date(subscription.trial_ends_at)}</p>}
        {subscription.paid_until && <p>Período pago até: {date(subscription.paid_until)}</p>}
        {subscription.billing_mode === 'paid' && <p>Próxima cobrança: {date(subscription.next_billing_at)}</p>}
        {subscription.admin_access_until && <p>Acesso liberado até: {date(subscription.admin_access_until)}</p>}
      </div>
      {subscription.provider_cancel_pending && <p role="status">Cancelamento no Mercado Pago em processamento.</p>}
      <div className="subscription-actions">
        {subscription.billing_mode === 'paid' && subscription.status !== 'suspended' && !subscription.provider_cancel_pending &&
          <button className="module-submit-btn" disabled={busy} onClick={checkout}>{busy ? 'Aguarde...' : subscription.provider_status === 'authorized' ? 'Consultar pagamento no Mercado Pago' : 'Assinar com Mercado Pago'}</button>}
        {subscription.auto_renew && <button className="rma-advance-btn" disabled={busy} onClick={() => setCancelConfirm(true)}>Cancelar renovação</button>}
        <button className="rma-advance-btn" disabled={busy || loading} onClick={() => { void refresh(); onChanged?.(); }}>Atualizar assinatura</button>
      </div>
      {cancelConfirm && <div className="module-card">
        <p>Cancelar as próximas cobranças? O acesso permanece até o fim do período contratado.</p>
        <button className="rma-advance-btn" disabled={busy} onClick={cancel}>Confirmar cancelamento</button>
        <button className="rma-advance-btn" disabled={busy} onClick={() => setCancelConfirm(false)}>Voltar</button>
      </div>}
      {!!subscription.invoices?.length && <div className="stock-table-wrap"><table className="rma-table">
        <thead><tr><th>Período</th><th>Valor</th><th>Status</th><th>Pagamento</th></tr></thead>
        <tbody>{subscription.invoices.map(invoice => <tr key={invoice.id}>
          <td>{date(invoice.period_start)} a {date(invoice.period_end)}</td><td>{money.format(invoice.amount)}</td>
          <td>{saasInvoiceLabels[invoice.status]}</td><td>{date(invoice.paid_at)}</td>
        </tr>)}</tbody>
      </table></div>}
    </>}
  </section>;
}
