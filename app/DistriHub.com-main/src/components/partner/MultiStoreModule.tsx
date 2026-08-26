import { useState } from 'react';
import { Building2, CheckCircle2, MapPin, Plus } from 'lucide-react';
import type { PartnerBranch } from '../../types';

type MultiStoreModuleProps = {
  branches: PartnerBranch[];
  selectedBranchId: string | null;
  onSelectBranch: (id: string) => void;
  onAddBranch: (name: string, address: string) => void;
};

export function MultiStoreModule({
  branches, selectedBranchId, onSelectBranch, onAddBranch,
}: MultiStoreModuleProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newAddress.trim()) return;
    onAddBranch(newName, newAddress);
    setNewName(''); setNewAddress(''); setShowAddForm(false);
  }

  const allBranches = [
    { id: 'consolidado', name: 'Visão Consolidada', address: 'Todas as filiais', is_active: true },
    ...branches,
  ];

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Building2 size={20} /></span>
        <div>
          <h3>Seletor de Filiais</h3>
          <p>Alterne entre lojas individuais ou visão consolidada</p>
        </div>
      </div>

      <div className="branch-selector">
        <span className="branch-selector-label">Filial ativa:</span>
        <div className="branch-cards">
          {allBranches.map((branch) => (
            <button
              key={branch.id}
              className={`branch-card ${selectedBranchId === branch.id || (branch.id === 'consolidado' && !selectedBranchId) ? 'active' : ''}`}
              onClick={() => branch.id === 'consolidado' ? onSelectBranch('') : onSelectBranch(branch.id)}
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
          {branches.length < 4 && (
            <button className="branch-card add" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus size={18} />
              <span>{showAddForm ? 'Cancelar' : 'Nova filial'}</span>
            </button>
          )}
        </div>
      </div>

      {showAddForm && (
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
