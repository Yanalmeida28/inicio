import { supabase } from '../lib/supabase';

export type FiscalDocumentType = 'nfe' | 'nfce';
export type FiscalDocumentStatus = 'pending' | 'processing' | 'authorized' | 'rejected' | 'cancelled';

export type FiscalSettingsRecord = {
  id?: string;
  user_id?: string;
  name: string;
  ncm?: string | null;
  cfop?: string | null;
  cst_csosn?: string | null;
  icms_rate?: number;
  pis_rate?: number;
  cofins_rate?: number;
  active?: boolean;
  branch_id?: string | null;
  created_at?: string;
};

export type FiscalDocumentRecord = {
  id?: string;
  user_id?: string;
  order_id?: string | null;
  provider?: string | null;
  document_type?: FiscalDocumentType | string;
  status?: FiscalDocumentStatus | string;
  series?: string | null;
  number?: string | null;
  access_key?: string | null;
  protocol?: string | null;
  provider_document_id?: string | null;
  xml_url?: string | null;
  pdf_url?: string | null;
  rejection_reason?: string | null;
  provider_response?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  branch_id?: string | null;
};

function assertBranchSelected(branchId: string | null | undefined) {
  if (!branchId) {
    throw new Error('Selecione uma filial para continuar.');
  }
}

export async function getFiscalSettings(userId: string, branchId: string | null | undefined) {
  assertBranchSelected(branchId);

  if (!supabase) {
    return { data: [] as FiscalSettingsRecord[], error: null };
  }

  return supabase
    .from('fiscal_tax_rules')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

export async function saveFiscalSettings(
  userId: string,
  branchId: string | null | undefined,
  settings: Partial<FiscalSettingsRecord>,
) {
  assertBranchSelected(branchId);

  if (!supabase) {
    return { data: null, error: null };
  }

  const payload = {
    user_id: userId,
    branch_id: branchId,
    ...settings,
  };

  return supabase.rpc('save_fiscal_branch_settings', { p_settings: payload });
}

export async function listFiscalDocuments(userId: string, branchId: string | null | undefined) {
  assertBranchSelected(branchId);

  if (!supabase) {
    return { data: [] as FiscalDocumentRecord[], error: null };
  }

  return supabase
    .from('fiscal_documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

export async function getFiscalDocument(userId: string, documentId: string, branchId: string | null | undefined) {
  assertBranchSelected(branchId);

  if (!supabase) {
    return { data: null, error: null };
  }

  return supabase
    .from('fiscal_documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();
}

export async function createFiscalDocument(
  userId: string,
  branchId: string | null | undefined,
  input: Partial<FiscalDocumentRecord> & { document_type: FiscalDocumentType; status?: FiscalDocumentStatus | string; },
) {
  assertBranchSelected(branchId);

  if (!supabase) {
    return { data: null, error: null };
  }

  const payload = {
    p_user_id: userId,
    p_branch_id: branchId,
    p_document_id: input.id ?? null,
    p_order_id: input.order_id ?? null,
    p_provider: input.provider ?? null,
    p_document_type: input.document_type,
    p_status: input.status ?? 'pending',
    p_series: input.series ?? null,
    p_number: input.number ?? null,
    p_access_key: input.access_key ?? null,
    p_protocol: input.protocol ?? null,
    p_provider_document_id: input.provider_document_id ?? null,
    p_xml_url: input.xml_url ?? null,
    p_pdf_url: input.pdf_url ?? null,
    p_rejection_reason: input.rejection_reason ?? null,
    p_provider_response: {
      ...(input.provider_response ?? {}),
      branch_id: branchId,
    },
  };

  return supabase.rpc('record_fiscal_document', payload);
}

export async function getFiscalEvents(userId: string, branchId: string | null | undefined) {
  assertBranchSelected(branchId);

  if (!supabase) {
    return { data: [] as FiscalDocumentRecord[], error: null };
  }

  const { data, error } = await supabase
    .from('fiscal_documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error };
  }

  return {
    data: (data ?? []).filter((document) => {
      const providerResponse = (document.provider_response ?? {}) as Record<string, unknown> | null;
      const documentBranchId = providerResponse?.branch_id;
      return documentBranchId === branchId || !documentBranchId;
    }),
    error: null,
  };
}

export async function requestFiscalCancellation(
  userId: string,
  documentId: string,
  branchId: string | null | undefined,
  reason?: string,
) {
  assertBranchSelected(branchId);

  if (!supabase) {
    return { data: null, error: null };
  }

  return supabase.rpc('record_fiscal_document', {
    p_user_id: userId,
    p_branch_id: branchId,
    p_document_id: documentId,
    p_status: 'cancelled',
    p_rejection_reason: reason ?? 'Cancelamento solicitado pelo usuário.',
    p_provider_response: {
      branch_id: branchId,
      cancellation_requested: true,
      cancellation_reason: reason ?? 'Cancelamento solicitado pelo usuário.',
    },
  });
}
