import { useState } from 'react';
import { Building2, CheckCircle2, Lock, MapPin, Plus } from 'lucide-react';
import type { PartnerBranch } from '../../types';

type MultiStoreModuleProps = {
  branches: PartnerBranch[];
  selectedBranchId: string | null;
  onSelectBranch: (id: string) => void;
  onAddBranch: (name: string, address: string) => void;
  isEmployeeLocked?: boolean;
  lockedBranchName?: string;
};

export function MultiStoreModule({
  branches, selectedBranchId, onSelectBranch, onAddBranch,
  isEmployeeLocked = false, lockedBranchName,
}: MultiStoreModuleProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (isEmployeeLocked) {
      window.alert('Funcionários não têm permissão para adicionar novas filiais.');
      return;
    }
    if (!newName.trim() || !newAddress.trim()) return;
    onAddBranch(newName, newAddress);
    setNewName(''); setNewAddress(''); setShowAddForm(false);
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
            <button
              key={branch.id}
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
    </div>
  );
}
