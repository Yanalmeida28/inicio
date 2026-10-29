# Administradores sem filial principal — decisão do proprietário

Auditoria de produção (somente leitura): 9 colaboradores, 6 filiais, **2 administradores com `branch_id` NULL**
(1 ativo, 1 inativo).

## Efeito da migration `20261028180000`

- Nenhum registro é alterado, excluído ou recebe filial automaticamente.
- `resolve_partner_operator` rejeita esses administradores ("Funcionário sem filial principal válida"):
  eles não operam PDV, caixa, produtos, clientes ou vendas.
- `partner_salesperson_has_branch_access` e `partner_operator_can_use_branch` retornam falso para eles.
- O administrador **ativo** perde a capacidade de operar até decisão do proprietário. O inativo não é afetado.
- Registros históricos (vendas, estoque, financeiro) permanecem intactos.

## Decisão necessária (por administrador)

Consultar (somente leitura):

```sql
SELECT id, user_id, name, active, role FROM public.partner_salespeople
WHERE role = 'administrador' AND branch_id IS NULL ORDER BY active DESC, name;
```

Para cada um, o proprietário escolhe **uma** opção:

1. Definir a filial principal (edição pelo app, com PIN do proprietário).
2. Conceder acesso a filiais específicas ou geral, com `set_partner_admin_branch_access` (somente após definir a filial principal).
3. Manter inativo / desligar.

Nenhuma dessas ações é executada automaticamente.
