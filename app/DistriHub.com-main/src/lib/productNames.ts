import type { PartnerProduct } from '../types';

export function normalizeProductName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function findProductNameDuplicates(
  products: PartnerProduct[],
  name: string,
  companyId: string,
  branchId: string,
  excludeProductId?: string,
): PartnerProduct[] {
  const normalizedName = normalizeProductName(name);
  if (!normalizedName) return [];

  return products.filter((product) =>
    product.id !== excludeProductId &&
    product.user_id === companyId &&
    product.branch_id === branchId &&
    normalizeProductName(product.name) === normalizedName,
  );
}
