import { saasAccessDateForInput, type SaasSubscription } from './saas';

export type SaasAdminAction = 'manage' | 'activate' | 'suspend' | 'exempt';
export function saasAdminDraft(subscription: SaasSubscription, action: SaasAdminAction, now = new Date()): SaasSubscription {
  const draft = { ...subscription };
  if (action === 'suspend') draft.status = 'suspended';
  else if (action === 'activate') {
    draft.status = 'active';
    const hasPeriod = [draft.paid_until, draft.admin_access_until, draft.trial_ends_at]
      .some(value => value && Date.parse(value) > now.getTime());
    if (draft.billing_mode === 'paid' && !hasPeriod) {
      const end = new Date(now);
      end.setUTCDate(end.getUTCDate() + 30);
      draft.admin_access_until = `${saasAccessDateForInput(end.toISOString())}T23:59:59-03:00`;
    }
  } else if (action === 'exempt') {
    draft.billing_mode = 'exempt';
  }
  if (['past_due', 'expired', 'unavailable'].includes(draft.status)) draft.status = 'active';
  return draft;
}
export function saasAdminError(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message : 'Não foi possível salvar a configuração.';
}
