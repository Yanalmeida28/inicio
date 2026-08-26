import type { Product, Category, RmaStatus, BusinessSegment } from './types';

export const products: Product[] = [
  {
    id: 1,
    name: 'Display Moto G8 Power',
    subtitle: 'Tela LCD • Com aro',
    sku: 'DH-MG8-012',
    brand: 'Motorola',
    category: 'Displays / Telas',
    price: 89.9,
    stock: 42,
    badge: 'Mais vendido',
    image: 'https://images.pexels.com/photos/719399/pexels-photo-719399.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 2,
    name: 'Bateria iPhone 11',
    subtitle: 'Alta capacidade • 3110mAh',
    sku: 'DH-IP11-034',
    brand: 'Apple',
    category: 'Baterias',
    price: 67.5,
    stock: 18,
    badge: 'Oferta',
    image: 'https://images.pexels.com/photos/37475677/pexels-photo-37475677.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 3,
    name: 'Cabo Flex Power A52',
    subtitle: 'Samsung Galaxy A52 • Original',
    sku: 'DH-SA52-008',
    brand: 'Samsung',
    category: 'Cabos Flex',
    price: 24.9,
    stock: 76,
    image: 'https://images.pexels.com/photos/305084/pexels-photo-305084.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 4,
    name: 'Conector de Carga Redmi 9',
    subtitle: 'Placa completa • USB-C',
    sku: 'DH-R9-021',
    brand: 'Xiaomi',
    category: 'Conectores',
    price: 18.75,
    stock: 31,
    image: 'https://images.pexels.com/photos/31862953/pexels-photo-31862953.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 5,
    name: 'Display Galaxy A14',
    subtitle: 'Tela LCD • Sem aro',
    sku: 'DH-SA14-015',
    brand: 'Samsung',
    category: 'Displays / Telas',
    price: 76.9,
    stock: 24,
    image: 'https://images.pexels.com/photos/4387770/pexels-photo-4387770.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 6,
    name: 'Kit Ferramentas Pro',
    subtitle: '24 peças • Precisão',
    sku: 'DH-KIT-003',
    brand: 'Motorola',
    category: 'Ferramentas',
    price: 54.9,
    stock: 11,
    badge: 'Novidade',
    image: 'https://images.pexels.com/photos/3921707/pexels-photo-3921707.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 7,
    name: 'Bateria Galaxy S20',
    subtitle: 'Alta performance • 4000mAh',
    sku: 'DH-SS20-009',
    brand: 'Samsung',
    category: 'Baterias',
    price: 72.9,
    stock: 29,
    image: 'https://images.pexels.com/photos/14706040/pexels-photo-14706040.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 8,
    name: 'Kit Acessórios PD 20W',
    subtitle: 'Fonte + cabo USB-C',
    sku: 'DH-PD20-004',
    brand: 'Apple',
    category: 'Acessórios',
    price: 39.9,
    stock: 53,
    image: 'https://images.pexels.com/photos/37475662/pexels-photo-37475662.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 9,
    name: 'Flex Sub Placa iPhone XR',
    subtitle: 'Conector superior • Original',
    sku: 'DH-IPXR-041',
    brand: 'Apple',
    category: 'Cabos Flex',
    price: 34.9,
    stock: 0,
    image: 'https://images.pexels.com/photos/4387770/pexels-photo-4387770.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 10,
    name: 'Display Redmi Note 10',
    subtitle: 'Tela LCD • Com moldura',
    sku: 'DH-RN10-027',
    brand: 'Xiaomi',
    category: 'Displays / Telas',
    price: 95.0,
    stock: 7,
    badge: 'Últimas unidades',
    image: 'https://images.pexels.com/photos/719399/pexels-photo-719399.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 11,
    name: 'Conector de Carga Moto G60',
    subtitle: 'Placa filha • USB-C',
    sku: 'DH-MG60-019',
    brand: 'Motorola',
    category: 'Conectores',
    price: 22.5,
    stock: 0,
    image: 'https://images.pexels.com/photos/31862953/pexels-photo-31862953.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 12,
    name: 'Fone Bluetooth AirBuds',
    subtitle: 'Sem fio • Caixa de carga',
    sku: 'DH-AB-006',
    brand: 'Apple',
    category: 'Acessórios',
    price: 119.9,
    stock: 22,
    badge: 'Novidade',
    image: 'https://images.pexels.com/photos/3921707/pexels-photo-3921707.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
];

export const categories: Category[] = [
  { label: 'Displays / Telas', icon: 'Smartphone', tone: 'blue' },
  { label: 'Baterias', icon: 'BatteryCharging', tone: 'green' },
  { label: 'Cabos Flex', icon: 'Cable', tone: 'orange' },
  { label: 'Conectores', icon: 'Zap', tone: 'pink' },
  { label: 'Ferramentas', icon: 'Wrench', tone: 'slate' },
  { label: 'Acessórios', icon: 'Headphones', tone: 'cyan' },
];

export const brands = ['Todos', 'Samsung', 'Apple', 'Motorola', 'Xiaomi'] as const;

export const WHATSAPP_NUMBER = '';

export const rmaStatusLabels: Record<RmaStatus, string> = {
  aguardando_troca: 'Aguardando Troca',
  retornou_fornecedor: 'Retornou ao Fornecedor',
  reintegrado_estoque: 'Reintegrado ao Estoque',
  credito_gerado: 'Crédito Gerado',
};

export const rmaStatusColors: Record<RmaStatus, string> = {
  aguardando_troca: '#e6a06d',
  retornou_fornecedor: '#55adf1',
  reintegrado_estoque: '#5bbc87',
  credito_gerado: '#c9a45c',
};

export const rmaStatusFlow: RmaStatus[] = [
  'aguardando_troca', 'retornou_fornecedor', 'reintegrado_estoque', 'credito_gerado',
];

export const segmentLabels: Record<BusinessSegment, string> = {
  assistencia: 'Assistência Técnica',
  varejo: 'Varejo Geral',
  servicos: 'Serviços',
};

export const segmentOptions: { value: BusinessSegment; label: string }[] = [
  { value: 'assistencia', label: 'Assistência Técnica' },
  { value: 'varejo', label: 'Varejo Geral' },
  { value: 'servicos', label: 'Serviços' },
];

export const paymentMethods = [
  { value: 'pix', label: 'PIX Instantâneo' },
  { value: 'cartao', label: 'Cartão de Crédito' },
  { value: 'faturado', label: 'Faturado no Limite B2B' },
  { value: 'rma', label: 'Pagar com Crédito de RMA' },
];

export const deliveryMethods = [
  { value: 'balcao', label: 'Retirada no Balcão' },
  { value: 'motoboy', label: 'Entrega Rápida por Motoboy' },
  { value: 'rota_manha', label: 'Rota Agendada — Manhã' },
  { value: 'rota_tarde', label: 'Rota Agendada — Tarde' },
];
