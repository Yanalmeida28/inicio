import { Building2, Lock } from 'lucide-react';
import type { PartnerBranch } from '../../types';

type Props = {
  branches: PartnerBranch[];
  selectedBranchId: string;
  onSelectBranch: (id: string) => void;
  isEmployeeLocked: boolean;
  lockedBranchName?: string;
};

export function BranchSelector({ branches, selectedBranchId, onSelectBranch, isEmployeeLocked, lockedBranchName }: Props) {
  const options = isEmployeeLocked ? branches.filter(branch => branch.id === selectedBranchId) : branches;
  return <div className="panel-module branch-toolbar partner-branch-topbar">
    <div className="branch-toolbar-selection">
      <Building2 size={18} aria-hidden="true" />
      <label htmlFor="active-partner-branch">Filial ativa</label>
      <select id="active-partner-branch" value={selectedBranchId} disabled={isEmployeeLocked} onChange={event => onSelectBranch(event.target.value)}>
        {!isEmployeeLocked && <option value="">Visão Consolidada — Todas as filiais</option>}
        {isEmployeeLocked && options.length === 0 && <option value={selectedBranchId}>{lockedBranchName ?? 'Filial vinculada'}</option>}
        {options.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select>
      {isEmployeeLocked && <span className="branch-toolbar-locked"><Lock size={14} /> Filial fixa</span>}
    </div>
  </div>;
}
