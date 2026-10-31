import type { PartnerProduct } from '../types';

// Omit absent values so a barcode/photo-only edit preserves saved fiscal fields.
export function productFiscalPatch(product: Partial<PartnerProduct>) {
  const fields = ['ncm', 'cfop', 'cst_csosn', 'icms_rate', 'pis_rate', 'cofins_rate'] as const;
  return Object.fromEntries(fields.filter(key => product[key] !== undefined).map(key => [key, product[key]]));
}

