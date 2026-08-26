import { useState } from 'react';
import {
  ArrowRightCircle, Camera, FileText, Package, Printer, QrCode, Upload,
  Wallet, X, Pencil, Trash2, AlertCircle,
} from 'lucide-react';
import type { RmaRequest, RmaStatus, SalespersonRole } from '../../types';
import { rmaStatusLabels, rmaStatusColors, rmaStatusFlow } from '../../data';
import { money } from '../../utils';

type RmaModuleProps = {
  rmaRequests: RmaRequest[];
  walletBalance: number;
  warrantyTerms: string;
  currentRole: SalespersonRole;
  onCreate: (rma: Omit<RmaRequest, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'>) => void;
  onUpdateStatus: (id: string, status: RmaStatus) => void;
  onDelete: (id: string) => Promise<void>;
};

const deleteAllowedRoles: SalespersonRole[] = ['administrador', 'gerente'];

export function RmaModule({
  rmaRequests, walletBalance, warrantyTerms, currentRole, onCreate, onUpdateStatus, onDelete,
}: RmaModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [productName, setProductName] = useState('');
  const [productSku, setProductSku] = useState('');
  const [batchOrOrder, setBatchOrOrder] = useState('');
  const [defect, setDefect] = useState('');
  const [mediaName, setMediaName] = useState('');
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const [labelRmaId, setLabelRmaId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editProductSku, setEditProductSku] = useState('');
  const [editBatchOrOrder, setEditBatchOrOrder] = useState('');
  const [editDefect, setEditDefect] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const canDelete = deleteAllowedRoles.includes(currentRole);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productName.trim() || !productSku.trim() || !batchOrOrder.trim() || !defect.trim()) return;
    onCreate({
      product_name: productName,
      product_sku: productSku,
      batch_or_order: batchOrOrder,
      defect_description: defect,
      media_url: mediaName || null,
    });
    setProductName(''); setProductSku(''); setBatchOrOrder(''); setDefect(''); setMediaName('');
    setBeforePhoto(null); setAfterPhoto(null);
    setShowForm(false);
  }

  function handleMediaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setMediaName(file.name);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string | null) => void) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(reader.result as string);
    reader.readAsDataURL(file);
  }

  function advanceStatus(rma: RmaRequest) {
    const idx = rmaStatusFlow.indexOf(rma.status);
    if (idx < 0 || idx >= rmaStatusFlow.length - 1) return;
    onUpdateStatus(rma.id, rmaStatusFlow[idx + 1]);
  }

  function startEdit(rma: RmaRequest) {
    setEditingId(rma.id);
    setEditProductName(rma.product_name);
    setEditProductSku(rma.product_sku);
    setEditBatchOrOrder(rma.batch_or_order);
    setEditDefect(rma.defect_description);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit(id: string) {
    onUpdateStatus(id, rmaRequests.find((r) => r.id === id)?.status ?? 'aguardando_troca');
    setEditingId(null);
  }

  async function confirmDelete(id: string) {
    await onDelete(id);
    setDeleteConfirmId(null);
  }

  const labelRma = rmaRequests.find((r) => r.id === labelRmaId);

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Package size={20} /></span>
        <div>
          <h3>RMA / Devoluções & Ordens de Serviço</h3>
          <p>Registre itens defeituosos, acompanhe status e imprima etiquetas</p>
        </div>
      </div>

      <div className="rma-wallet-card">
        <div className="wallet-icon"><Wallet size={24} /></div>
        <div>
          <small>Saldo disponível em garantias aprovadas</small>
          <strong>{money.format(walletBalance)}</strong>
        </div>
        <span className="wallet-hint">Valor abatido automaticamente em futuros pedidos</span>
      </div>

      {warrantyTerms && (
        <div className="warranty-terms-box">
          <FileText size={18} />
          <div>
            <strong>Termos de Garantia (exibido na impressão de O.S.)</strong>
            <p>{warrantyTerms}</p>
          </div>
        </div>
      )}

      <button className="module-action-btn" onClick={() => setShowForm(!showForm)}>
        {showForm ? 'Cancelar' : <><FileText size={16} /> Nova Solicitação de Garantia</>}
      </button>

      {showForm && (
        <form className="rma-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Produto
              <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Ex: Display Moto G8 Power" required />
            </label>
            <label>
              SKU
              <input value={productSku} onChange={(e) => setProductSku(e.target.value)} placeholder="Ex: DH-MG8-012" required />
            </label>
          </div>
          <label>
            Número do Lote/Pedido
            <input value={batchOrOrder} onChange={(e) => setBatchOrOrder(e.target.value)} placeholder="Ex: PED-2024-0891" required />
          </label>
          <label>
            Descrição do Defeito
            <textarea value={defect} onChange={(e) => setDefect(e.target.value)} placeholder="Descreva o problema encontrado..." rows={3} required />
          </label>
          <label className="upload-label">
            Foto/Vídeo do Defeito
            <div className="media-upload">
              <Upload size={18} />
              <span>{mediaName || 'Anexar foto ou vídeo'}</span>
              <input type="file" accept="image/*,video/*" onChange={handleMediaChange} hidden />
            </div>
          </label>

          <div className="form-row">
            <label className="photo-upload-label">
              <span><Camera size={15} /> Foto do Aparelho Entrada (Antes)</span>
              <div className="photo-upload-area">
                {beforePhoto ? (
                  <div className="photo-preview">
                    <img src={beforePhoto} alt="Antes" />
                    <button type="button" onClick={() => setBeforePhoto(null)}><X size={14} /></button>
                  </div>
                ) : (
                  <label className="photo-placeholder">
                    <Camera size={24} />
                    <span>Foto de entrada</span>
                    <small>Documente defeitos pré-existentes</small>
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoChange(e, setBeforePhoto)} hidden />
                  </label>
                )}
              </div>
            </label>
            <label className="photo-upload-label">
              <span><Camera size={15} /> Foto do Aparelho Saída (Depois)</span>
              <div className="photo-upload-area">
                {afterPhoto ? (
                  <div className="photo-preview">
                    <img src={afterPhoto} alt="Depois" />
                    <button type="button" onClick={() => setAfterPhoto(null)}><X size={14} /></button>
                  </div>
                ) : (
                  <label className="photo-placeholder">
                    <Camera size={24} />
                    <span>Foto de saída</span>
                    <small>Documente a qualidade da entrega</small>
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoChange(e, setAfterPhoto)} hidden />
                  </label>
                )}
              </div>
            </label>
          </div>

          <button type="submit" className="module-submit-btn">Enviar solicitação</button>
        </form>
      )}

      <div className="rma-table-wrap">
        <table className="rma-table">
          <thead>
            <tr><th>Produto</th><th>Lote/Pedido</th><th>Status</th><th>Etiqueta</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {rmaRequests.length === 0 ? (
              <tr><td colSpan={5} className="empty-row">Nenhuma solicitação de garantia registrada.</td></tr>
            ) : (
              rmaRequests.map((rma) => (
                <tr key={rma.id}>
                  {editingId === rma.id ? (
                    <>
                      <td>
                        <input className="rma-edit-input" value={editProductName} onChange={(e) => setEditProductName(e.target.value)} placeholder="Produto" style={{ width: '100%' }} />
                        <input className="rma-edit-input" value={editProductSku} onChange={(e) => setEditProductSku(e.target.value)} placeholder="SKU" style={{ width: '100%', marginTop: '4px' }} />
                      </td>
                      <td>
                        <input className="rma-edit-input" value={editBatchOrOrder} onChange={(e) => setEditBatchOrOrder(e.target.value)} placeholder="Lote/Pedido" style={{ width: '100%' }} />
                      </td>
                      <td>
                        <span className="rma-status-badge" style={{ color: rmaStatusColors[rma.status], borderColor: rmaStatusColors[rma.status] }}>
                          {rmaStatusLabels[rma.status]}
                        </span>
                      </td>
                      <td>—</td>
                      <td>
                        <div className="row-action-group">
                          <button className="rma-advance-btn" onClick={() => saveEdit(rma.id)} title="Salvar">
                            <FileText size={14} /> Salvar
                          </button>
                          <button className="rma-advance-btn" onClick={cancelEdit} title="Cancelar">
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <strong>{rma.product_name}</strong>
                        <small>SKU {rma.product_sku}</small>
                      </td>
                      <td>{rma.batch_or_order}</td>
                      <td>
                        <span className="rma-status-badge" style={{ color: rmaStatusColors[rma.status], borderColor: rmaStatusColors[rma.status] }}>
                          {rmaStatusLabels[rma.status]}
                        </span>
                      </td>
                      <td>
                        <button className="rma-advance-btn" onClick={() => setLabelRmaId(rma.id)} title="Imprimir Etiqueta">
                          <QrCode size={14} /> Etiqueta
                        </button>
                      </td>
                      <td>
                        <div className="row-action-group">
                          {rma.status !== 'credito_gerado' && (
                            <button className="rma-advance-btn" onClick={() => advanceStatus(rma)} title="Avançar Status">
                              <ArrowRightCircle size={13} /> Avançar
                            </button>
                          )}
                          <button className="rma-advance-btn" onClick={() => startEdit(rma)} title="Editar">
                            <Pencil size={14} />
                          </button>
                          {canDelete && (
                            <>
                              {deleteConfirmId === rma.id ? (
                                <button className="rma-advance-btn danger" onClick={() => confirmDelete(rma.id)} title="Confirmar exclusão">
                                  <AlertCircle size={14} /> Confirmar
                                </button>
                              ) : (
                                <button className="rma-advance-btn danger" onClick={() => setDeleteConfirmId(rma.id)} title="Excluir">
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </>
                          )}
                          {deleteConfirmId === rma.id && (
                            <button className="rma-advance-btn" onClick={() => setDeleteConfirmId(null)} title="Cancelar exclusão">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!canDelete && (
        <div className="rma-delete-restricted">
          <AlertCircle size={14} />
          <span>Exclusão de solicitações restrita a Administrador e Gerente.</span>
        </div>
      )}

      {labelRmaId && labelRma && (
        <div className="modal-backdrop" onClick={() => setLabelRmaId(null)}>
          <div className="modal-content thermal-label-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Imprimir Etiqueta de O.S.</h3>
              <button onClick={() => setLabelRmaId(null)}><X size={18} /></button>
            </div>
            <div className="thermal-label-preview size-58">
              <div className="thermal-label-content">
                <div className="thermal-qr-area">
                  <QrCode size={48} />
                </div>
                <div className="thermal-label-info">
                  <strong>{labelRma.product_name}</strong>
                  <small>SKU: {labelRma.product_sku}</small>
                  <small>O.S.: {labelRma.batch_or_order}</small>
                </div>
              </div>
            </div>
            <button className="module-submit-btn" onClick={() => window.print()}>
              <Printer size={16} /> Imprimir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
