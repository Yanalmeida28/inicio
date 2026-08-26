import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  FileText, Building2, User, Package, Calculator, Receipt, FileCheck,
  Check, AlertCircle, IdCard, Printer, Mail, MessageCircle, Save,
} from 'lucide-react';
import type { PartnerProduct, PartnerSale, PartnerCustomer, PartnerProfile, SalespersonRole } from '../../types';
import { money } from '../../utils';

type Props = {
  products: PartnerProduct[];
  sales: PartnerSale[];
  customers: PartnerCustomer[];
  profile: PartnerProfile | null;
  currentRole: SalespersonRole;
};

type DocType = 'pf' | 'pj';
type FiscalTab = 'cupom' | 'nota';
type EmitType = 'nfce' | 'nfe';
type DispatchMethod = 'printer' | 'email' | 'whatsapp';

const cashierRoles: SalespersonRole[] = ['administrador', 'gerente', 'caixa'];

function maskCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskCpf(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function detectDocType(doc: string | null | undefined): DocType {
  const d = (doc ?? '').replace(/\D/g, '');
  return d.length <= 11 ? 'pf' : 'pj';
}

export function FiscalModule({ products, sales, customers, profile, currentRole }: Props) {
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [emitResult, setEmitResult] = useState<{ type: EmitType; success: boolean } | null>(null);
  const [fiscalTab, setFiscalTab] = useState<FiscalTab>('cupom');
  const [emitType, setEmitType] = useState<EmitType>('nfce');
  const [showEmitModal, setShowEmitModal] = useState(false);

  // Company fiscal state
  const [companyDocType, setCompanyDocType] = useState<DocType>('pj');
  const [companyCnpj, setCompanyCnpj] = useState(profile?.document ?? '');
  const [companyIe, setCompanyIe] = useState('');
  const [companyIeIsento, setCompanyIeIsento] = useState(false);
  const [companyAddress, setCompanyAddress] = useState('');

  // Customer fiscal state (auto-populated from sale selection)
  const [customerDocType, setCustomerDocType] = useState<DocType>('pf');
  const [customerDoc, setCustomerDoc] = useState('');
  const [customerRg, setCustomerRg] = useState('');
  const [customerIe, setCustomerIe] = useState('');
  const [customerIeIsento, setCustomerIeIsento] = useState(false);
  const [customerAddress, setCustomerAddress] = useState('');

  // Emit modal form state
  const [emitCustomerName, setEmitCustomerName] = useState('');
  const [emitObservations, setEmitObservations] = useState('');
  const [emitFinalidade, setEmitFinalidade] = useState('1');
  const [emitPresenca, setEmitPresenca] = useState('1');
  const [emitTipoCliente, setEmitTipoCliente] = useState('1');
  const [emitSerie, setEmitSerie] = useState('001');
  const [emitNumero, setEmitNumero] = useState('');
  const [emitCscId, setEmitCscId] = useState('');
  const [emitCscNumber, setEmitCscNumber] = useState('');

  // Dispatch methods — multiple selection, default to printer
  const [dispatchMethods, setDispatchMethods] = useState<Set<DispatchMethod>>(new Set(['printer']));
  const [dispatchEmail, setDispatchEmail] = useState('');
  const [dispatchPhone, setDispatchPhone] = useState('');

  const canEmit = cashierRoles.includes(currentRole);
  const completedSales = useMemo(() => sales.filter((s) => s.status === 'concluida'), [sales]);

  const selectedSale = completedSales.find((s) => s.id === selectedSaleId);
  const selectedCustomer = customers.find((c) => c.id === selectedSale?.customer_id);

  function toggleDispatchMethod(method: DispatchMethod) {
    setDispatchMethods((prev) => {
      const next = new Set(prev);
      if (next.has(method)) {
        if (next.size > 1) next.delete(method);
      } else {
        next.add(method);
      }
      return next;
    });
  }

  function handleSaleSelect(saleId: string) {
    setSelectedSaleId(saleId);
    const sale = completedSales.find((s) => s.id === saleId);
    if (!sale) return;
    const customer = customers.find((c) => c.id === sale.customer_id);
    if (customer) {
      const dtype = detectDocType(customer.document);
      setCustomerDocType(dtype);
      setCustomerDoc(customer.document ?? '');
      setCustomerAddress(customer.address ?? '');
      setCustomerRg('');
      setCustomerIe('');
      setCustomerIeIsento(dtype === 'pj');
      setEmitCustomerName(customer.name ?? '');
      setDispatchEmail(customer.email ?? '');
      setDispatchPhone(customer.phone ?? '');
    } else {
      setCustomerDoc('');
      setCustomerAddress('');
      setCustomerRg('');
      setCustomerIe('');
      setCustomerIeIsento(false);
      setEmitCustomerName('');
      setDispatchEmail('');
      setDispatchPhone('');
    }
  }

  // Keyboard shortcuts: F8=printer, F9=email, F10=whatsapp
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!selectedSale || !canEmit) return;
    // Don't intercept if focus is in an input/select/textarea
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'F8') { e.preventDefault(); toggleDispatchMethod('printer'); }
    else if (e.key === 'F9') { e.preventDefault(); toggleDispatchMethod('email'); }
    else if (e.key === 'F10') { e.preventDefault(); toggleDispatchMethod('whatsapp'); }
  }, [selectedSale, canEmit]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const fiscalItems = useMemo(() => {
    if (!selectedSale) return [];
    return selectedSale.items.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      const icmsRate = product?.icms_rate ?? 0;
      const pisRate = product?.pis_rate ?? 0;
      const cofinsRate = product?.cofins_rate ?? 0;
      const lineTotal = item.unit_price * item.quantity;
      return {
        ...item,
        ncm: product?.ncm ?? '—',
        cfop: product?.cfop ?? '5102',
        cst_csosn: product?.cst_csosn ?? '102',
        icmsRate,
        pisRate,
        cofinsRate,
        icmsValue: (lineTotal * icmsRate) / 100,
        pisValue: (lineTotal * pisRate) / 100,
        cofinsValue: (lineTotal * cofinsRate) / 100,
      };
    });
  }, [selectedSale, products]);

  const totals = useMemo(() => {
    const subtotal = fiscalItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const icms = fiscalItems.reduce((s, i) => s + i.icmsValue, 0);
    const pis = fiscalItems.reduce((s, i) => s + i.pisValue, 0);
    const cofins = fiscalItems.reduce((s, i) => s + i.cofinsValue, 0);
    return { subtotal, icms, pis, cofins, total: subtotal };
  }, [fiscalItems]);

  function openEmitModal(type: EmitType) {
    if (!selectedSale || !canEmit) return;
    setEmitType(type);
    setFiscalTab(type === 'nfce' ? 'cupom' : 'nota');
    setShowEmitModal(true);
  }

  function handleEmit() {
    if (!selectedSale || !canEmit) return;
    setEmitResult({ type: emitType, success: true });
    setShowEmitModal(false);
    setTimeout(() => setEmitResult(null), 3500);
  }

  const dispatchOptions: { id: DispatchMethod; label: string; shortcut: string; icon: typeof Printer }[] = [
    { id: 'printer', label: 'Impressora', shortcut: 'F8', icon: Printer },
    { id: 'email', label: 'E-Mail', shortcut: 'F9', icon: Mail },
    { id: 'whatsapp', label: 'WhatsApp', shortcut: 'F10', icon: MessageCircle },
  ];

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><FileText size={20} /></span>
        <div>
          <h3>Emissão de Nota Fiscal — NF-e / NFC-e</h3>
          <p>Gestão fiscal completa com cálculo de impostos e emissão de documentos</p>
        </div>
      </div>

      {/* Company Fiscal Details */}
      <div className="section-divider">
        <span className="section-divider-label"><Building2 size={14} /> Dados Fiscais da Empresa</span>
      </div>

      <div className="module-card">
        <div className="rma-form">
          <div className="fiscal-doctype-toggle">
            <button type="button" className={`price-toggle-btn ${companyDocType === 'pj' ? 'active' : ''}`} onClick={() => setCompanyDocType('pj')}>
              <Building2 size={15} /> Pessoa Jurídica (PJ)
            </button>
            <button type="button" className={`price-toggle-btn ${companyDocType === 'pf' ? 'active' : ''}`} onClick={() => setCompanyDocType('pf')}>
              <User size={15} /> Pessoa Física (PF)
            </button>
          </div>
          <div className="form-row">
            <label>
              <span className="social-label">
                {companyDocType === 'pj' ? <Building2 size={14} /> : <IdCard size={14} />}
                {' '}{companyDocType === 'pj' ? 'CNPJ' : 'CPF'}
              </span>
              <input
                value={companyDocType === 'pj' ? maskCnpj(companyCnpj) : maskCpf(companyCnpj)}
                onChange={(e) => setCompanyCnpj(e.target.value.replace(/\D/g, ''))}
                placeholder={companyDocType === 'pj' ? '00.000.000/0000-00' : '000.000.000-00'}
              />
            </label>
            {companyDocType === 'pj' ? (
              <label>
                <span className="social-label"><FileText size={14} /> Inscrição Estadual</span>
                <input
                  value={companyIeIsento ? 'ISENTO' : companyIe}
                  onChange={(e) => { if (!companyIeIsento) setCompanyIe(e.target.value); }}
                  placeholder="000.000.000.000"
                  disabled={companyIeIsento}
                />
              </label>
            ) : (
              <label>
                <span className="social-label"><IdCard size={14} /> RG (opcional)</span>
                <input value={customerRg} onChange={(e) => setCustomerRg(e.target.value)} placeholder="00.000.000-0" />
              </label>
            )}
          </div>
          {companyDocType === 'pj' && (
            <label className="checkbox-label fiscal-isento-label">
              <input type="checkbox" checked={companyIeIsento} onChange={(e) => setCompanyIeIsento(e.target.checked)} />
              Isento de Inscrição Estadual
            </label>
          )}
          <label>
            <span className="social-label"><Building2 size={14} /> Endereço Completo</span>
            <input value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder="Rua, número, bairro, cidade, UF, CEP" />
          </label>
        </div>
      </div>

      {/* Sale Selection + Dispatch Options */}
      <div className="section-divider">
        <span className="section-divider-label"><Receipt size={14} /> Selecionar Venda para Emissão</span>
      </div>

      <div className="fiscal-sale-dispatch-grid">
        <div className="module-card">
          <label>
            <span className="social-label"><Receipt size={14} /> Venda Concluída</span>
            <select value={selectedSaleId} onChange={(e) => handleSaleSelect(e.target.value)}>
              <option value="">Selecione uma venda...</option>
              {completedSales.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id.slice(0, 8).toUpperCase()} — {s.customer_name ?? 'Cliente'} — {money.format(s.total)} — {new Date(s.created_at).toLocaleDateString('pt-BR')}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Forma de Emissão e Envio */}
        <div className="module-card fiscal-dispatch-card">
          <span className="social-label"><Printer size={14} /> Forma de Emissão e Envio</span>
          <div className="fiscal-dispatch-options">
            {dispatchOptions.map(({ id, label, shortcut, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`fiscal-dispatch-toggle ${dispatchMethods.has(id) ? 'active' : ''}`}
                onClick={() => toggleDispatchMethod(id)}
                disabled={!selectedSale}
              >
                <Icon size={16} />
                <strong>{shortcut}</strong>
                <span>{label}</span>
                {dispatchMethods.has(id) && <Check size={13} className="dispatch-check" />}
              </button>
            ))}
          </div>
          {dispatchMethods.has('email') && selectedSale && (
            <label className="fiscal-dispatch-input">
              <span className="social-label"><Mail size={14} /> E-mail do Destinatário</span>
              <input type="email" value={dispatchEmail} onChange={(e) => setDispatchEmail(e.target.value)} placeholder="cliente@email.com" />
            </label>
          )}
          {dispatchMethods.has('whatsapp') && selectedSale && (
            <label className="fiscal-dispatch-input">
              <span className="social-label"><MessageCircle size={14} /> WhatsApp do Destinatário</span>
              <input value={dispatchPhone} onChange={(e) => setDispatchPhone(e.target.value)} placeholder="(92) 99999-9999" />
            </label>
          )}
          {!selectedSale && (
            <small className="fiscal-dispatch-hint">Selecione uma venda para definir a forma de envio.</small>
          )}
        </div>
      </div>

      {/* Customer Fiscal Details */}
      {selectedSale && (
        <>
          <div className="section-divider">
            <span className="section-divider-label"><User size={14} /> Dados Fiscais do Cliente</span>
          </div>

          <div className="module-card">
            <div className="rma-form">
              <div className="fiscal-doctype-toggle">
                <button type="button" className={`price-toggle-btn ${customerDocType === 'pf' ? 'active' : ''}`} onClick={() => setCustomerDocType('pf')}>
                  <User size={15} /> Pessoa Física (PF)
                </button>
                <button type="button" className={`price-toggle-btn ${customerDocType === 'pj' ? 'active' : ''}`} onClick={() => setCustomerDocType('pj')}>
                  <Building2 size={15} /> Pessoa Jurídica (PJ)
                </button>
              </div>
              <div className="form-row">
                <label>
                  <span className="social-label"><User size={14} /> Nome / Razão Social</span>
                  <input value={selectedSale.customer_name ?? selectedCustomer?.name ?? ''} readOnly />
                </label>
                <label>
                  <span className="social-label">
                    {customerDocType === 'pj' ? <Building2 size={14} /> : <IdCard size={14} />}
                    {' '}{customerDocType === 'pj' ? 'CNPJ' : 'CPF'}
                  </span>
                  <input
                    value={customerDocType === 'pj' ? maskCnpj(customerDoc) : maskCpf(customerDoc)}
                    onChange={(e) => setCustomerDoc(e.target.value.replace(/\D/g, ''))}
                    placeholder={customerDocType === 'pj' ? '00.000.000/0000-00' : '000.000.000-00'}
                  />
                </label>
              </div>
              <div className="form-row">
                {customerDocType === 'pf' ? (
                  <label>
                    <span className="social-label"><IdCard size={14} /> RG (opcional)</span>
                    <input value={customerRg} onChange={(e) => setCustomerRg(e.target.value)} placeholder="00.000.000-0" />
                  </label>
                ) : (
                  <label>
                    <span className="social-label"><FileText size={14} /> Inscrição Estadual</span>
                    <input
                      value={customerIeIsento ? 'ISENTO' : customerIe}
                      onChange={(e) => { if (!customerIeIsento) setCustomerIe(e.target.value); }}
                      placeholder="000.000.000.000"
                      disabled={customerIeIsento}
                    />
                  </label>
                )}
                <label>
                  <span className="social-label"><Building2 size={14} /> Endereço do Cliente</span>
                  <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Rua, número, bairro, cidade, UF, CEP" />
                </label>
              </div>
              {customerDocType === 'pj' && (
                <label className="checkbox-label fiscal-isento-label">
                  <input type="checkbox" checked={customerIeIsento} onChange={(e) => setCustomerIeIsento(e.target.checked)} />
                  Isento de Inscrição Estadual
                </label>
              )}
            </div>
          </div>

          {/* Product Fiscal Classification */}
          <div className="section-divider">
            <span className="section-divider-label"><Package size={14} /> Classificação Fiscal dos Produtos</span>
          </div>

          <div className="stock-table-wrap">
            <table className="rma-table fiscal-table">
              <thead>
                <tr>
                  <th>Produto</th><th>NCM</th><th>CFOP</th><th>CST/CSOSN</th>
                  <th>ICMS%</th><th>PIS%</th><th>COFINS%</th>
                  <th>Vl. ICMS</th><th>Vl. PIS</th><th>Vl. COFINS</th><th>Total</th>
                </tr>
              </thead>
              <tbody>
                {fiscalItems.map((item) => (
                  <tr key={item.product_id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.ncm}</td><td>{item.cfop}</td><td>{item.cst_csosn}</td>
                    <td>{item.icmsRate.toFixed(2)}%</td><td>{item.pisRate.toFixed(2)}%</td><td>{item.cofinsRate.toFixed(2)}%</td>
                    <td>{money.format(item.icmsValue)}</td><td>{money.format(item.pisValue)}</td><td>{money.format(item.cofinsValue)}</td>
                    <td><strong>{money.format(item.unit_price * item.quantity)}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="orders-footer-row">
                  <td colSpan={7}><strong>Totais</strong></td>
                  <td><strong>{money.format(totals.icms)}</strong></td>
                  <td><strong>{money.format(totals.pis)}</strong></td>
                  <td><strong>{money.format(totals.cofins)}</strong></td>
                  <td><strong>{money.format(totals.total)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Tax Summary */}
          <div className="fiscal-summary-grid">
            <div className="fiscal-summary-card"><Calculator size={18} /><div><small>Base de Cálculo</small><strong>{money.format(totals.subtotal)}</strong></div></div>
            <div className="fiscal-summary-card"><Calculator size={18} /><div><small>Total ICMS</small><strong>{money.format(totals.icms)}</strong></div></div>
            <div className="fiscal-summary-card"><Calculator size={18} /><div><small>Total PIS</small><strong>{money.format(totals.pis)}</strong></div></div>
            <div className="fiscal-summary-card"><Calculator size={18} /><div><small>Total COFINS</small><strong>{money.format(totals.cofins)}</strong></div></div>
          </div>

          {/* Selected dispatch summary */}
          <div className="fiscal-dispatch-summary">
            <span className="social-label"><Printer size={14} /> Envio selecionado:</span>
            <div className="fiscal-dispatch-badges">
              {dispatchMethods.has('printer') && <span className="dispatch-badge"><Printer size={13} /> Impressora</span>}
              {dispatchMethods.has('email') && <span className="dispatch-badge"><Mail size={13} /> E-Mail</span>}
              {dispatchMethods.has('whatsapp') && <span className="dispatch-badge"><MessageCircle size={13} /> WhatsApp</span>}
            </div>
          </div>

          {/* Emit Buttons */}
          <div className="fiscal-emit-actions">
            {canEmit ? (
              <>
                <button className="module-submit-btn fiscal-emit-btn" onClick={() => openEmitModal('nfce')}>
                  <Receipt size={18} /> Emitir NFC-e (Cupom Fiscal)
                </button>
                <button className="module-submit-btn fiscal-emit-btn nfe" onClick={() => openEmitModal('nfe')}>
                  <FileCheck size={18} /> Emitir NF-e (Nota Grande)
                </button>
              </>
            ) : (
              <div className="pdv-restricted-checkout">
                <AlertCircle size={16} />
                <span>Emissão de notas fiscais restrita a Caixa, Gerente ou Administrador.</span>
              </div>
            )}
          </div>

          {emitResult && (
            <div className="sent-message">
              <Check size={15} /> {emitResult.type === 'nfce' ? 'NFC-e' : 'NF-e'} emitida com sucesso! Protocolo: {Date.now().toString(36).toUpperCase()}
            </div>
          )}
        </>
      )}

      {!selectedSale && (
        <div className="fiscal-empty-state">
          <FileText size={32} />
          <p>Selecione uma venda concluída para emitir a nota fiscal.</p>
        </div>
      )}

      {/* ===== Emit Modal ===== */}
      {showEmitModal && selectedSale && (
        <div className="modal-backdrop" onClick={() => setShowEmitModal(false)}>
          <div className="modal-content fiscal-emit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Emissão de Documento Fiscal</h3>
              <button onClick={() => setShowEmitModal(false)}><FileText size={18} /></button>
            </div>

            {/* Document Type Selection */}
            <div className="fiscal-doc-select">
              <button
                className={`fiscal-doc-big-btn ${emitType === 'nfe' ? 'active' : ''}`}
                onClick={() => { setEmitType('nfe'); setFiscalTab('nota'); }}
              >
                <FileCheck size={22} />
                <strong>F6</strong>
                <span>Nota Fiscal</span>
              </button>
              <button
                className={`fiscal-doc-big-btn ${emitType === 'nfce' ? 'active' : ''}`}
                onClick={() => { setEmitType('nfce'); setFiscalTab('cupom'); }}
              >
                <Receipt size={22} />
                <strong>F7</strong>
                <span>Cupom Fiscal</span>
              </button>
            </div>

            {/* Dual Tabs */}
            <div className="subtab-bar fiscal-modal-tabs">
              <button className={`subtab ${fiscalTab === 'cupom' ? 'active' : ''}`} onClick={() => setFiscalTab('cupom')}>
                <Receipt size={15} /> Dados do Cupom Fiscal
              </button>
              <button className={`subtab ${fiscalTab === 'nota' ? 'active' : ''}`} onClick={() => setFiscalTab('nota')}>
                <FileCheck size={15} /> Dados da Nota Fiscal
              </button>
            </div>

            <div className="fiscal-modal-body">
              {/* Delivery Options (reflecting main screen selection) */}
              <div className="fiscal-delivery-row">
                {dispatchOptions.map(({ id, label, shortcut, icon: Icon }) => (
                  <button
                    key={id}
                    className={`fiscal-delivery-btn ${dispatchMethods.has(id) ? 'active' : ''}`}
                    onClick={() => toggleDispatchMethod(id)}
                  >
                    <Icon size={16} /> <strong>{shortcut}</strong> {label}
                    {dispatchMethods.has(id) && <Check size={12} />}
                  </button>
                ))}
              </div>

              {dispatchMethods.has('email') && (
                <label>
                  <span className="social-label"><Mail size={14} /> E-mail do Cliente</span>
                  <input type="email" value={dispatchEmail} onChange={(e) => setDispatchEmail(e.target.value)} placeholder="cliente@email.com" />
                </label>
              )}
              {dispatchMethods.has('whatsapp') && (
                <label>
                  <span className="social-label"><MessageCircle size={14} /> WhatsApp do Cliente</span>
                  <input value={dispatchPhone} onChange={(e) => setDispatchPhone(e.target.value)} placeholder="(92) 99999-9999" />
                </label>
              )}

              {/* Dynamic Form Fields */}
              <div className="form-row">
                <label>
                  <span className="social-label">
                    {customerDocType === 'pj' ? <Building2 size={14} /> : <IdCard size={14} />}
                    {' '}{customerDocType === 'pj' ? 'CNPJ' : 'CPF'} na Nota
                  </span>
                  <input
                    value={customerDocType === 'pj' ? maskCnpj(customerDoc) : maskCpf(customerDoc)}
                    onChange={(e) => setCustomerDoc(e.target.value.replace(/\D/g, ''))}
                    placeholder={customerDocType === 'pj' ? '00.000.000/0000-00' : '000.000.000-00'}
                  />
                </label>
                <label>
                  <span className="social-label"><User size={14} /> Nome do Cliente (opcional)</span>
                  <input value={emitCustomerName} onChange={(e) => setEmitCustomerName(e.target.value)} placeholder="Nome / Razão Social" />
                </label>
              </div>

              <label>
                <span className="social-label"><FileText size={14} /> Observações da Nota para seu Cliente</span>
                <textarea value={emitObservations} onChange={(e) => setEmitObservations(e.target.value)} placeholder="Observações..." rows={2} />
              </label>

              <div className="form-row">
                <label>
                  <span className="social-label"><FileText size={14} /> Finalidade da NFe</span>
                  <select value={emitFinalidade} onChange={(e) => setEmitFinalidade(e.target.value)}>
                    <option value="1">1 - Normal</option>
                    <option value="2">2 - Complementar</option>
                    <option value="3">3 - Ajuste</option>
                    <option value="4">4 - Devolução</option>
                  </select>
                </label>
                <label>
                  <span className="social-label"><User size={14} /> Indicador de Presença</span>
                  <select value={emitPresenca} onChange={(e) => setEmitPresenca(e.target.value)}>
                    <option value="1">1 - Operação Presencial</option>
                    <option value="2">2 - Internet</option>
                    <option value="3">3 - Teleatendimento</option>
                    <option value="4">4 - NFC-e Presencial</option>
                    <option value="9">9 - Não se aplica</option>
                  </select>
                </label>
              </div>

              <label>
                <span className="social-label"><User size={14} /> Tipo de Cliente</span>
                <select value={emitTipoCliente} onChange={(e) => setEmitTipoCliente(e.target.value)}>
                  <option value="1">CONSUMIDOR FINAL</option>
                  <option value="2">Contribuinte ICMS</option>
                </select>
              </label>

              <div className="form-row">
                <label>
                  <span className="social-label"><FileText size={14} /> Série</span>
                  <input value={emitSerie} onChange={(e) => setEmitSerie(e.target.value)} placeholder="001" />
                </label>
                <label>
                  <span className="social-label"><FileText size={14} /> Número da Nota</span>
                  <input value={emitNumero} onChange={(e) => setEmitNumero(e.target.value)} placeholder="Auto" />
                </label>
              </div>

              {emitType === 'nfce' && (
                <div className="form-row">
                  <label>
                    <span className="social-label"><FileText size={14} /> CSC SEFAZ ID</span>
                    <input value={emitCscId} onChange={(e) => setEmitCscId(e.target.value)} placeholder="ID do CSC" />
                  </label>
                  <label>
                    <span className="social-label"><FileText size={14} /> CSC SEFAZ Número</span>
                    <input value={emitCscNumber} onChange={(e) => setEmitCscNumber(e.target.value)} placeholder="Número do CSC" />
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div className="fiscal-modal-actions">
                <button className="module-action-btn" onClick={() => { setEmitSerie('001'); setEmitFinalidade('1'); setEmitPresenca('1'); setEmitTipoCliente('1'); }}>
                  <Save size={16} /> F11 Salvar Padrões
                </button>
                <button className="module-submit-btn" onClick={handleEmit}>
                  <FileCheck size={16} /> F12 Emitir Nota
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
