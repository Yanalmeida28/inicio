export type FiscalDocumentType = 'nfe' | 'nfce';

export function isFiscalDocumentType(value: string): value is FiscalDocumentType {
  return value === 'nfe' || value === 'nfce';
}

export function buildFiscalCancellationRpcArgs(
  documentId: string,
  documentType: FiscalDocumentType,
  branchId: string,
  reason?: string,
) {
  return {
    p_document_id: documentId,
    p_document_type: documentType,
    p_status: 'pending',
    p_document_number: null,
    p_access_key: null,
    p_payload: {
      branch_id: branchId,
      cancellation_requested: true,
      cancellation_reason: reason ?? 'Cancelamento solicitado pelo usuário.',
    },
  };
}
