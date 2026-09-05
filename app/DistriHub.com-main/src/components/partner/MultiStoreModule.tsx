import { Fragment, useState } from 'react';
import { Building2, CheckCircle2, Lock, MapPin, Pencil, Plus, X } from 'lucide-react';
import type { PartnerBranch } from '../../types';

type MultiStoreModuleProps = {
  branches: PartnerBranch[];
  selectedBranchId: string | null;
  onSelectBranch: (id: string) => void;
  onAddBranch: (name: string, address: string) => Promise<void>;
  onUpdateBranch: (id: string, name: string, address: string) => Promise<void>;
  isEmployeeLocked?: boolean;
  lockedBranchName?: string;
};

export function MultiStoreModule({
  branches, selectedBranchId, onSelectBranch, onAddBranch, onUpdateBranch,
  isEmployeeLocked = false, lockedBranchName,
}: MultiStoreModuleProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [editingBranch, setEditingBranch] = useState<PartnerBranch | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editNeighborhood, setEditNeighborhood] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editCep, setEditCep] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (isEmployeeLocked) {
      window.alert('Funcionários não têm permissão para adicionar novas filiais.');
      return;
    }
    if (!newName.trim() || !newAddress.trim()) return;
    await onAddBranch(newName, newAddress);
    setNewName(''); setNewAddress(''); setShowAddForm(false);
  }

  function startEdit(branch: PartnerBranch) {
    setEditingBranch(branch);
    setEditName(branch.name);
    setEditAddress(branch.address ?? '');
    setEditNumber('');
    setEditNeighborhood('');
    setEditCity('');
    setEditState('');
    setEditCep('');
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBranch || !editName.trim() || !editAddress.trim()) return;
    setSaving(true);
    try {
      const formattedAddress = [
        editAddress.trim(), editNumber.trim(), editNeighborhood.trim(),
        [editCity.trim(), editState.trim()].filter(Boolean).join('/'), editCep.trim(),
      ].filter(Boolean).join(' - ');
      await onUpdateBranch(editingBranch.id, editName.trim(), formattedAddress);
      setEditingBranch(null);
    } finally {
      setSaving(false);
    }
  }

  const allBranches = isEmployeeLocked
    ? branches.filter((b) => b.id === selectedBranchId)
    : [
        { id: 'consolidado', name: 'Visão Consolidada', address: 'Todas as filiais', is_active: true },
        ...branches,
      ];

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Building2 size={20} /></span>
        <div>
          <h3>Seletor de Filiais</h3>
          <p>
            {isEmployeeLocked
              ? `Filial fixa atribuída ao seu usuário (${lockedBranchName ?? 'Filial Vinculada'})`
              : 'Alterne entre lojas individuais ou visão consolidada'}
          </p>
        </div>
      </div>

      {isEmployeeLocked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '6px', background: 'rgba(59,155,237,0.1)', border: '1px solid rgba(59,155,237,0.3)', color: '#5cb5f1', fontSize: '13px', fontWeight: 600 }}>
          <Lock size={16} />
          <span>Acesso de Funcionário: Operando estritamente na filial {lockedBranchName ?? ''}. Troca de filial desativada.</span>
        </div>
      )}

      <div className="branch-selector">
        <span className="branch-selector-label">Filial ativa:</span>
        <div className="branch-cards">
          {allBranches.map((branch) => (
            <Fragment key={branch.id}>
            <button
              className={`branch-card ${selectedBranchId === branch.id || (branch.id === 'consolidado' && !selectedBranchId) ? 'active' : ''}`}
              disabled={isEmployeeLocked}
              onClick={() => {
                if (isEmployeeLocked) return;
                branch.id === 'consolidado' ? onSelectBranch('') : onSelectBranch(branch.id);
              }}
              style={isEmployeeLocked ? { cursor: 'default' } : undefined}
            >
              <MapPin size={15} />
              <div>
                <strong>{branch.name}</strong>
                <small>{branch.address}</small>
              </div>
              {(selectedBranchId === branch.id || (branch.id === 'consolidado' && !selectedBranchId)) && (
                <CheckCircle2 size={16} className="branch-check" />
              )}
            </button>
            {branch.id !== 'consolidado' && !isEmployeeLocked && (
              <button type="button" className="branch-edit-btn" onClick={() => startEdit(branch)} title={`Editar filial ${branch.name}`}>
                <Pencil size={14} /> Editar
              </button>
            )}
            </Fragment>
          ))}
          {!isEmployeeLocked && branches.length < 4 && (
            <button className="branch-card add" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus size={18} />
              <span>{showAddForm ? 'Cancelar' : 'Nova filial'}</span>
            </button>
          )}
        </div>
      </div>

      {!isEmployeeLocked && showAddForm && (
        <form className="rma-form" onSubmit={handleAdd}>
          <div className="form-row">
            <label>
              Nome da filial
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Loja 3 - Zona Sul" required />
            </label>
            <label>
              Endereço
              <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="Ex: Rua X, 123 - São Paulo/SP" required />
            </label>
          </div>
          <button type="submit" className="module-submit-btn">Adicionar filial</button>
        </form>
      )}

      {editingBranch && (
        <div className="modal-overlay" onClick={() => setEditingBranch(null)}>
          <form className="modal-card branch-edit-modal rma-form" onSubmit={handleEdit} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h4>Editar filial</h4>
              <button type="button" className="modal-close" onClick={() => setEditingBranch(null)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <label>Nome da filial<input value={editName} onChange={(event) => setEditName(event.target.value)} required /></label>
              <label>Endereço<input value={editAddress} onChange={(event) => setEditAddress(event.target.value)} placeholder="Rua ou avenida" required /></label>
              <div className="form-row">
                <label>Número<input value={editNumber} onChange={(event) => setEditNumber(event.target.value)} placeholder="123" /></label>
                <label>Bairro<input value={editNeighborhood} onChange={(event) => setEditNeighborhood(event.target.value)} placeholder="Centro" /></label>
              </div>
              <div className="form-row">
                <label>Cidade<input value={editCity} onChange={(event) => setEditCity(event.target.value)} placeholder="São Paulo" /></label>
                <label>UF<input value={editState} onChange={(event) => setEditState(event.target.value.toUpperCase().slice(0, 2))} placeholder="SP" maxLength={2} /></label>
                <label>CEP<input value={editCep} onChange={(event) => setEditCep(event.target.value)} placeholder="00000-000" /></label>
              </div>
              <div className="branch-edit-actions">
                <button type="button" className="rma-advance-btn" onClick={() => setEditingBranch(null)}>Cancelar</button>
                <button type="submit" className="module-submit-btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
