import { useState } from 'react';
import { CheckCircle2, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ActionsMenu } from './SaleActionsMenu';
import type { PartnerBranch } from '../../types';

type MultiStoreModuleProps = {
  branches: PartnerBranch[];
  selectedBranchId: string | null;
  onAddBranch: (name: string, address: string) => Promise<void>;
  onUpdateBranch: (id: string, name: string, address: string) => Promise<void>;
  onDeleteBranch: (id: string) => Promise<void>;
};

export function MultiStoreModule({
  branches, selectedBranchId, onAddBranch, onUpdateBranch, onDeleteBranch,
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
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newAddress.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await onAddBranch(newName, newAddress);
      setNewName(''); setNewAddress(''); setShowAddForm(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível salvar a filial.');
    } finally {
      setSaving(false);
    }
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
    setError(null);
    try {
      const formattedAddress = [
        editAddress.trim(), editNumber.trim(), editNeighborhood.trim(),
        [editCity.trim(), editState.trim()].filter(Boolean).join('/'), editCep.trim(),
      ].filter(Boolean).join(' - ');
      await onUpdateBranch(editingBranch.id, editName.trim(), formattedAddress);
      setEditingBranch(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível salvar as alterações da filial.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(branch: PartnerBranch) {
    if (!window.confirm(`Tem certeza que deseja excluir a filial '${branch.name}'?`)) return;
    setDeletingBranchId(branch.id);
    setError(null);
    try {
      await onDeleteBranch(branch.id);
      setEditingBranch(null);
    } catch (error) {
      const databaseError = error as { code?: string; message?: string };
      setError(databaseError.code === '23503'
        ? 'Não é possível excluir esta filial porque existem registros vinculados a ela. Para preservar o histórico, mantenha a filial cadastrada.'
        : databaseError.message ?? 'Não foi possível excluir a filial. Tente novamente.');
    } finally {
      setDeletingBranchId(null);
    }
  }

  return (
    <section className="branch-management" aria-label="Gerenciar filiais">
      <div className="branch-selector">
        <p>Cadastre, edite ou exclua suas filiais. Para trocar a filial ativa, use o seletor no topo do painel.</p>
        <div className="branch-cards">
          {branches.map((branch) => (
            <div key={branch.id} className={`branch-card branch-card-container ${selectedBranchId === branch.id ? 'active' : ''}`}>
            <div
              className="branch-card-select"
            >
              <MapPin size={15} />
              <div>
                <strong>{branch.name}</strong>
                <small>{branch.address}</small>
              </div>
              {selectedBranchId === branch.id && (
                <CheckCircle2 size={16} className="branch-check" />
              )}
            </div>
              <ActionsMenu
                label={`Ações da filial ${branch.name}`}
                disabled={Boolean(deletingBranchId)}
                actions={[
                  { label: 'Editar filial', icon: Pencil, run: () => startEdit(branch) },
                  { label: 'Excluir filial', icon: Trash2, run: () => { void handleDelete(branch); } },
                ]}
              />
            </div>
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
          <button type="submit" className="module-submit-btn" disabled={saving}>{saving ? 'Salvando...' : 'Adicionar filial'}</button>
        </form>
      )}


      {error && <p className="branch-action-error" role="alert">{error}</p>}

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
    </section>
  );
}
