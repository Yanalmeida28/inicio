export const planCatalog = {
  basico: { name: 'Básico', price: 49.90, branches: 1, devices: 3, extraBranchPrice: 0 },
  profissional: { name: 'Profissional', price: 129.90, branches: 3, devices: 5, extraBranchPrice: 0 },
  enterprise: { name: 'Enterprise', price: 249.90, branches: 5, devices: 8, extraBranchPrice: 39.90 },
} as const;
