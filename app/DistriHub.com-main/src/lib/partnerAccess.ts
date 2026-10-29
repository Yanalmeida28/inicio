import type { User } from '@supabase/supabase-js';
import type { PartnerIdentity, SalespersonRole } from '../types';
import { supabase } from './supabase';

export type PinOperator = {
  id: string; name: string; branchId: string; role: SalespersonRole; pin: string;
};
export type PartnerAccess = { kind: 'owner' } | { kind: 'employee'; operator: PinOperator };
const roles = ['administrador', 'gerente', 'caixa', 'vendedor', 'tecnico', 'atendente', 'logistica'];

export async function authorizePin(identity: PartnerIdentity, id: string, name: string, pin: string): Promise<PartnerAccess> {
  if (!supabase || !id || !/^\d{4,8}$/.test(pin)) throw new Error('Selecione o colaborador e informe o PIN de 4 a 8 dígitos.');
  const { data, error } = await supabase.rpc('resolve_partner_pdv_operator', {
    p_salesperson_id: id, p_pin: pin, p_requested_branch_id: null,
  });
  const operator = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (error || !operator || operator.salesperson_id !== id || operator.company_id !== identity.companyUserId
    || typeof operator.branch_id !== 'string' || !operator.branch_id || !roles.includes(operator.role)) {
    throw new Error('PIN incorreto ou colaborador sem acesso a uma filial.');
  }
  if (identity.salespersonId && (identity.salespersonId !== id || identity.branchId !== operator.branch_id)) {
    throw new Error('Este acesso pertence a outro colaborador.');
  }
  return { kind: 'employee', operator: { id, name, pin, branchId: operator.branch_id, role: operator.role } };
}

export async function authorizeOwner(identity: PartnerIdentity, user: User | null, password: string): Promise<PartnerAccess> {
  if (!user?.email || identity.salespersonId || identity.authUserId !== identity.companyUserId
    || user.id !== identity.companyUserId || !password) throw new Error('Confirme a senha da conta do proprietário.');
  if (!supabase) throw new Error('Serviço indisponível.');
  const { data, error } = await supabase.rpc('verify_partner_owner_password', { p_password: password });
  if (error || data !== true) throw new Error('Senha da Área do proprietário incorreta ou acesso temporariamente bloqueado por tentativas.');
  return { kind: 'owner' };
}
