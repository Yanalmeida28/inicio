import React, { useState, useMemo } from 'react';
import {
  Boxes, FileText, Package, Plus, Tag, Trash2, Upload, Users, Wrench,
  Building2, UserCheck, Layers, QrCode, X, History, Download,
  IdCard, MapPin, Wallet, Phone, Mail, Save, Camera, UserCircle,
  Printer, MessageCircle, Check, TrendingUp, AlertTriangle, Activity,
} from 'lucide-react';
import type {
  PartnerProduct, PartnerCategory, PartnerSupplier,
  PartnerSalesperson, PartnerCombo, PartnerModifier, PartnerCustomer,
  PartnerSale, SalespersonRole, PartnerBranch,
  PersonType,
} from '../../types';
import { formatCnpj, formatCpf, isValidCnpj, isValidCpf, money, normalizeDocument } from '../../utils';
import { ImportExportModule, ExportButtons } from './ImportExportModule';

type Props = {
  products: PartnerProduct[];
  branches: PartnerBranch[];
  selectedBranchId: string | null;
  categories: PartnerCategory[];
  suppliers: PartnerSupplier[];
  salespeople: PartnerSalesperson[];
  combos: PartnerCombo[];
  modifiers: PartnerModifier[];
  customers: PartnerCustomer[];
  sales: PartnerSale[];
  segment: string;
  onAddProduct: (p: Omit<PartnerProduct, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onAddCategory: (name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onAddSupplier: (s: Omit<PartnerSupplier, 'id' | 'user_id' | 'created_at' | 'payable_balance'>) => Promise<void>;
  onAddSalesperson: (sp: Omit<PartnerSalesperson, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  onUpdateSalesperson: (id: string, updates: Partial<PartnerSalesperson>) => Promise<void>;
  onDeleteSalesperson: (id: string) => Promise<void>;
  onAddCombo: (c: Omit<PartnerCombo, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  onDeleteCombo: (id: string) => Promise<void>;
  onAddModifier: (m: Omit<PartnerModifier, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  onDeleteModifier: (id: string) => Promise<void>;
  onAddCustomer: (c: Omit<PartnerCustomer, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  onUpdateCustomer: (id: string, updates: Partial<PartnerCustomer>) => Promise<void>;
  onDeleteCustomer: (id: string) => Promise<void>;
};

type SubTab = 'produtos' | 'categorias' | 'xml' | 'combos' | 'modificadores' | 'clientes' | 'fornecedores' | 'vendedores' | 'importar' | 'reposicao';

const subTabs: { id: SubTab; label: string; icon: typeof Package }[] = [
  { id: 'produtos', label: 'Produtos & Serviços', icon: Package },
  { id: 'categorias', label: 'Categorias', icon: Tag },
  { id: 'xml', label: 'Entrada via XML (NF-e)', icon: FileText },
  { id: 'combos', label: 'Combos / Kits', icon: Boxes },
  { id: 'modificadores', label: 'Modificadores', icon: Layers },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'fornecedores', label: 'Fornecedores', icon: Building2 },
  { id: 'vendedores', label: 'Vendedores / Técnicos', icon: UserCheck },
  { id: 'reposicao', label: 'Reposição de Estoque', icon: Activity },
  { id: 'importar', label: 'Importar / Exportar', icon: Upload },
];

export function CadastrosModule({
  products, branches, selectedBranchId, categories, suppliers, salespeople, combos, modifiers, customers, sales,
  segment, onAddProduct, onDeleteProduct,
  onAddCategory, onDeleteCategory, onAddSupplier, onAddSalesperson,
  onUpdateSalesperson, onDeleteSalesperson,
  onAddCombo, onDeleteCombo, onAddModifier, onDeleteModifier, onAddCustomer,
  onUpdateCustomer, onDeleteCustomer,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>('produtos');
  const filteredProducts = selectedBranchId
    ? products.filter((product) => product.branch_id === selectedBranchId)
    : [];

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Boxes size={20} /></span>
        <div>
          <h3>Cadastros Essenciais & Entrada Automática</h3>
          <p>Produtos, serviços, categorias, clientes, fornecedores e equipe</p>
        </div>
      </div>

      <div className="subtab-bar">
        {subTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`subtab ${subTab === id ? 'active' : ''}`}
            onClick={() => setSubTab(id)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="subtab-content">
        {subTab === 'produtos' && (
          <ProductsSubTab
            products={filteredProducts}
            allProducts={products}
            branches={branches}
            selectedBranchId={selectedBranchId}
            categories={categories}
            segment={segment}
            onAddProduct={onAddProduct}
            onDeleteProduct={onDeleteProduct}
          />
        )}
        {subTab === 'categorias' && (
          <CategoriesSubTab categories={categories} onAdd={onAddCategory} onDelete={onDeleteCategory} />
        )}
        {subTab === 'xml' && <XmlSubTab selectedBranchId={selectedBranchId} onAddProduct={onAddProduct} />}
        {subTab === 'combos' && (
          <CombosSubTab combos={combos} products={filteredProducts} onAdd={onAddCombo} onDelete={onDeleteCombo} />
        )}
        {subTab === 'modificadores' && (
          <ModifiersSubTab modifiers={modifiers} products={filteredProducts} onAdd={onAddModifier} onDelete={onDeleteModifier} />
        )}
        {subTab === 'clientes' && (
          <CustomersSubTab
            customers={customers}
            sales={sales}
            selectedBranchId={selectedBranchId}
            onAdd={onAddCustomer}
            onUpdate={onUpdateCustomer}
            onDelete={onDeleteCustomer}
          />
        )}
        {subTab === 'fornecedores' && (
          <SuppliersSubTab suppliers={suppliers} onAdd={onAddSupplier} />
        )}
        {subTab === 'vendedores' && (
          <SalespeopleSubTab
            salespeople={salespeople}
            branches={branches}
            onAdd={onAddSalesperson}
            onUpdate={onUpdateSalesperson}
            onDelete={onDeleteSalesperson}
          />
        )}
        {subTab === 'reposicao' && (
          <ReplenishmentSubTab products={products} sales={sales} />
        )}
        {subTab === 'importar' && (
          <ImportExportModule
            products={products}
            customers={customers}
            selectedBranchId={selectedBranchId}
            onAddProduct={onAddProduct}
            onAddCustomer={onAddCustomer}
          />
        )}
      </div>
    </div>
  );
}

function ProductsSubTab({ products, allProducts, branches, selectedBranchId, categories, segment, onAddProduct, onDeleteProduct }: {
  products: PartnerProduct[];
  allProducts: PartnerProduct[];
  branches: PartnerBranch[];
  selectedBranchId: string | null;
  categories: PartnerCategory[];
  segment: string;
  onAddProduct: (p: Omit<PartnerProduct, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [cost, setCost] = useState('');
  const [sale, setSale] = useState('');
  const [wholesale, setWholesale] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [category, setCategory] = useState('');
  const [isService, setIsService] = useState(false);
  const [ncm, setNcm] = useState('');
  const [cfop, setCfop] = useState('');
  const [cstCsosn, setCstCsosn] = useState('');
  const [icmsRate, setIcmsRate] = useState('');
  const [pisRate, setPisRate] = useState('');
  const [cofinsRate, setCofinsRate] = useState('');
  const [labelProductId, setLabelProductId] = useState<string | null>(null);
  const [availabilityProductId, setAvailabilityProductId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !sale) return;
    if (!selectedBranchId) {
      window.alert('Selecione uma filial antes de cadastrar produtos para manter o estoque separado por filial.');
      return;
    }
    await onAddProduct({
      name, sku: sku || null, cost_price: Number(cost) || 0, sale_price: Number(sale) || 0,
      wholesale_price: Number(wholesale) || 0,
      stock: Number(stock) || 0, min_stock: Number(minStock) || 0,
      image_url: null, category: category || null, is_service: isService, branch_id: selectedBranchId,
      ncm: ncm || null, cfop: cfop || null, cst_csosn: cstCsosn || null,
      icms_rate: Number(icmsRate) || 0, pis_rate: Number(pisRate) || 0, cofins_rate: Number(cofinsRate) || 0,
    });
    setName(''); setSku(''); setCost(''); setSale(''); setWholesale(''); setStock(''); setMinStock('5'); setCategory(''); setIsService(false);
    setNcm(''); setCfop(''); setCstCsosn(''); setIcmsRate(''); setPisRate(''); setCofinsRate('');
    setShowForm(false);
  }

  const itemLabel = segment === 'assistencia' ? 'Peça / Serviço' : 'Produto / Serviço';

  const selectedProduct = products.find((p) => p.id === availabilityProductId) ?? null;
  const currentBranch = branches.find((branch) => branch.id === selectedBranchId);

  const productMatches = selectedProduct
    ? allProducts.filter((product) => {
        if (!product.branch_id || product.branch_id === selectedBranchId) return false;
        const sameName = product.name.trim().toLowerCase() === selectedProduct.name.trim().toLowerCase();
        const sameSku = !!selectedProduct.sku && !!product.sku && product.sku.trim().toLowerCase() === selectedProduct.sku.trim().toLowerCase();
        const sameFallback = !selectedProduct.sku && !product.sku && sameName;
        return sameName && (sameSku || sameFallback);
      })
    : [];

  return (
    <div>
      <div className="action-row">
        <button className="module-action-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : <><Plus size={16} /> Novo {itemLabel}</>}
        </button>
        <ExportButtons target="produtos" products={products} customers={[]} />
      </div>
      {showForm && (
        <form className="rma-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Nome
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Display Moto G8" required />
            </label>
            <label>
              SKU
              <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ex: DH-MG8-012" />
            </label>
          </div>
          <div className="form-row">
            <label>
              Preço de Custo
              <input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
            </label>
            <label>
              Preço Varejo
              <input type="number" step="0.01" value={sale} onChange={(e) => setSale(e.target.value)} placeholder="0,00" required />
            </label>
            <label>
              Preço Atacado
              <input type="number" step="0.01" value={wholesale} onChange={(e) => setWholesale(e.target.value)} placeholder="0,00" />
            </label>
          </div>
          <div className="form-row">
            <label>
              Estoque
              <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" />
            </label>
            <label>
              Alerta Mínimo
              <input type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="5" />
            </label>
            <label>
              Categoria
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Selecione...</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={isService} onChange={(e) => setIsService(e.target.checked)} />
              É um serviço (sem estoque)
            </label>
          </div>
          <div className="form-row">
            <label>
              NCM
              <input value={ncm} onChange={(e) => setNcm(e.target.value)} placeholder="0000.00.00" />
            </label>
            <label>
              CFOP
              <input value={cfop} onChange={(e) => setCfop(e.target.value)} placeholder="5102" />
            </label>
            <label>
              CST/CSOSN
              <input value={cstCsosn} onChange={(e) => setCstCsosn(e.target.value)} placeholder="102" />
            </label>
          </div>
          <div className="form-row">
            <label>
              ICMS (%)
              <input type="number" step="0.01" value={icmsRate} onChange={(e) => setIcmsRate(e.target.value)} placeholder="0" />
            </label>
            <label>
              PIS (%)
              <input type="number" step="0.01" value={pisRate} onChange={(e) => setPisRate(e.target.value)} placeholder="0" />
            </label>
            <label>
              COFINS (%)
              <input type="number" step="0.01" value={cofinsRate} onChange={(e) => setCofinsRate(e.target.value)} placeholder="0" />
            </label>
          </div>
          <button type="submit" className="module-submit-btn">Cadastrar</button>
        </form>
      )}

      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead>
            <tr>
              <th>Nome</th><th>SKU</th><th>Custo</th><th>Varejo</th><th>Atacado</th><th>Estoque</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan={8} className="empty-row">Nenhum produto cadastrado.</td></tr>
            ) : (
              products.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong>{p.is_service && <small className="tag-service">Serviço</small>}</td>
                  <td>{p.sku ?? '—'}</td>
                  <td>{money.format(p.cost_price)}</td>
                  <td>{money.format(p.sale_price)}</td>
                  <td>{p.wholesale_price > 0 ? money.format(p.wholesale_price) : '—'}</td>
                  <td>{p.is_service ? '—' : p.stock}</td>
                  <td>
                    {!p.is_service && p.stock <= (p.min_stock || 0) && p.stock > 0 && (
                      <span className="rma-status-badge" style={{ color: '#e6a06d', borderColor: '#e6a06d' }}>Estoque baixo</span>
                    )}
                    {!p.is_service && p.stock === 0 && (
                      <span className="rma-status-badge" style={{ color: '#e3829b', borderColor: '#e3829b' }}>Sem estoque</span>
                    )}
                    {!p.is_service && p.stock > (p.min_stock || 0) && (
                      <span className="rma-status-badge" style={{ color: '#5bbc87', borderColor: '#5bbc87' }}>OK</span>
                    )}
                  </td>
                  <td>
                    <div className="row-action-group">
                      <button className="rma-advance-btn" onClick={() => setLabelProductId(p.id)} title="Imprimir Etiqueta">
                        <QrCode size={14} />
                      </button>
                      <button className="rma-advance-btn" onClick={() => setAvailabilityProductId(p.id)} title="Ver disponibilidade em outras filiais">
                        <Building2 size={14} />
                      </button>
                      <button className="rma-advance-btn danger" onClick={() => onDeleteProduct(p.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {labelProductId && (
        <ThermalLabelModal
          product={products.find((p) => p.id === labelProductId)}
          onClose={() => setLabelProductId(null)}
        />
      )}

      {availabilityProductId && selectedProduct && (
        <ProductBranchAvailabilityModal
          product={selectedProduct}
          currentBranchName={currentBranch?.name ?? 'Minha filial'}
          currentBranchStock={selectedProduct.stock}
          currentBranchPrice={selectedProduct.sale_price}
          otherBranches={productMatches.map((product) => ({
            branchId: product.branch_id!,
            branchName: branches.find((branch) => branch.id === product.branch_id)?.name ?? 'Filial',
            stock: product.stock,
            salePrice: product.sale_price,
          }))}
          onClose={() => setAvailabilityProductId(null)}
        />
      )}
    </div>
  );
}

function ProductBranchAvailabilityModal({
  product,
  currentBranchName,
  currentBranchStock,
  currentBranchPrice,
  otherBranches,
  onClose,
}: {
  product: PartnerProduct;
  currentBranchName: string;
  currentBranchStock: number;
  currentBranchPrice: number;
  otherBranches: { branchId: string; branchName: string; stock: number; salePrice: number }[];
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3>Ver disponibilidade em outras filiais</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <div className="partner-card" style={{ padding: 16 }}>
            <strong>Produto: {product.name}</strong>
            <div style={{ marginTop: 8 }}>
              <div><strong>Minha filial</strong></div>
              <div>{currentBranchName}</div>
              <small>Estoque: {currentBranchStock} unidades</small><br />
              <small>Preço de venda: {money.format(currentBranchPrice)}</small>
            </div>
          </div>

          <div className="partner-card" style={{ padding: 16 }}>
            <strong>Outras filiais</strong>
            {otherBranches.length === 0 ? (
              <div style={{ marginTop: 12 }}>Sem estoque em outras filiais.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {otherBranches.map((branch) => (
                  <div key={branch.branchId} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
                    <div><strong>{branch.branchName}</strong></div>
                    <small>Estoque: {branch.stock} unidades</small><br />
                    <small>Preço de venda: {money.format(branch.salePrice)}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function ThermalLabelModal({ product, onClose }: {
  product: PartnerProduct | undefined;
  onClose: () => void;
}) {
  const [size, setSize] = useState<'58' | '80'>('58');
  if (!product) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content thermal-label-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Imprimir Etiqueta</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="thermal-size-toggle">
          <button className={size === '58' ? 'active' : ''} onClick={() => setSize('58')}>58mm</button>
          <button className={size === '80' ? 'active' : ''} onClick={() => setSize('80')}>80mm</button>
        </div>
        <div className={`thermal-label-preview size-${size}`}>
          <div className="thermal-label-content">
            <div className="thermal-qr-area">
              <QrCode size={size === '58' ? 48 : 64} />
            </div>
            <div className="thermal-label-info">
              <strong>{product.name}</strong>
              <small>SKU: {product.sku ?? '—'}</small>
              <small>{money.format(product.sale_price)}</small>
            </div>
          </div>
        </div>
        <button className="module-submit-btn" onClick={() => window.print()}>
          <QrCode size={16} /> Imprimir
        </button>
      </div>
    </div>
  );
}

function CategoriesSubTab({ categories, onAdd, onDelete }: {
  categories: PartnerCategory[];
  onAdd: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name);
    setName('');
  }
  return (
    <div>
      <form className="rma-form inline" onSubmit={handleAdd}>
        <label>
          Nova Categoria
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Displays / Telas" required />
        </label>
        <button type="submit" className="module-submit-btn"><Plus size={16} /> Adicionar</button>
      </form>
      <div className="chip-list">
        {categories.length === 0 ? (
          <p className="empty-row">Nenhuma categoria cadastrada.</p>
        ) : (
          categories.map((c) => (
            <span key={c.id} className="chip">
              <Tag size={13} /> {c.name}
              <button onClick={() => onDelete(c.id)}><Trash2 size={12} /></button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function XmlSubTab({ selectedBranchId, onAddProduct }: {
  selectedBranchId: string | null;
  onAddProduct: (p: Omit<PartnerProduct, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
}) {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<{ name: string; sku: string; qty: number; cost: number }[] | null>(null);
  const [imported, setImported] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsed([
      { name: 'Display Galaxy A14', sku: 'DH-SA14-015', qty: 10, cost: 45.0 },
      { name: 'Bateria iPhone 11', sku: 'DH-IP11-034', qty: 5, cost: 35.0 },
      { name: 'Conector de Carga Redmi 9', sku: 'DH-R9-021', qty: 20, cost: 9.5 },
    ]);
    setImported(false);
  }

  async function handleImport() {
    if (!parsed) return;
    if (!selectedBranchId) {
      window.alert('Selecione uma filial antes de importar produtos para manter o estoque separado entre filiais.');
      return;
    }
    for (const item of parsed) {
      await onAddProduct({
        name: item.name, sku: item.sku, cost_price: item.cost, sale_price: item.cost * 1.8,
        wholesale_price: item.cost * 1.3,
        stock: item.qty, min_stock: 5, image_url: null, category: null, is_service: false, branch_id: selectedBranchId,
        ncm: null, cfop: null, cst_csosn: null, icms_rate: 0, pis_rate: 0, cofins_rate: 0,
      });
    }
    setImported(true);
    setParsed(null);
    setFileName('');
  }

  return (
    <div>
      <div className="xml-info-banner">
        <FileText size={20} />
        <div>
          <strong>Entrada Automática via XML (NF-e)</strong>
          <p>Importe arquivos XML de notas fiscais para dar entrada em lote no estoque, cadastrando fornecedor, produtos e quantidades automaticamente.</p>
        </div>
      </div>
      <label className="upload-label">
        <div className="media-upload">
          <Upload size={18} />
          <span>{fileName || 'Selecionar arquivo XML da NF-e'}</span>
          <input type="file" accept=".xml,application/xml,text/xml" onChange={handleFile} hidden />
        </div>
      </label>
      {parsed && (
        <div className="stock-table-wrap">
          <table className="rma-table">
            <thead>
              <tr><th>Produto</th><th>SKU</th><th>Qtd.</th><th>Custo Unit.</th><th>Custo Total</th></tr>
            </thead>
            <tbody>
              {parsed.map((item, i) => (
                <tr key={i}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.sku}</td>
                  <td>{item.qty}</td>
                  <td>{money.format(item.cost)}</td>
                  <td>{money.format(item.cost * item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="module-submit-btn" onClick={handleImport}>
            <Wrench size={16} /> Dar entrada no estoque ({parsed.length} itens)
          </button>
        </div>
      )}
      {imported && <div className="sent-message">Itens importados e adicionados ao estoque com sucesso!</div>}
    </div>
  );
}

function CombosSubTab({ combos, products, onAdd, onDelete }: {
  combos: PartnerCombo[];
  products: PartnerProduct[];
  onAdd: (c: Omit<PartnerCombo, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !price || selected.length === 0) return;
    const items = selected.map((pid) => {
      const p = products.find((x) => x.id === pid);
      return { product_id: pid, name: p?.name ?? '', quantity: 1 };
    });
    await onAdd({ name, price: Number(price), items, active: true });
    setName(''); setPrice(''); setSelected([]); setShowForm(false);
  }

  function toggleProduct(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <div>
      <button className="module-action-btn" onClick={() => setShowForm(!showForm)}>
        {showForm ? 'Cancelar' : <><Plus size={16} /> Novo Combo / Kit</>}
      </button>
      {showForm && (
        <form className="rma-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Nome do Combo
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Kit Troca de Tela + Películula" required />
            </label>
            <label>
              Preço Fechado
              <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" required />
            </label>
          </div>
          <div className="product-picker">
            <small>Selecione os itens do combo:</small>
            <div className="product-picker-grid">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`picker-item ${selected.includes(p.id) ? 'selected' : ''}`}
                  onClick={() => toggleProduct(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="module-submit-btn">Criar combo</button>
        </form>
      )}
      <div className="combo-list">
        {combos.length === 0 ? (
          <p className="empty-row">Nenhum combo cadastrado.</p>
        ) : (
          combos.map((c) => (
            <div key={c.id} className="combo-card">
              <div>
                <strong>{c.name}</strong>
                <small>{c.items.length} itens • {money.format(c.price)}</small>
              </div>
              <button className="rma-advance-btn danger" onClick={() => onDelete(c.id)}><Trash2 size={14} /></button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ModifiersSubTab({ modifiers, products, onAdd, onDelete }: {
  modifiers: PartnerModifier[];
  products: PartnerProduct[];
  onAdd: (m: Omit<PartnerModifier, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [adj, setAdj] = useState('');
  const [productId, setProductId] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !productId) return;
    await onAdd({ name, price_adjustment: Number(adj) || 0, product_id: productId });
    setName(''); setAdj(''); setProductId('');
  }

  return (
    <div>
      <form className="rma-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Produto Base
            <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">Selecione...</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>
            Nome do Modificador
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Com aro / Sem aro" required />
          </label>
          <label>
            Ajuste de Preço (+/-)
            <input type="number" step="0.01" value={adj} onChange={(e) => setAdj(e.target.value)} placeholder="0,00" />
          </label>
        </div>
        <button type="submit" className="module-submit-btn"><Plus size={16} /> Adicionar modificador</button>
      </form>
      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Produto</th><th>Modificador</th><th>Ajuste</th><th></th></tr></thead>
          <tbody>
            {modifiers.length === 0 ? (
              <tr><td colSpan={4} className="empty-row">Nenhum modificador cadastrado.</td></tr>
            ) : (
              modifiers.map((m) => (
                <tr key={m.id}>
                  <td>{products.find((p) => p.id === m.product_id)?.name ?? '—'}</td>
                  <td>{m.name}</td>
                  <td>{m.price_adjustment >= 0 ? '+' : ''}{money.format(m.price_adjustment)}</td>
                  <td><button className="rma-advance-btn danger" onClick={() => onDelete(m.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomersSubTab({ customers, sales, selectedBranchId, onAdd, onUpdate, onDelete }: {
  customers: PartnerCustomer[];
  sales: PartnerSale[];
  selectedBranchId: string | null;
  onAdd: (c: Omit<PartnerCustomer, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  onUpdate: (id: string, updates: Partial<PartnerCustomer>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [personType, setPersonType] = useState<PersonType | ''>('PF');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [device, setDevice] = useState('');
  const [notes, setNotes] = useState('');
  const [customerType, setCustomerType] = useState<'varejo' | 'atacado'>('varejo');
  const [customerSearch, setCustomerSearch] = useState('');
  const [historyCustomerId, setHistoryCustomerId] = useState<string | null>(null);
  const [profileCustomerId, setProfileCustomerId] = useState<string | null>(null);

  function resetForm() {
    setName(''); setDocument(''); setPersonType('PF'); setPhone(''); setEmail(''); setBirthday(''); setAddress('');
    setNeighborhood(''); setCity(''); setDevice(''); setNotes(''); setCustomerType('varejo');
    setEditingCustomerId(null); setShowForm(false);
  }

  function openEditForm(customer: PartnerCustomer) {
    setEditingCustomerId(customer.id);
    setName(customer.name ?? '');
    const normDoc = customer.document ? normalizeDocument(customer.document) : '';
    setDocument(normDoc);
    const inferredType: PersonType = customer.person_type || (normDoc.length > 11 ? 'PJ' : 'PF');
    setPersonType(inferredType);
    setPhone(customer.phone ?? '');
    setEmail(customer.email ?? '');
    setBirthday(customer.birthday ?? '');
    setAddress(customer.address ?? '');
    setNeighborhood(customer.neighborhood ?? '');
    setCity(customer.city ?? '');
    setDevice(customer.device_model ?? '');
    setNotes(customer.notes ?? '');
    setCustomerType(customer.customer_type ?? 'varejo');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!selectedBranchId && !editingCustomerId) {
      window.alert('Selecione uma filial antes de cadastrar clientes para manter a separação entre filiais.');
      return;
    }

    const normalizedDocument = normalizeDocument(document);
    let effectivePersonType = personType;
    if (!effectivePersonType) {
      effectivePersonType = normalizedDocument.length > 11 ? 'PJ' : 'PF';
    }

    if (normalizedDocument) {
      if (effectivePersonType === 'PF') {
        if (normalizedDocument.length !== 11) {
          window.alert('O CPF deve conter exatamente 11 dígitos.');
          return;
        }
        if (!isValidCpf(normalizedDocument)) {
          window.alert('Informe um CPF válido.');
          return;
        }
      } else if (effectivePersonType === 'PJ') {
        if (normalizedDocument.length !== 14) {
          window.alert('O CNPJ deve conter exatamente 14 dígitos.');
          return;
        }
        if (!isValidCnpj(normalizedDocument)) {
          window.alert('Informe um CNPJ válido.');
          return;
        }
      }
    }

    const payload = {
      name,
      document: normalizedDocument || null,
      person_type: effectivePersonType,
      phone: phone || null,
      email: email || null,
      birthday: birthday || null,
      address: address || null,
      neighborhood: neighborhood || null,
      city: city || null,
      device_model: device || null,
      notes: notes || null,
      customer_type: customerType,
      branch_id: editingCustomerId ? (customers.find((customer) => customer.id === editingCustomerId)?.branch_id ?? selectedBranchId) : selectedBranchId,
    };

    if (!payload.branch_id) {
      window.alert('Não foi possível localizar a filial atual do cliente. Selecione uma filial antes de salvar.');
      return;
    }

    try {
      if (editingCustomerId) {
        await onUpdate(editingCustomerId, payload);
      } else {
        await onAdd(payload as Omit<PartnerCustomer, 'id' | 'user_id' | 'created_at'>);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível salvar o cliente.');
      return;
    }

    resetForm();
  }

  const historyCustomer = customers.find((c) => c.id === historyCustomerId);
  const historySales = sales.filter((s) => s.customer_id === historyCustomerId);
  const profileCustomer = customers.find((c) => c.id === profileCustomerId);
  const normalizedSearch = normalizeDocument(customerSearch);
  const visibleCustomers = customers.filter((customer) => {
    const searchTerm = customerSearch.trim().toLowerCase();
    if (!searchTerm) return true;
    const docDigits = normalizeDocument(customer.document ?? '');
    const isPj = customer.person_type === 'PJ' || docDigits.length > 11;
    const formattedDoc = docDigits ? (isPj ? formatCnpj(docDigits) : formatCpf(docDigits)) : '';
    return (
      (customer.name ?? '').toLowerCase().includes(searchTerm) ||
      (customer.email ?? '').toLowerCase().includes(searchTerm) ||
      (customer.phone ?? '').toLowerCase().includes(searchTerm) ||
      formattedDoc.toLowerCase().includes(searchTerm) ||
      (normalizedSearch && docDigits.includes(normalizedSearch))
    );
  });

  return (
    <div>
      <div className="action-row">
        <button className="module-action-btn" onClick={() => {
          if (showForm && editingCustomerId) {
            resetForm();
            return;
          }
          setShowForm(!showForm);
          if (!showForm) {
            setName(''); setDocument(''); setPersonType('PF'); setPhone(''); setEmail(''); setBirthday(''); setAddress('');
            setNeighborhood(''); setCity(''); setDevice(''); setNotes(''); setCustomerType('varejo');
            setEditingCustomerId(null);
          }
        }}>
          {showForm ? 'Cancelar' : <><Plus size={16} /> Novo Cliente</>}
        </button>
        <ExportButtons target="clientes" products={[]} customers={customers} />
      </div>
      <input
        value={customerSearch}
        onChange={(e) => setCustomerSearch(e.target.value)}
        placeholder="Buscar por nome, CPF/CNPJ, telefone ou e-mail"
        aria-label="Buscar clientes"
        style={{ width: '100%', marginBottom: '12px' }}
      />
      {showForm && (
        <form className="rma-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Nome Completo / Razão Social
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João Silva ou Silva Tech LTDA" required />
            </label>
            <label>
              Tipo de pessoa
              <select
                value={personType}
                onChange={(e) => {
                  const nextType = e.target.value as PersonType;
                  setPersonType(nextType);
                }}
                required
              >
                <option value="PF">Pessoa Física (CPF)</option>
                <option value="PJ">Pessoa Jurídica (CNPJ)</option>
              </select>
            </label>
            <label>
              Documento ({personType === 'PJ' ? 'CNPJ' : 'CPF'})
              <input
                value={
                  document
                    ? (personType === 'PJ' || (!personType && document.length > 11) ? formatCnpj(document) : formatCpf(document))
                    : ''
                }
                onChange={(e) => {
                  const raw = normalizeDocument(e.target.value);
                  setDocument(raw);
                  if (raw.length > 11) {
                    setPersonType('PJ');
                  } else if (raw.length > 0 && !personType) {
                    setPersonType('PF');
                  }
                }}
                placeholder={personType === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                inputMode="numeric"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              WhatsApp
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </label>
            <label>
              E-mail
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@email.com" />
            </label>
            <label>
              Data de Nascimento
              <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Endereço Completo
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, complemento" />
            </label>
            <label>
              Bairro
              <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Ex: Centro" />
            </label>
            <label>
              Cidade
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex: São Paulo, SP" />
            </label>
          </div>
          <div className="form-row">
            <label>
              Aparelho / Observações
              <input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="Ex: iPhone 11 — bateria" />
            </label>
            <label>
              Tipo de Cliente
              <select value={customerType} onChange={(e) => setCustomerType(e.target.value as 'varejo' | 'atacado')}>
                <option value="varejo">Varejo</option>
                <option value="atacado">Atacado</option>
              </select>
            </label>
          </div>
          <label>
            Observações Adicionais
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas sobre o cliente..." rows={2} />
          </label>
          <button type="submit" className="module-submit-btn">{editingCustomerId ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
        </form>
      )}

      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>WhatsApp</th><th>Bairro/Cidade</th><th>Aniversário</th><th>Ações</th></tr></thead>
          <tbody>
            {visibleCustomers.length === 0 ? (
              <tr><td colSpan={6} className="empty-row">Nenhum cliente cadastrado.</td></tr>
            ) : (
              visibleCustomers.map((c) => {
                const normDoc = c.document ? normalizeDocument(c.document) : '';
                const isPj = c.person_type === 'PJ' || normDoc.length > 11;
                const formattedDoc = normDoc ? (isPj ? formatCnpj(normDoc) : formatCpf(normDoc)) : '—';

                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      {c.customer_type === 'atacado' && <small className="tag-service">Atacado</small>}
                    </td>
                    <td>
                      <div>
                        <span>{formattedDoc}</span>
                        {normDoc && (
                          <small style={{ display: 'block', color: '#8ba3b5', fontSize: '12px' }}>
                            {isPj ? 'PJ' : 'PF'}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>{c.phone ?? '—'}</td>
                    <td>{[c.neighborhood, c.city].filter(Boolean).join(', ') || '—'}</td>
                    <td>{c.birthday ? new Date(c.birthday).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>
                      <div className="row-action-group">
                        <button className="rma-advance-btn" onClick={() => openEditForm(c)} title="Editar Cliente">
                          <Save size={14} /> Editar
                        </button>
                        <button className="rma-advance-btn" onClick={async () => {
                          const confirmed = window.confirm(`Deseja excluir o cliente "${c.name}"?`);
                          if (!confirmed) return;
                          try {
                            await onDelete(c.id);
                          } catch (error) {
                            window.alert(error instanceof Error ? error.message : 'Não foi possível excluir o cliente.');
                          }
                        }} title="Excluir Cliente" style={{ color: '#fca5a5' }}>
                          <Trash2 size={14} /> Excluir
                        </button>
                        <button className="rma-advance-btn" onClick={() => setProfileCustomerId(c.id)} title="Detalhes do Cliente">
                          <UserCircle size={14} /> Detalhes
                        </button>
                        <button className="rma-advance-btn" onClick={() => setHistoryCustomerId(c.id)} title="Histórico de Compras">
                          <History size={14} /> Histórico
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {historyCustomerId && (
        <div className="modal-backdrop" onClick={() => setHistoryCustomerId(null)}>
          <div className="modal-content customer-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Histórico de Compras & Serviços</h3>
              <button onClick={() => setHistoryCustomerId(null)}><X size={18} /></button>
            </div>
            {historyCustomer && (
              <div className="customer-info-block">
                <strong>{historyCustomer.name}</strong>
                <small>{historyCustomer.document ?? '—'} • {historyCustomer.phone ?? '—'}</small>
                <small>{historyCustomer.email ?? '—'}</small>
              </div>
            )}
            <div className="stock-table-wrap">
              <table className="rma-table">
                <thead><tr><th>Data</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>IMEI/Série</th></tr></thead>
                <tbody>
                  {historySales.length === 0 ? (
                    <tr><td colSpan={5} className="empty-row">Nenhuma compra registrada.</td></tr>
                  ) : (
                    historySales.map((s) => (
                      <tr key={s.id}>
                        <td>{new Date(s.created_at).toLocaleDateString('pt-BR')}</td>
                        <td>{s.items.map((i) => `${i.name} (${i.quantity})`).join(', ')}</td>
                        <td>{money.format(s.total)}</td>
                        <td>{s.payment_method ?? '—'}</td>
                        <td>{s.imei ?? s.serial_number ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {profileCustomerId && profileCustomer && (
        <CustomerProfileModal customer={profileCustomer} sales={sales} onUpdate={onUpdate} onClose={() => setProfileCustomerId(null)} />
      )}
    </div>
  );
}

type CustomerTab = 'cadastrais' | 'enderecos' | 'observacoes' | 'financeiros' | 'contatos' | 'historico';

function CustomerProfileModal({ customer, sales, onUpdate, onClose }: {
  customer: PartnerCustomer;
  sales: PartnerSale[];
  onUpdate: (id: string, updates: Partial<PartnerCustomer>) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<CustomerTab>('cadastrais');
  const [docType, setDocType] = useState<'pf' | 'pj'>(
    (customer.document ?? '').replace(/\D/g, '').length <= 11 ? 'pf' : 'pj'
  );
  const [ieIsento, setIeIsento] = useState(false);
  const [creditLimit, setCreditLimit] = useState(String(customer.credit_limit ?? 0));
  const [isSavingCreditLimit, setIsSavingCreditLimit] = useState(false);
  const [creditLimitError, setCreditLimitError] = useState<string | null>(null);
  const [allowCrediario, setAllowCrediario] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [adminLoja, setAdminLoja] = useState(false);
  const [convenio, setConvenio] = useState(false);
  const [simplesNacional, setSimplesNacional] = useState(false);
  const [reterISS, setReterISS] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  const customerSales = sales.filter((s) => s.customer_id === customer.id);
  const totalPurchases = customerSales.reduce((s, x) => s + x.total, 0);

  const tabs: { id: CustomerTab; label: string; icon: typeof UserCircle }[] = [
    { id: 'cadastrais', label: 'Dados Cadastrais', icon: IdCard },
    { id: 'enderecos', label: 'Outros Endereços', icon: MapPin },
    { id: 'observacoes', label: 'Observações', icon: FileText },
    { id: 'financeiros', label: 'Dados Financeiros', icon: Wallet },
    { id: 'contatos', label: 'Contatos', icon: Phone },
    { id: 'historico', label: 'Histórico de Compras & Notas Fiscais', icon: History },
  ];

  async function saveCreditLimit() {
    const parsedCreditLimit = Number(creditLimit);
    if (!Number.isFinite(parsedCreditLimit) || parsedCreditLimit < 0) {
      setCreditLimitError('Informe um limite de crédito válido.');
      return;
    }
    setIsSavingCreditLimit(true);
    setCreditLimitError(null);
    try {
      await onUpdate(customer.id, { credit_limit: parsedCreditLimit });
      onClose();
    } catch (error) {
      setCreditLimitError(error instanceof Error ? error.message : 'Não foi possível salvar o limite de crédito.');
    } finally {
      setIsSavingCreditLimit(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content customer-profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Perfil do Cliente — {customer.name}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {/* Avatar + basic info */}
        <div className="customer-profile-header">
          <div className="customer-avatar">
            <Camera size={24} />
            <small>Foto</small>
          </div>
          <div className="customer-profile-summary">
            <strong>{customer.name}</strong>
            <small>
              {customer.document
                ? (customer.person_type === 'PJ' || normalizeDocument(customer.document).length > 11
                    ? formatCnpj(customer.document)
                    : formatCpf(customer.document))
                : '—'}{' '}
              • {customer.customer_type === 'atacado' ? 'Atacado' : 'Varejo'}
            </small>
            <small>Total em compras: {money.format(totalPurchases)} ({customerSales.length} pedidos)</small>
          </div>
        </div>

        {/* Tabs */}
        <div className="subtab-bar customer-profile-tabs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`subtab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="customer-profile-body">
          {tab === 'cadastrais' && (
            <div className="rma-form">
              <div className="fiscal-doctype-toggle">
                <button type="button" className={`price-toggle-btn ${docType === 'pf' ? 'active' : ''}`} onClick={() => setDocType('pf')}>
                  <UserCircle size={15} /> Pessoa Física (PF)
                </button>
                <button type="button" className={`price-toggle-btn ${docType === 'pj' ? 'active' : ''}`} onClick={() => setDocType('pj')}>
                  <Building2 size={15} /> Pessoa Jurídica (PJ)
                </button>
              </div>
              <div className="form-row">
                <label>
                  <span className="social-label"><UserCircle size={14} /> {docType === 'pf' ? 'Nome Completo' : 'Razão Social'}</span>
                  <input defaultValue={customer.name} placeholder="Nome / Razão Social" />
                </label>
                <label>
                  <span className="social-label"><Building2 size={14} /> Nome Fantasia</span>
                  <input placeholder="Nome Fantasia (opcional)" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span className="social-label"><IdCard size={14} /> {docType === 'pf' ? 'CPF' : 'CNPJ'}</span>
                  <input
                    defaultValue={
                      customer.document
                        ? (docType === 'pj' ? formatCnpj(customer.document) : formatCpf(customer.document))
                        : ''
                    }
                    placeholder={docType === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'}
                  />
                </label>
                <label>
                  <span className="social-label"><IdCard size={14} /> Identidade RG</span>
                  <input placeholder="00.000.000-0" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span className="social-label"><FileText size={14} /> Inscrição Municipal</span>
                  <input placeholder="0000000" />
                </label>
                {docType === 'pj' ? (
                  <label>
                    <span className="social-label"><FileText size={14} /> Inscrição Estadual (IE)</span>
                    <input
                      value={ieIsento ? 'ISENTO' : ''}
                      onChange={(e) => { if (!ieIsento) {} }}
                      placeholder="000.000.000.000"
                      disabled={ieIsento}
                    />
                  </label>
                ) : (
                  <label>
                    <span className="social-label"><FileText size={14} /> Inscrição Estadual (IE)</span>
                    <input placeholder="000.000.000.000" />
                  </label>
                )}
                <label>
                  <span className="social-label"><FileText size={14} /> SUFRAMA ID</span>
                  <input placeholder="00000000" />
                </label>
              </div>
              {docType === 'pj' && (
                <label className="checkbox-label fiscal-isento-label">
                  <input type="checkbox" checked={ieIsento} onChange={(e) => setIeIsento(e.target.checked)} />
                  Isento de Inscrição Estadual
                </label>
              )}
              <div className="form-row">
                <label>
                  <span className="social-label"><UserCircle size={14} /> Sexo</span>
                  <select defaultValue="">
                    <option value="">Selecione...</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                    <option value="O">Outro</option>
                  </select>
                </label>
                <label>
                  <span className="social-label"><UserCircle size={14} /> Data de Nascimento</span>
                  <input type="date" defaultValue={customer.birthday ?? ''} />
                </label>
              </div>
            </div>
          )}

          {tab === 'enderecos' && (
            <div className="rma-form">
              <div className="form-row">
                <label>
                  <span className="social-label"><MapPin size={14} /> Logradouro</span>
                  <input defaultValue={customer.address ?? ''} placeholder="Rua / Avenida" />
                </label>
                <label>
                  <span className="social-label"><MapPin size={14} /> Número</span>
                  <input placeholder="Nº" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span className="social-label"><MapPin size={14} /> Bairro</span>
                  <input defaultValue={customer.neighborhood ?? ''} placeholder="Bairro" />
                </label>
                <label>
                  <span className="social-label"><MapPin size={14} /> CEP</span>
                  <input placeholder="00000-000" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span className="social-label"><MapPin size={14} /> UF</span>
                  <select defaultValue="AM">
                    <option value="AC">AC</option><option value="AL">AL</option><option value="AP">AP</option>
                    <option value="AM">AM</option><option value="BA">BA</option><option value="CE">CE</option>
                    <option value="DF">DF</option><option value="ES">ES</option><option value="GO">GO</option>
                    <option value="MA">MA</option><option value="MT">MT</option><option value="MS">MS</option>
                    <option value="MG">MG</option><option value="PA">PA</option><option value="PB">PB</option>
                    <option value="PR">PR</option><option value="PE">PE</option><option value="PI">PI</option>
                    <option value="RJ">RJ</option><option value="RN">RN</option><option value="RS">RS</option>
                    <option value="RO">RO</option><option value="RR">RR</option><option value="SC">SC</option>
                    <option value="SP">SP</option><option value="SE">SE</option><option value="TO">TO</option>
                  </select>
                </label>
                <label>
                  <span className="social-label"><MapPin size={14} /> Cidade</span>
                  <input defaultValue={customer.city ?? ''} placeholder="Manaus" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span className="social-label"><MapPin size={14} /> Complemento</span>
                  <input placeholder="Apto, casa, etc." />
                </label>
                <label>
                  <span className="social-label"><MapPin size={14} /> Ponto de Referência</span>
                  <input placeholder="Próximo a..." />
                </label>
              </div>
              <label>
                <span className="social-label"><MapPin size={14} /> País</span>
                <select defaultValue="BRASIL">
                  <option value="BRASIL">BRASIL</option>
                </select>
              </label>
            </div>
          )}

          {tab === 'observacoes' && (
            <div className="rma-form">
              <label>
                <span className="social-label"><FileText size={14} /> Observações do Cliente</span>
                <textarea defaultValue={customer.notes ?? ''} placeholder="Notas gerais sobre o cliente..." rows={4} />
              </label>
              <label>
                <span className="social-label"><FileText size={14} /> Aparelho / Modelo</span>
                <input defaultValue={customer.device_model ?? ''} placeholder="Ex: iPhone 11 — bateria" />
              </label>
            </div>
          )}

          {tab === 'financeiros' && (
            <div className="rma-form">
              <div className="form-row">
                <label>
                  <span className="social-label"><Wallet size={14} /> Grupo de Clientes</span>
                  <select defaultValue="varejo">
                    <option value="varejo">Varejo</option>
                    <option value="atacado">Atacado</option>
                    <option value="premium">Premium</option>
                  </select>
                </label>
                <label>
                  <span className="social-label"><UserCheck size={14} /> Vendedor Responsável</span>
                  <select defaultValue="">
                    <option value="">Selecione...</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span className="social-label"><Wallet size={14} /> Tabela de Preços Padrão</span>
                  <select defaultValue="varejo">
                    <option value="varejo">Varejo</option>
                    <option value="atacado">Atacado</option>
                  </select>
                </label>
                <label>
                  <span className="social-label"><Wallet size={14} /> Venda em Crediário</span>
                  <select value={allowCrediario ? 'sim' : 'nao'} onChange={(e) => setAllowCrediario(e.target.value === 'sim')}>
                    <option value="nao">Não Permitido</option>
                    <option value="sim">Permitido</option>
                  </select>
                </label>
              </div>
              <label>
                <span className="social-label"><Wallet size={14} /> Limite de Crédito (R$)</span>
                <input type="number" min="0" step="0.01" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="0,00" />
              </label>
              {creditLimitError && <p className="otp-error-msg">{creditLimitError}</p>}
              <div className="customer-compliance-grid">
                <label className="checkbox-label">
                  <input type="checkbox" checked={convenio} onChange={(e) => setConvenio(e.target.checked)} />
                  Ativar Vendas em Convênio
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={simplesNacional} onChange={(e) => setSimplesNacional(e.target.checked)} />
                  Cliente optante pelo Simples Nacional
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={reterISS} onChange={(e) => setReterISS(e.target.checked)} />
                  Reter ISS
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
                  Este Cliente está ativo
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={adminLoja} onChange={(e) => setAdminLoja(e.target.checked)} />
                  Este Cliente é Administrador da Loja Virtual
                </label>
              </div>
            </div>
          )}

          {tab === 'contatos' && (
            <div className="rma-form">
              <div className="form-row">
                <label>
                  <span className="social-label"><Phone size={14} /> Celular Principal</span>
                  <input defaultValue={customer.phone ?? ''} placeholder="(92) 99999-9999" />
                </label>
                <label>
                  <span className="social-label"><Phone size={14} /> Fone Comercial 1</span>
                  <input placeholder="(92) 3333-3333" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span className="social-label"><Phone size={14} /> Fone Comercial 2</span>
                  <input placeholder="(92) 3333-3334" />
                </label>
                <label>
                  <span className="social-label"><Mail size={14} /> E-mail</span>
                  <input type="email" defaultValue={customer.email ?? ''} placeholder="cliente@email.com" />
                </label>
              </div>
            </div>
          )}

          {tab === 'historico' && (
            <div className="customer-history-tab">
              {customerSales.length === 0 ? (
                <div className="fiscal-empty-state" style={{ padding: '24px' }}>
                  <History size={28} />
                  <p>Nenhuma compra registrada para este cliente.</p>
                </div>
              ) : (
                <div className="stock-table-wrap">
                  <table className="rma-table customer-history-table">
                    <thead>
                      <tr>
                        <th>Data da Compra</th>
                        <th>Nº do Pedido / Nota Fiscal</th>
                        <th>Tipo</th>
                        <th>Formas de Pagamento</th>
                        <th>Tabela</th>
                        <th>Atendimento</th>
                        <th>Valor Total (R$)</th>
                        <th>Status</th>
                        <th>Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(customerSales || []).map((s) => {
                        if (!s) return null;
                        const isExpanded = expandedSaleId === s.id;
                        const saleTotal = Number(s.total) || 0;
                        const docType = s.status === 'concluida' ? (saleTotal <= 1000 ? 'NFC-e' : 'NF-e') : 'Pré-venda';
                        const statusLabel = s.status === 'concluida' ? 'Concluída' : s.status === 'cancelada' ? 'Cancelada' : s.status === 'devolucao' ? 'Devolução' : 'Em Aberto';
                        const statusColor = s.status === 'concluida' ? '#5bbc87' : s.status === 'cancelada' ? '#e3829b' : s.status === 'devolucao' ? '#e6a06d' : '#5cb5f1';
                        const saleIdStr = s.id ? String(s.id) : '';
                        const displaySaleId = saleIdStr ? (saleIdStr.length > 8 ? saleIdStr.slice(0, 8) : saleIdStr) : '—';

                        return (
                          <React.Fragment key={s.id}>
                            <tr className={isExpanded ? 'expanded-row' : ''}>
                              <td>{s.created_at ? new Date(s.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                              <td><strong>#{displaySaleId.toUpperCase()}</strong></td>
                              <td><span className="rma-status-badge" style={{ color: statusColor, borderColor: statusColor }}>{docType}</span></td>
                              <td>{s.payment_method ?? '—'}</td>
                              <td>{s.customer_type === 'atacado' ? 'Atacado' : 'Varejo'}</td>
                              <td>{s.delivery_type === 'entrega' ? 'Entrega' : s.delivery_type === 'retirada' ? 'Retirada' : 'Balcão'}</td>
                              <td><strong>{money.format(saleTotal)}</strong></td>
                              <td><span className="rma-status-badge" style={{ color: statusColor, borderColor: statusColor }}>{statusLabel}</span></td>
                              <td>
                                <button className="rma-advance-btn" onClick={() => setExpandedSaleId(isExpanded ? null : s.id)} title={isExpanded ? 'Recolher' : 'Ver itens'}>
                                  {isExpanded ? <X size={14} /> : <History size={14} />}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="expanded-detail-row">
                                <td colSpan={9}>
                                  <div className="sale-detail-content">
                                    <div className="sale-detail-items">
                                      <h4>Itens Comprados</h4>
                                      <table className="rma-table sale-detail-inner-table">
                                        <thead><tr><th>Produto</th><th>Qtd</th><th>Preço Unit.</th><th>Subtotal</th></tr></thead>
                                        <tbody>
                                          {(s.items || []).map((item, idx) => (
                                            <tr key={idx}>
                                              <td>{item.name}</td>
                                              <td>{item.quantity}</td>
                                              <td>{money.format(item.unit_price)}</td>
                                              <td><strong>{money.format(item.unit_price * item.quantity)}</strong></td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div className="sale-detail-actions">
                                      <h4>Reenviar Documento Fiscal</h4>
                                      <div className="row-action-group">
                                        <button className="rma-advance-btn" title="Imprimir">
                                          <Printer size={14} /> Impressora
                                        </button>
                                        <button className="rma-advance-btn" title="Enviar por E-mail">
                                          <Mail size={14} /> E-mail
                                        </button>
                                        <button className="rma-advance-btn whatsapp-btn" title="Enviar por WhatsApp">
                                          <MessageCircle size={14} /> WhatsApp
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="fiscal-modal-actions">
          <button className="module-submit-btn" onClick={saveCreditLimit} disabled={isSavingCreditLimit}>
            <Save size={16} /> {isSavingCreditLimit ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuppliersSubTab({ suppliers, onAdd }: {
  suppliers: PartnerSupplier[];
  onAdd: (s: Omit<PartnerSupplier, 'id' | 'user_id' | 'created_at' | 'payable_balance'>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd({ name, phone: phone || null, notes: notes || null });
    setName(''); setPhone(''); setNotes('');
  }

  return (
    <div>
      <form className="rma-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Nome do Fornecedor
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: TechParts Distribuidora" required />
          </label>
          <label>
            Telefone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 3333-3333" />
          </label>
        </div>
        <label>
          Observações
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas sobre prazos, condições..." rows={2} />
        </label>
        <button type="submit" className="module-submit-btn"><Plus size={16} /> Adicionar fornecedor</button>
      </form>
      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Fornecedor</th><th>Telefone</th><th>Contas a Pagar</th></tr></thead>
          <tbody>
            {suppliers.length === 0 ? (
              <tr><td colSpan={3} className="empty-row">Nenhum fornecedor cadastrado.</td></tr>
            ) : (
              suppliers.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.phone ?? '—'}</td>
                  <td>{money.format(s.payable_balance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const roleLabels: Record<SalespersonRole, string> = {
  administrador: 'Administrador',
  gerente: 'Gerente',
  caixa: 'Caixa',
  vendedor: 'Vendedor / Balcão',
  tecnico: 'Técnico',
  atendente: 'Atendente',
  logistica: 'Logística / Entregador',
};

const roleColors: Record<SalespersonRole, string> = {
  administrador: '#5bbc87',
  gerente: '#c4a44a',
  caixa: '#5cb5f1',
  vendedor: '#55adf1',
  tecnico: '#e6a06d',
  atendente: '#5fd0a8',
  logistica: '#a78bfa',
};

function SalespeopleSubTab({ salespeople, branches, onAdd, onUpdate, onDelete }: {
  salespeople: PartnerSalesperson[];
  branches: PartnerBranch[];
  onAdd: (sp: Omit<PartnerSalesperson, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  onUpdate: (id: string, updates: Partial<PartnerSalesperson>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<SalespersonRole>('vendedor');
  const [branchId, setBranchId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editRole, setEditRole] = useState<SalespersonRole>('vendedor');
  const [editBranchId, setEditBranchId] = useState('');
  const [editActive, setEditActive] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd({
      name: name.trim(),
      commission_rate: Number(rate) || 0,
      active: true,
      pin: pin || null,
      role,
      branch_id: branchId || null,
      phone: null,
      email: null,
      is_active: true,
    });
    setName(''); setRate(''); setPin(''); setRole('vendedor'); setBranchId('');
  }

  function startEdit(s: PartnerSalesperson) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditRate(String(s.commission_rate));
    setEditPin(s.pin ?? '');
    setEditRole(s.role);
    setEditBranchId(s.branch_id ?? '');
    setEditActive(s.active ?? s.is_active ?? true);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    await onUpdate(id, {
      name: editName.trim(),
      commission_rate: Number(editRate) || 0,
      pin: editPin || null,
      role: editRole,
      branch_id: editBranchId || null,
      active: editActive,
      is_active: editActive,
    });
    setEditingId(null);
  }

  return (
    <div>
      <form className="rma-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Nome do Vendedor / Técnico
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João Silva" required />
          </label>
          <label>
            Taxa de Comissão (%)
            <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ex: 5" />
          </label>
          <label>
            PIN de Acesso
            <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4 dígitos" maxLength={4} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Função / Permissões
            <select value={role} onChange={(e) => setRole(e.target.value as SalespersonRole)}>
              <option value="administrador">Administrador (Acesso Total)</option>
              <option value="gerente">Gerente (Operacional & Vendas)</option>
              <option value="caixa">Caixa (Finalizar Vendas & Pré-Vendas)</option>
              <option value="vendedor">Vendedor / Balcão (PDV, Vendas, Clientes)</option>
              <option value="tecnico">Técnico (Apenas Ordens de Serviço)</option>
              <option value="atendente">Atendente (Atendimento e Pré-Vendas)</option>
              <option value="logistica">Logística / Entregador (Gestão de Entregas)</option>
            </select>
          </label>
          <label>
            Filial Vinculada
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Todas as Filiais (Acesso Livre / Admin)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="module-submit-btn"><Plus size={16} /> Adicionar Funcionário</button>
      </form>
      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Nome</th><th>Função</th><th>Filial Vinculada</th><th>Comissão</th><th>PIN</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {salespeople.length === 0 ? (
              <tr><td colSpan={7} className="empty-row">Nenhum vendedor cadastrado.</td></tr>
            ) : (
              salespeople.map((s) => {
                const spBranch = branches.find((b) => b.id === s.branch_id);
                return (
                  <tr key={s.id}>
                    {editingId === s.id ? (
                      <>
                        <td>
                          <input className="rma-edit-input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome" style={{ width: '100%' }} />
                        </td>
                        <td>
                          <select className="rma-edit-input" value={editRole} onChange={(e) => setEditRole(e.target.value as SalespersonRole)}>
                            <option value="administrador">Administrador</option>
                            <option value="gerente">Gerente</option>
                            <option value="caixa">Caixa</option>
                            <option value="vendedor">Vendedor / Balcão</option>
                            <option value="tecnico">Técnico</option>
                            <option value="atendente">Atendente</option>
                            <option value="logistica">Logística / Entregador</option>
                          </select>
                        </td>
                        <td>
                          <select className="rma-edit-input" value={editBranchId} onChange={(e) => setEditBranchId(e.target.value)}>
                            <option value="">Todas as Filiais</option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input className="rma-edit-input" type="number" step="0.01" value={editRate} onChange={(e) => setEditRate(e.target.value)} style={{ width: '60px' }} />
                        </td>
                        <td>
                          <input className="rma-edit-input" value={editPin} onChange={(e) => setEditPin(e.target.value)} placeholder="PIN" maxLength={4} style={{ width: '60px' }} />
                        </td>
                        <td>
                          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                            {editActive ? 'Ativo' : 'Inativo'}
                          </label>
                        </td>
                        <td>
                          <div className="row-action-group">
                            <button className="rma-advance-btn" onClick={() => saveEdit(s.id)} title="Salvar">
                              <Check size={14} />
                            </button>
                            <button className="rma-advance-btn" onClick={cancelEdit} title="Cancelar">
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td><strong>{s.name}</strong></td>
                        <td>
                          <span className="rma-status-badge" style={{ color: roleColors[s.role], borderColor: roleColors[s.role] }}>
                            {roleLabels[s.role]}
                          </span>
                        </td>
                        <td>{spBranch ? spBranch.name : <small style={{ color: '#889eaf' }}>Todas as filiais</small>}</td>
                        <td>{s.commission_rate}%</td>
                        <td>{s.pin ? '****' : '—'}</td>
                        <td>{s.active ?? s.is_active ? 'Ativo' : 'Inativo'}</td>
                        <td>
                          <div className="row-action-group">
                            <button className="rma-advance-btn" onClick={() => startEdit(s)} title="Editar">
                              <History size={14} />
                            </button>
                            <button className="rma-advance-btn danger" onClick={() => onDelete(s.id)} title="Excluir">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReplenishmentSubTab({ products, sales }: {
  products: PartnerProduct[];
  sales: PartnerSale[];
}) {
  const abcAnalysis = useMemo(() => {
    const completedSales = sales.filter((s) => s.status === 'concluida');
    const productStats: Record<string, { name: string; sku: string | null; stock: number; minStock: number; totalSold: number; revenue: number; isService: boolean }> = {};

    for (const product of products) {
      productStats[product.id] = {
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        minStock: product.min_stock,
        totalSold: 0,
        revenue: 0,
        isService: product.is_service,
      };
    }

    for (const sale of completedSales) {
      for (const item of sale.items) {
        if (productStats[item.product_id]) {
          productStats[item.product_id].totalSold += item.quantity;
          productStats[item.product_id].revenue += item.unit_price * item.quantity;
        }
      }
    }

    const ranked = Object.entries(productStats)
      .filter(([, s]) => !s.isService)
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = ranked.reduce((sum, r) => sum + r.revenue, 0) || 1;
    let cumulative = 0;
    const withClass = ranked.map((r) => {
      cumulative += r.revenue;
      const pct = (cumulative / totalRevenue) * 100;
      let abcClass: 'A' | 'B' | 'C' = 'C';
      if (pct <= 70) abcClass = 'A';
      else if (pct <= 90) abcClass = 'B';
      return { ...r, abcClass, cumulativePct: pct };
    });

    return withClass;
  }, [products, sales]);

  const lowStockHighDemand = abcAnalysis.filter(
    (p) => p.stock <= (p.minStock || 0) && p.totalSold > 0,
  );
  const criticalAlerts = abcAnalysis.filter(
    (p) => p.abcClass === 'A' && p.stock <= (p.minStock || 0),
  );
  const classA = abcAnalysis.filter((p) => p.abcClass === 'A');
  const classB = abcAnalysis.filter((p) => p.abcClass === 'B');
  const classC = abcAnalysis.filter((p) => p.abcClass === 'C');

  const abcColors: Record<string, string> = { A: '#5bbc87', B: '#e6a06d', C: '#6e8799' };

  return (
    <div>
      <div className="admin-permissions-info">
        <Activity size={16} />
        <span>
          Análise preditiva de reposição baseada na Curva ABC de vendas. Itens Classe A com estoque baixo são prioridade de reposição.
        </span>
      </div>

      {criticalAlerts.length > 0 && (
        <div className="replenishment-critical-banner">
          <AlertTriangle size={20} />
          <div>
            <strong>{criticalAlerts.length} produto(s) Classe A com estoque crítico!</strong>
            <span>Reponha urgentemente para não perder vendas de alto giro.</span>
          </div>
        </div>
      )}

      <div className="report-cards replenishment-kpi-grid">
        <div className="report-card">
          <small><TrendingUp size={13} /> Itens Classe A (Alto Giro)</small>
          <strong className="text-green">{classA.length}</strong>
          <small>70% da receita</small>
        </div>
        <div className="report-card">
          <small><Activity size={13} /> Itens Classe B (Médio Giro)</small>
          <strong style={{ color: '#e6a06d' }}>{classB.length}</strong>
          <small>20% da receita</small>
        </div>
        <div className="report-card">
          <small><Package size={13} /> Itens Classe C (Baixo Giro)</small>
          <strong style={{ color: '#6e8799' }}>{classC.length}</strong>
          <small>10% da receita</small>
        </div>
        <div className="report-card">
          <small><AlertTriangle size={13} /> Alertas de Reposição</small>
          <strong className="text-red">{lowStockHighDemand.length}</strong>
          <small>estoque baixo + demanda</small>
        </div>
      </div>

      <h4 className="report-section-title">
        <AlertTriangle size={16} /> Alertas de Reposição — Baixo Estoque & Alta Demanda
      </h4>
      {lowStockHighDemand.length === 0 ? (
        <p className="admin-empty-hint">Nenhum alerta de reposição no momento. Todos os produtos com demanda estão com estoque adequado.</p>
      ) : (
        <div className="stock-table-wrap">
          <table className="rma-table">
            <thead>
              <tr>
                <th>Produto</th><th>SKU</th><th>Classe ABC</th><th>Estoque</th><th>Mínimo</th><th>Vendidos</th><th>Receita</th><th>Recomendação</th>
              </tr>
            </thead>
            <tbody>
              {lowStockHighDemand.map((p) => {
                const suggestedQty = Math.max(p.totalSold, p.minStock * 2) - p.stock;
                return (
                  <tr key={p.id} className={p.abcClass === 'A' ? 'replenishment-row-critical' : ''}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.sku ?? '—'}</td>
                    <td>
                      <span className="rma-status-badge" style={{ color: abcColors[p.abcClass], borderColor: abcColors[p.abcClass] }}>
                        Classe {p.abcClass}
                      </span>
                    </td>
                    <td className="text-red"><strong>{p.stock}</strong></td>
                    <td>{p.minStock}</td>
                    <td>{p.totalSold}</td>
                    <td>{money.format(p.revenue)}</td>
                    <td>
                      <span className="replenishment-suggestion">
                        Repor {suggestedQty > 0 ? `+${suggestedQty}` : '—'} un.
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="report-section-title">
        <TrendingUp size={16} /> Análise Completa — Curva ABC de Vendas
      </h4>
      {abcAnalysis.length === 0 ? (
        <p className="admin-empty-hint">Nenhuma venda registrada para análise. Conclua vendas no PDV para gerar dados preditivos.</p>
      ) : (
        <div className="stock-table-wrap">
          <table className="rma-table">
            <thead>
              <tr>
                <th>Produto</th><th>SKU</th><th>Classe</th><th>Vendidos</th><th>Receita</th><th>% Acum.</th><th>Estoque</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {abcAnalysis.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.sku ?? '—'}</td>
                  <td>
                    <span className="rma-status-badge" style={{ color: abcColors[p.abcClass], borderColor: abcColors[p.abcClass] }}>
                      {p.abcClass}
                    </span>
                  </td>
                  <td>{p.totalSold}</td>
                  <td>{money.format(p.revenue)}</td>
                  <td>{p.cumulativePct.toFixed(1)}%</td>
                  <td>{p.stock}</td>
                  <td>
                    {p.stock === 0 ? (
                      <span className="rma-status-badge" style={{ color: '#e3829b', borderColor: '#e3829b' }}>Sem estoque</span>
                    ) : p.stock <= (p.minStock || 0) ? (
                      <span className="rma-status-badge" style={{ color: '#e6a06d', borderColor: '#e6a06d' }}>Baixo</span>
                    ) : (
                      <span className="rma-status-badge" style={{ color: '#5bbc87', borderColor: '#5bbc87' }}>OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
