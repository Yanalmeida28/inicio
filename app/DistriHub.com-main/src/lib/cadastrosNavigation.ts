export type AdminCadastrosTarget = 'produtos' | 'servicos' | 'combos' | 'importar' | 'fornecedores' | 'estoque' | 'vendedores' | 'clientes';

export function cadastroDestination(target?: AdminCadastrosTarget) {
  return {
    tab: target === 'servicos' || target === 'estoque' ? 'produtos' : target ?? 'produtos',
    productType: target === 'servicos' ? 'servico' : target === 'produtos' || target === 'estoque' ? 'produto' : 'todos',
  } as const;
}
