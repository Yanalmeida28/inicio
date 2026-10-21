import { Component, type ReactNode } from 'react';

export class ModuleBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section role="alert" className="module-card">
      <h3>Não foi possível abrir este módulo</h3>
      <p>A conexão pode ter falhado ou uma atualização do aplicativo está disponível. Você pode acessar outro módulo ou atualizar para tentar novamente.</p>
      <button type="button" className="rma-advance-btn" onClick={() => window.location.reload()}>Atualizar aplicativo</button>
    </section>;
    return this.props.children;
  }
}
