import type { CashSession } from './cashRegister';

export type CheckoutCashSnapshot = { actor_key: string; sessions: CashSession[] };

export function checkoutCash(snapshot: CheckoutCashSnapshot, branchId: string) {
  const open = snapshot.sessions.filter(session => session.branch_id === branchId && !session.closed_at);
  return {
    current: open.find(session => session.actor_key === snapshot.actor_key) ?? null,
    others: open.filter(session => session.actor_key !== snapshot.actor_key),
  };
}

export function closedCashMessage(operatorName: string, otherNames: string[]) {
  return otherNames.length
    ? `O caixa de ${operatorName} não está aberto nesta filial. Há caixa aberto de ${otherNames.join(', ')}. Confirme o operador desse caixa ou abra um caixa para o operador atual.`
    : `O caixa de ${operatorName} não está aberto nesta filial. Abra o caixa antes de finalizar.`;
}

export class OperatorSelectionStore {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>, private scope: string) {}
  private get key() { return `distrihub:operator-selection:${this.scope}`; }
  read(): { branchId: string; operatorId: string | null } | null {
    try {
      const value = JSON.parse(this.storage.getItem(this.key) ?? 'null');
      return value && typeof value.branchId === 'string' && (value.operatorId === null || typeof value.operatorId === 'string')
        ? { branchId: value.branchId, operatorId: value.operatorId } : null;
    } catch { return null; }
  }
  save(selection: { branchId: string; operatorId: string | null }) {
    this.storage.setItem(this.key, JSON.stringify({ branchId: selection.branchId, operatorId: selection.operatorId }));
  }
}
