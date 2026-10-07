import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { PayableAccount } from '../lib/accounts';

export function usePayables(userId?: string) {
  const [accounts, setAccounts] = useState<PayableAccount[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const request = ++revision.current;
    setLoading(true);
    setError('');
    if (!supabase || !userId) {
      setError('Conecte a loja para consultar Contas a Pagar.');
      setAccounts([]);
      setLoading(false);
      return false;
    }
    const all: PayableAccount[] = [];
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (request !== revision.current) return false;
    if (authError || auth.user?.id !== userId) {
      setError('Contas a Pagar são administradas pelo proprietário da loja.');
      setAccounts([]); setLoading(false); return false;
    }
    for (let offset = 0; ; offset += 500) {
      const result = await supabase.from('partner_payables').select('*').eq('user_id', userId)
        .order('due_date').order('id').range(offset, offset + 499);
      if (request !== revision.current) return false;
      if (result.error) {
        setError('Não foi possível carregar Contas a Pagar. ' + result.error.message);
        setAccounts([]);
        setLoading(false);
        return false;
      }
      all.push(...result.data as PayableAccount[]);
      if (result.data.length < 500) break;
    }
    if (request === revision.current) { setAccounts(all); setLoading(false); }
    return request === revision.current;
  }, [userId]);
  const invalidate = useCallback(() => { revision.current++; }, []);
  useEffect(() => { setAccounts([]); void load(); return invalidate; }, [load, invalidate]);

  const create = async (account: Omit<PayableAccount, 'id' | 'user_id' | 'paid_amount' | 'status' | 'created_at'>, id: string) => {
    if (!supabase || !userId) throw new Error('Loja não conectada.');
    const { error: failure } = await supabase.rpc('create_partner_payable', { p_id: id, p_branch_id: account.branch_id,
      p_supplier_id: account.supplier_id, p_description: account.description, p_creditor_name: account.creditor_name,
      p_category: account.category, p_amount: account.amount, p_due_date: account.due_date });
    if (failure) throw new Error(failure.message);
    if (!await load()) throw new Error('Cadastro confirmado, mas a consulta falhou. Tente novamente para atualizar; o mesmo cadastro será reutilizado.');
  };
  const pay = async (id: string, amount: number, paymentId: string) => {
    if (!supabase) throw new Error('Loja não conectada.');
    const { error: failure } = await supabase.rpc('record_partner_payable_payment', { p_payable_id: id, p_amount: amount, p_payment_id: paymentId });
    if (failure) throw new Error(failure.message);
    if (!await load()) throw new Error('Pagamento confirmado, mas a consulta falhou. Tente novamente para atualizar; o mesmo pagamento será reutilizado.');
  };
  return { accounts, loading, error, reload: load, create, pay };
}
