import { useState } from 'react';
import type { PartnerCustomer } from '../../types';
import { accountBalance, accountPaid, isOverdue } from '../../lib/accounts';
import { AccountsModule } from './AccountsModule';
import { money } from '../../utils';
import type { ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof AccountsModule>, 'kind'> & { customers: PartnerCustomer[] };

export function CustomerAccountsModule({ customers, ...props }: Props) {
  const [query, setQuery] = useState('');
  const [onlyDebtors, setOnlyDebtors] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const key = (invoice: Props['invoices'][number]) => invoice.customer_id ?? `unlinked-${invoice.id}`;
  const groups = new Map<string, { id: string; name: string; customer?: PartnerCustomer; invoices: Props['invoices'] }>();
  for (const invoice of props.invoices) {
    if (invoice.status === 'cancelada') continue;
    const id = key(invoice);
    const group = groups.get(id) ?? { id, name: invoice.customer_name, customer: customers.find(c => c.id === invoice.customer_id), invoices: [] };
    group.invoices.push(invoice); groups.set(id, group);
  }
  const rows = [...groups.values()].map(group => ({ ...group,
    balance: group.invoices.reduce((sum, i) => sum + accountBalance(i), 0),
    paid: group.invoices.reduce((sum, i) => sum + accountPaid(i), 0),
    overdue: group.invoices.filter(i => isOverdue(i)).reduce((sum, i) => sum + accountBalance(i), 0),
  })).filter(g => (!onlyDebtors || g.balance > 0) && (!query.trim() || `${g.name} ${g.customer?.phone ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => b.overdue - a.overdue || b.balance - a.balance);
  const selectedGroup = selected ? groups.get(selected) : undefined;
  if (selectedGroup) return <div>
    <button type="button" className="rma-advance-btn" onClick={() => setSelected(null)}>← Voltar aos clientes</button>
    <h4>{selectedGroup.name}</h4>
    <AccountsModule {...props} kind="receber" invoices={selectedGroup.invoices} />
  </div>;
  return <section className="module-card">
    <h4 className="report-section-title">Contas de Clientes — Fiado / Crediário</h4>
    <p>Saldo das faturas por cliente na filial selecionada. Abra o cliente para consultar títulos e registrar recebimentos.</p>
    <div className="orders-filter-row" style={{ flexWrap: 'wrap', margin: '16px 0' }}>
      <input type="search" aria-label="Buscar cliente" placeholder="Nome ou telefone" value={query} onChange={e => setQuery(e.target.value)} />
      <label><input type="checkbox" checked={onlyDebtors} onChange={e => setOnlyDebtors(e.target.checked)} /> Somente clientes com saldo pendente</label>
    </div>
    <div className="stock-table-wrap"><table className="rma-table"><thead><tr><th>Cliente</th><th>Títulos</th><th>Recebido</th><th>A receber</th><th>Vencido</th><th>Limite cadastrado</th><th>Ação</th></tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={7} className="empty-row">Nenhum cliente nesta seleção.</td></tr> : rows.map(row => <tr key={row.id}>
        <td><strong>{row.name}</strong>{!row.customer && <small> · Sem cadastro vinculado</small>}</td><td>{row.invoices.length}</td>
        <td>{money.format(row.paid)}</td><td>{money.format(row.balance)}</td><td>{money.format(row.overdue)}</td><td>{row.customer ? money.format(Number(row.customer.credit_limit ?? 0)) : '—'}</td>
        <td><button type="button" className="rma-advance-btn" onClick={() => setSelected(row.id)}>Ver conta</button></td>
      </tr>)}</tbody></table></div>
  </section>;
}
