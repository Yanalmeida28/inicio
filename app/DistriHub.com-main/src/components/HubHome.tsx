import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CircleDollarSign,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Wrench,
  Layers,
  Zap,
  Cpu,
  LogIn,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';

type HubHomeProps = {
  onAccessPanel: () => void;
  onAccessSuperAdmin: () => void;
  superAdminActive?: boolean;
};

export function HubHome({ onAccessPanel, onAccessSuperAdmin, superAdminActive }: HubHomeProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  function openPanel() {
    setMenuOpen(false);
    onAccessPanel();
  }

  return (
    <main className="hub-home">
      <header className="hub-header">
        <div className="page-container hub-header-inner">
          <a className="brand-logo" href="#inicio" aria-label="DistriHub início">
            <span className="brand-mark">
              <span /> <span />
            </span>
            <span>
              Distri<span>Hub</span>
            </span>
          </a>
          <nav className={`hub-nav ${menuOpen ? 'open' : ''}`}>
            <a href="#solucoes" onClick={() => setMenuOpen(false)}>Soluções</a>
            <a href="#modulos" onClick={() => setMenuOpen(false)}>Módulos</a>
            <a href="#migracao" onClick={() => setMenuOpen(false)}>Migração</a>
            <a href="#planos" onClick={() => setMenuOpen(false)}>Planos</a>
          </nav>
          <div className="hub-header-actions">
            <button className="hub-login-btn secondary" onClick={openPanel}>
              <LogIn size={16} /> Entrar
            </button>
            <button className="hub-login-btn" onClick={openPanel}>Agendar demonstração</button>
            <button
              className={`hub-super-admin-btn ${superAdminActive ? 'active' : ''}`}
              onClick={onAccessSuperAdmin}
              title="Acesso restrito ao administrador master do sistema"
            >
              <ShieldCheck size={16} /> {superAdminActive ? 'Painel Master' : 'Super Admin'}
            </button>
          </div>
          <button className="hub-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menu">
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      <section className="hub-hero">
        <div className="page-container hub-hero-inner">
          <div className="hub-hero-copy">
            <div className="eyebrow">
              <Sparkles size={14} /> Gestão B2B e ERP multiempresa em tempo real
            </div>
            <h1>
              Unifique sua operação em um único
              <br />
              <em>hub de crescimento.</em>
            </h1>
            <p>
              Controle estoque, vendas, financeiro e assistência técnica sem planilhas. A DistriHub
              conecta distribuidoras, lojistas e filiais para sua equipe vender mais e operar melhor.
            </p>
            <div className="hub-proof"><span className="hub-proof-stars">★★★★★</span><strong>4.9/5 por operações B2B</strong><span>•</span><span>Implantação assistida</span></div>
          </div>
          <div className="hub-hero-visual">
            <div className="hub-orb hub-orb-1" /><div className="hub-orb hub-orb-2" />
            <div className="hub-dashboard-card">
              <div className="hub-dashboard-top"><span><i /> LIVE • VISÃO CONSOLIDADA</span><span>Hoje, 09:42</span></div>
              <div className="hub-dashboard-title"><div><small>Receita total</small><strong>R$ 284.920,00</strong></div><span className="hub-growth">+18,4%</span></div>
              <div className="hub-chart"><span style={{ height: '32%' }} /><span style={{ height: '46%' }} /><span style={{ height: '39%' }} /><span style={{ height: '63%' }} /><span style={{ height: '55%' }} /><span style={{ height: '78%' }} /><span style={{ height: '92%' }} /></div>
              <div className="hub-dashboard-stats"><div><small>Pedidos hoje</small><strong>148</strong></div><div><small>Estoque disponível</small><strong>12.480</strong></div><div><small>Filiais online</small><strong>04/04</strong></div></div>
              <div className="hub-transfer"><span><PackageCheck size={16} /> Transferência aprovada</span><strong>45 un. <small>Centro → Zona Sul</small></strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="hub-stats-strip">
        <div className="page-container hub-stats-grid"><div><strong>12.480+</strong><span>itens controlados</span></div><div><strong>99,9%</strong><span>disponibilidade</span></div><div><strong>&lt; 1s</strong><span>tempo de resposta</span></div><div><strong>100%</strong><span>rastreabilidade</span></div></div>
      </section>

      <section id="solucoes" className="hub-features">
        <div className="page-container">
          <div className="hub-section-head">
            <div className="eyebrow">SOLUÇÕES POR OPERAÇÃO</div>
            <h2>Um sistema para cada etapa do seu negócio</h2>
            <p>Do pedido B2B ao pós-venda, tudo conectado em uma única operação</p>
          </div>
          <div className="hub-feature-grid">
            <div className="hub-feature">
              <Layers size={24} />
              <h4>Distribuição B2B</h4>
              <p>Catálogo por cliente, tabelas de preço e pedidos centralizados para vender no atacado.</p>
            </div>
            <div className="hub-feature">
              <Zap size={24} />
              <h4>PDV ultrarrápido</h4>
              <p>Venda no balcão com busca instantânea, controle de IMEI e operação mesmo com instabilidade.</p>
            </div>
            <div className="hub-feature">
              <Building2 size={24} />
              <h4>Multiempresa e filiais</h4>
              <p>Tenha visão consolidada, estoque cruzado e permissões por unidade sem duplicar trabalho.</p>
            </div>
            <div className="hub-feature">
              <ShieldCheck size={24} />
              <h4>Garantia e RMA</h4>
              <p>Rastreie IMEI, série, selo e fotos para reduzir perdas e transformar trocas em crédito.</p>
            </div>
            <div className="hub-feature">
              <Wrench size={24} />
              <h4>Fiscal sem retrabalho</h4>
              <p>Importe XML de NF-e, atualize custos e mantenha sua operação pronta para a emissão fiscal.</p>
            </div>
            <div className="hub-feature">
              <PackageCheck size={24} />
              <h4>Checkout B2B</h4>
              <p>PIX, cartão, faturado ou crédito de RMA com logística local e acompanhamento do pedido.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="migracao" className="hub-migration">
        <div className="page-container hub-migration-inner"><div><div className="eyebrow"><Zap size={14} /> MIGRAÇÃO SEM PARAR A OPERAÇÃO</div><h2>Troque a planilha por uma operação que acompanha seu ritmo.</h2><p>Importe clientes, fornecedores e estoque com apoio especializado. Sua equipe começa rápido, com dados organizados e histórico preservado.</p><button className="hub-outline-button" onClick={openPanel}>Falar com especialista <ArrowRight size={15} /></button></div><div className="hub-steps"><div><b>01</b><span><strong>Importação inteligente</strong><small>Excel, CSV e XML de NF-e com validação.</small></span></div><div><b>02</b><span><strong>Configuração por perfil</strong><small>Menus, permissões e módulos sob medida.</small></span></div><div><b>03</b><span><strong>Equipe em operação</strong><small>Treinamento e acompanhamento na virada.</small></span></div></div></div>
      </section>

      <section id="modulos" className="hub-modules">
        <div className="page-container"><div className="hub-section-head"><div className="eyebrow">MÓDULOS CONFIGURÁVEIS</div><h2>Ative o que sua operação precisa</h2><p>O menu se adapta ao seu negócio, sem excesso de ferramentas na tela.</p></div><div className="hub-module-grid">{[['OS com fotos','Checklist e assinatura digital',Wrench],['Catálogo B2B','Portal atacado por cliente',PackageCheck],['Curva ABC','Analytics para decisão',BarChart3],['Estoque cruzado','Transferências aprovadas',Layers],['Fiscal NF-e/NFC-e','Conformidade e controle',CircleDollarSign]].map(([title, description, Icon]) => { const ModuleIcon = Icon as typeof Wrench; return <div className="hub-module" key={title as string}><span className="hub-module-icon"><ModuleIcon size={18} /></span><div><strong>{title as string}</strong><small>{description as string}</small></div><Check size={16} /></div>; })}</div></div>
      </section>

      <section id="planos" className="hub-plans">
        <div className="page-container"><div className="hub-section-head"><div className="eyebrow">PLANOS PARA CRESCER</div><h2>Comece simples. Escale sem trocar de sistema.</h2><p>Escolha o plano ideal para a estrutura atual da sua operação.</p></div><div className="hub-plan-grid">{[['Plano Básico','R$ 49,90',['1 loja','PDV ilimitado','Cadastros básicos','Relatórios simples']],['Plano Profissional','R$ 99,90',['Até 3 lojas','Gestão de estoque','Relatórios & CRM avançado','Gestão de entregas','Cupons de desconto']],['Plano Enterprise','R$ 199,90',['Lojas ilimitadas','Integração Instagram','API & Webhooks','Suporte prioritário','White-label completo']]].map(([name, price, features], index) => <div className={`hub-plan ${index === 1 ? 'featured' : ''}`} key={name as string}>{index === 1 && <span className="hub-plan-badge">MAIS POPULAR</span>}<strong>{name as string}</strong><div className="hub-plan-price">{price as string}<em>/ mês</em></div><ul>{(features as string[]).map(feature => <li key={feature}><Check size={14} /> {feature}</li>)}</ul><button onClick={openPanel}>{index === 1 ? 'Escolher plano' : 'Selecionar plano'} <ArrowRight size={14} /></button></div>)}</div></div>
      </section>

      <section className="hub-about">
        <div className="page-container">
          <div className="hub-about-grid">
            <div className="hub-about-copy">
              <div className="eyebrow"><Cpu size={14} /> TECNOLOGIA DE ALTO NÍVEL</div>
              <h2>Engenharia de Software criada para destravar o crescimento do seu negócio.</h2>
              <p>
                A DistriHub transforma a complexidade da distribuição em uma rotina clara para sua
                equipe. Conectamos distribuidores, assistências técnicas e lojistas em uma plataforma
                integrada, com dados para decidir e ferramentas para executar.
              </p>
              <div className="hub-about-metrics">
                <div className="hub-metric">
                  <strong>99.9%</strong>
                  <small>Disponibilidade do Sistema</small>
                </div>
                <div className="hub-metric">
                  <strong>&lt; 1s</strong>
                  <small>Tempo Médio de Resposta</small>
                </div>
                <div className="hub-metric">
                  <strong>100%</strong>
                  <small>Conformidade Fiscal SEFAZ</small>
                </div>
              </div>
            </div>
            <div className="hub-about-cards">
              <div className="hub-agile-card">
                <span className="hub-agile-icon"><Zap size={22} /></span>
                <h4>Agilidade &amp; Performance Absoluta</h4>
                <p>PDV e vendas B2B otimizados para resposta em milissegundos. Venda mais rápido no balcão e elimine filas sem travamentos.</p>
              </div>
              <div className="hub-agile-card">
                <span className="hub-agile-icon"><ShieldCheck size={22} /></span>
                <h4>Rastreabilidade &amp; Segurança Anti-Fraude</h4>
                <p>Controle rigoroso de IMEI, números de série, selos de garantia e auditoria fiscal completa para proteger a margem do seu negócio.</p>
              </div>
              <div className="hub-agile-card">
                <span className="hub-agile-icon"><Layers size={22} /></span>
                <h4>Ecosistema Integrado &amp; Escalável</h4>
                <p>Multi-lojas, gestão financeira, emissão fiscal automatizada e logística B2B conectadas em tempo real.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="hub-footer">
        <div className="page-container hub-footer-inner">
          <p>&copy; {new Date().getFullYear()} DistriHub — Plataforma de Gestão ERP, Vendas e Distribuição B2B</p>
        </div>
      </footer>
    </main>
  );
}
