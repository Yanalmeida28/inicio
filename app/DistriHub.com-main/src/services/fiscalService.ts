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

  if (settings.id) {
    return supabase.from('fiscal_tax_rules').update(payload).eq('id', settings.id).eq('user_id', userId);
  }

  return supabase.from('fiscal_tax_rules').insert(payload);
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
    user_id: userId,
    order_id: input.order_id ?? null,
    provider: input.provider ?? null,
    document_type: input.document_type,
    status: input.status ?? 'pending',
    series: input.series ?? null,
    number: input.number ?? null,
    access_key: input.access_key ?? null,
    protocol: input.protocol ?? null,
    provider_document_id: input.provider_document_id ?? null,
    xml_url: input.xml_url ?? null,
    pdf_url: input.pdf_url ?? null,
    rejection_reason: input.rejection_reason ?? null,
    provider_response: {
      ...(input.provider_response ?? {}),
      branch_id: branchId,
    },
  };

  return supabase.from('fiscal_documents').insert(payload);
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

  return supabase
    .from('fiscal_documents')
    .update({
      status: 'cancelled',
      rejection_reason: reason ?? 'Cancelamento solicitado pelo usuário.',
      provider_response: {
        branch_id: branchId,
        cancellation_requested: true,
        cancellation_reason: reason ?? 'Cancelamento solicitado pelo usuário.',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('user_id', userId);
}
