import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { pdvErrorMessage } from '../lib/pdv';
import { checkoutCash, closedCashMessage, type CheckoutCashSnapshot } from '../lib/checkoutCash';
import type { CashSession } from '../lib/cashRegister';

type State = { status: 'loading' | 'open' | 'closed' | 'authorize' | 'error'; current: CashSession | null; others: CashSession[]; message: string };
export function useCheckoutCash(branchId: string, operatorId: string | null, operatorPin: string | null, operatorName: string, scope: string) {
  const [state, setState] = useState<State>({ status: 'loading', current: null, others: [], message: 'Conferindo caixa...' });
  const generation = useRef(0);
  const invalidateReads = useCallback(() => { generation.current++; }, []);
  const context = useRef({ branchId, operatorId, operatorPin, scope });
  context.current = { branchId, operatorId, operatorPin, scope };
  const needsPin = Boolean(operatorId && !operatorPin);
  const read = useCallback(async () => {
    if (!branchId) throw new Error('Selecione uma filial para conferir o caixa.');
    if (needsPin) throw new Error(`Confirme o PIN de ${operatorName} para retomar o caixa.`);
    if (!supabase) throw new Error('Conecte-se para conferir o caixa.');
    const { data, error } = await supabase.rpc('read_partner_cash_register', {
      p_branch_id: branchId, p_salesperson_id: operatorId, p_pin: operatorPin,
    });
    if (error) throw new Error(pdvErrorMessage(error));
    if (!data || typeof data.actor_key !== 'string' || !Array.isArray(data.sessions)) throw new Error('Não foi possível identificar o caixa do operador.');
    return checkoutCash(data as CheckoutCashSnapshot, branchId);
  }, [branchId, operatorId, operatorPin, operatorName, needsPin]);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setState({ status: 'loading', current: null, others: [], message: 'Conferindo caixa...' });
    try {
      const result = await read();
      if (request === generation.current) setState({ ...result, status: result.current ? 'open' : 'closed',
        message: result.current ? `Caixa aberto · ${result.current.operator_name}` : closedCashMessage(operatorName, result.others.map(session => session.operator_name)) });
      return result;
    } catch (error) {
      if (request === generation.current) setState({ status: needsPin ? 'authorize' : 'error', current: null, others: [], message: pdvErrorMessage(error) });
      throw error;
    }
  }, [read, operatorName, needsPin]);
  useEffect(() => {
    const sync = () => { void refresh().catch(() => {}); };
    const visible = () => { if (document.visibilityState === 'visible') sync(); };
    sync();
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', visible);
    return () => { invalidateReads(); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', visible); };
  }, [refresh, scope, invalidateReads]);
  const assertOpen = useCallback(async () => {
    const result = await refresh();
    if (context.current.branchId !== branchId || context.current.operatorId !== operatorId
      || context.current.operatorPin !== operatorPin || context.current.scope !== scope) {
      throw new Error('O operador ou a filial mudou durante a conferência. Confira o caixa antes de finalizar.');
    }
    if (!result.current) throw new Error(closedCashMessage(operatorName, result.others.map(session => session.operator_name)));
  }, [refresh, operatorName, branchId, operatorId, operatorPin, scope]);
  return { ...state, refresh, assertOpen };
}
