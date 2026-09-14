import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Boxes,
  ShoppingCart,
  Wallet,
  Package,
  BarChart3,
  Wand2,
  Settings,
  Menu,
  X,
  Store,
  Truck,
  ClipboardList,
  FileText,
  Shield,
  Headphones,
  Wrench,
  UserCheck,
  Building2,
  Sparkles,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Send,
  Loader2,
  Plus,
  Trash2,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Bot,
  RefreshCw,
  Download,
  Users
} from 'lucide-react';

interface PartnerPanelProps {
  onBack: () => void;
}

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: 'active' | 'out_of_stock' | 'draft';
  sku: string;
}

interface Order {
  id: string;
  customerName: string;
  date: string;
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  itemsCount: number;
}

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: 'baixa' | 'media' | 'alta';
  status: 'aberto' | 'em_andamento' | 'resolvido';
  date: string;
}

export function PartnerPanel({ onBack }: PartnerPanelProps) {
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'products' | 'orders' | 'finances' | 'ai_assistant' | 'support' | 'settings'
  >('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Estados de Produtos
  const [products, setProducts] = useState<Product[]>([
    { id: '1', name: 'Distribuidor Hidráulico 4 Vias', category: 'Equipamentos', price: 1250.00, stock: 8, status: 'active', sku: 'DH-001' },
    { id: '2', name: 'Válvula de Retenção 3/4"', category: 'Peças', price: 89.90, stock: 45, status: 'active', sku: 'VR-045' },
    { id: '3', name: 'Mangueira Alta Pressão 10m', category: 'Acessórios', price: 210.00, stock: 0, status: 'out_of_stock', sku: 'MAP-10M' },
    { id: '4', name: 'Filtro de Óleo Industrial', category: 'Manutenção', price: 45.50, stock: 12, status: 'active', sku: 'FOI-99' },
  ]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', category: '', price: '', stock: '', sku: '' });

  // Estados de Pedidos
  const [orders, setOrders] = useState<Order[]>([
    { id: 'ORD-8821', customerName: 'Oficina Central LTDA', date: '2026-03-14', total: 2580.00, status: 'processing', itemsCount: 4 },
    { id: 'ORD-8820', customerName: 'Auto Peças Silva', date: '2026-03-14', total: 450.00, status: 'pending', itemsCount: 2 },
    { id: 'ORD-8819', customerName: 'Mecânica do Gugu', date: '2026-03-13', total: 1210.50, status: 'delivered', itemsCount: 5 },
  ]);

  // Estados do Chatbot IA
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string }>>([
    { sender: 'bot', text: 'Olá! Sou o assistente de IA do parceiro. Como posso ajudar nas suas vendas ou relatórios hoje?' }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Estados de Suporte / Tickets
  const [tickets, setTickets] = useState<Ticket[]>([
    { id: 'TK-102', subject: 'Dúvida no repasse semanal', category: 'Financeiro', priority: 'media', status: 'em_andamento', date: '2026-03-12' },
    { id: 'TK-098', subject: 'Inconsistência de estoque via API', category: 'Técnico', priority: 'alta', status: 'aberto', date: '2026-03-10' }
  ]);

  // Handlers
  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price) return;

    const created: Product = {
      id: String(Date.now()),
      name: newProduct.name,
      category: newProduct.category || 'Geral',
      price: parseFloat(newProduct.price),
      stock: parseInt(newProduct.stock) || 0,
      status: parseInt(newProduct.stock) > 0 ? 'active' : 'out_of_stock',
      sku: newProduct.sku || `SKU-${Math.floor(Math.random() * 1000)}`
    };

    setProducts([created, ...products]);
    setNewProduct({ name: '', category: '', price: '', stock: '', sku: '' });
    setIsAddModalOpen(false);
  };

  const handleDeleteProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isGenerating) return;

    const userText = inputMessage;
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setInputMessage('');
    setIsGenerating(true);

    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: `Análise concluída para: "${userText}". Seus produtos da categoria Equipamentos estão com 18% a mais de procura esta semana. Recomendo reabastecer o estoque.`
        }
      ]);
      setIsGenerating(false);
    }, 1200);
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [products, searchTerm]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Store className="w-6 h-6 text-indigo-400" />
              <span className="font-bold text-lg text-white tracking-wide">DistriHub <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-normal">Parceiro</span></span>
            </div>
          </div>

          {/* Navigation Bar */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'products' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Package className="w-4 h-4" />
              Catálogo
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'orders' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              Pedidos
            </button>
            <button
              onClick={() => setActiveTab('finances')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'finances' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Wallet className="w-4 h-4" />
              Finanças
            </button>
            <button
              onClick={() => setActiveTab('ai_assistant')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'ai_assistant' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Wand2 className="w-4 h-4 text-amber-400" />
              IA Assistente
            </button>
            <button
              onClick={() => setActiveTab('support')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'support' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Headphones className="w-4 h-4" />
              Suporte
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'settings' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
              Configurações
            </button>
          </nav>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* TAB: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-white">Painel Geral</h1>
                <p className="text-slate-400 text-sm">Resumo de desempenho e vendas da sua distribuidora.</p>
              </div>
              <button className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Atualizar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-sm font-medium">Faturamento do Mês</span>
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">R$ 42.440,50</div>
                <span className="text-xs text-emerald-400 flex items-center gap-1 mt-2">+14.2% em relação ao mês anterior</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-sm font-medium">Pedidos Ativos</span>
                  <ShoppingCart className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-white">{orders.length}</div>
                <span className="text-xs text-slate-400 mt-2 block">2 aguardando envio</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-sm font-medium">Produtos Cadastrados</span>
                  <Package className="w-5 h-5 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white">{products.length}</div>
                <span className="text-xs text-amber-400/80 mt-2 block">1 item sem estoque</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-sm font-medium">Repasse Disponível</span>
                  <Wallet className="w-5 h-5 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-white">R$ 12.890,00</div>
                <span className="text-xs text-indigo-400 mt-2 block cursor-pointer hover:underline">Solicitar saque</span>
              </div>
            </div>

            {/* Pedidos Recentes */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">Últimas Transações</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">ID Pedido</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Valor</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono text-indigo-400 font-medium">{o.id}</td>
                        <td className="px-4 py-3 text-white">{o.customerName}</td>
                        <td className="px-4 py-3">{o.date}</td>
                        <td className="px-4 py-3">R$ {o.total.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: PRODUTOS */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">Gestão de Catálogo</h1>
                <p className="text-slate-400 text-sm">Adicione, edite e gerencie o estoque dos seus produtos.</p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" /> Cadastrar Produto
              </button>
            </div>

            {/* Barra de Pesquisa */}
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Tabela de Produtos */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3">SKU</th>
                    <th className="px-6 py-3">Nome</th>
                    <th className="px-6 py-3">Categoria</th>
                    <th className="px-6 py-3">Preço</th>
                    <th className="px-6 py-3">Estoque</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-800/30">
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">{product.sku}</td>
                      <td className="px-6 py-4 font-medium text-white">{product.name}</td>
                      <td className="px-6 py-4">{product.category}</td>
                      <td className="px-6 py-4 font-semibold text-white">R$ {product.price.toFixed(2)}</td>
                      <td className="px-6 py-4">{product.stock} un.</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          product.stock > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {product.stock > 0 ? 'Disponível' : 'Esgotado'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Excluir produto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: PEDIDOS */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Pedidos e Vendas</h1>
              <p className="text-slate-400 text-sm">Acompanhe e atualize os pedidos recebidos.</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3">Código</th>
                    <th className="px-6 py-3">Cliente</th>
                    <th className="px-6 py-3">Data</th>
                    <th className="px-6 py-3">Itens</th>
                    <th className="px-6 py-3">Total</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-800/30">
                      <td className="px-6 py-4 font-mono font-medium text-indigo-400">{o.id}</td>
                      <td className="px-6 py-4 text-white font-medium">{o.customerName}</td>
                      <td className="px-6 py-4">{o.date}</td>
                      <td className="px-6 py-4">{o.itemsCount} itens</td>
                      <td className="px-6 py-4 font-semibold text-white">R$ {o.total.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: FINANÇAS */}
        {activeTab === 'finances' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Módulo Financeiro</h1>
              <p className="text-slate-400 text-sm">Acompanhe repasses, comissões e histórico de saques.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <span className="text-slate-400 text-sm font-medium">Saldo A Liberar</span>
                <div className="text-3xl font-bold text-white mt-2">R$ 5.420,00</div>
                <p className="text-xs text-slate-500 mt-2">Liberado em até 7 dias úteis após a entrega.</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <span className="text-slate-400 text-sm font-medium">Disponível para Saque</span>
                <div className="text-3xl font-bold text-emerald-400 mt-2">R$ 12.890,00</div>
                <button className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                  Solicitar Transferência
                </button>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <span className="text-slate-400 text-sm font-medium">Total Já Repassado</span>
                <div className="text-3xl font-bold text-white mt-2">R$ 184.200,00</div>
                <p className="text-xs text-slate-500 mt-2">Acumulado do ano corrente.</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB: ASSISTENTE IA */}
        {activeTab === 'ai_assistant' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-amber-400" /> Copiloto de Inteligência Artificial
              </h1>
              <p className="text-slate-400 text-sm">Obtenha insights de catálogo, precificação e análise de vendas.</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl h-[450px] flex flex-col">
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-md p-3 rounded-xl text-sm ${
                        m.sender === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-200 border border-slate-700'
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                {isGenerating && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 p-3 rounded-xl text-sm text-slate-400 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> Analisando dados...
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 flex gap-2">
                <input
                  type="text"
                  placeholder="Pergunte sobre seus produtos ou desempenho..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Send className="w-4 h-4" /> Enviar
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB: SUPORTE */}
        {activeTab === 'support' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-white">Central de Atendimento</h1>
                <p className="text-slate-400 text-sm">Abra chamados técnicos ou resolva pendências administrativas.</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">Seus Chamados</h2>
              <div className="space-y-3">
                {tickets.map((t) => (
                  <div key={t.id} className="p-4 bg-slate-950 border border-slate-800 rounded-lg flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-indigo-400">{t.id}</span>
                        <h3 className="font-semibold text-white text-sm">{t.subject}</h3>
                      </div>
                      <span className="text-xs text-slate-500">Categoria: {t.category} • Criado em {t.date}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: CONFIGURAÇÕES */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Configurações da Conta</h1>
              <p className="text-slate-400 text-sm">Atualize os dados do estabelecimento e integrações.</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-2xl space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Razão Social / Nome Fantasia</label>
                <input
                  type="text"
                  defaultValue="Distribuidores Unidos LTDA"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">CNPJ</label>
                <input
                  type="text"
                  defaultValue="12.345.678/0001-99"
                  disabled
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-4 py-2 text-slate-500 text-sm cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Chave API de Integração</label>
                <input
                  type="password"
                  defaultValue="dh_live_9981237192387192"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Salvar Alterações
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modal para Cadastro de Produtos */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <h2 className="text-xl font-bold text-white">Novo Produto</h2>
            <form onSubmit={handleAddProduct} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nome do Produto</label>
                <input
                  type="text"
                  required
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Preço (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Estoque</label>
                  <input
                    type="number"
                    value={newProduct.stock}
                    onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Categoria</label>
                <input
                  type="text"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Cadastrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}