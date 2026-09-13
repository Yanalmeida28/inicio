import type { Category, RmaStatus } from './types';

export const categories: Category[] = [
  {
    label: 'Displays / Telas',
    icon: 'Smartphone',
    tone: 'blue',
  },
  {
    label: 'Baterias',
    icon: 'BatteryCharging',
    tone: 'green',
  },
  {
    label: 'Cabos Flex',
    icon: 'Cable',
    tone: 'orange',
  },
  {
    label: 'Conectores',
    icon: 'Zap',
    tone: 'pink',
  },
  {
    label: 'Ferramentas',
    icon: 'Wrench',
    tone: 'slate',
  },
  {
    label: 'Acessórios',
    icon: 'Headphones',
    tone: 'cyan',
  },
];

export const brands = [
  'Todos',
  'Samsung',
  'Apple',
  'Motorola',
  'Xiaomi',
] as const;

export const WHATSAPP_NUMBER = (
  import.meta.env.VITE_WHATSAPP_NUMBER ?? ''
).replace(/\D/g, '');

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
  'aguardando_troca',
  'retornou_fornecedor',
  'reintegrado_estoque',
  'credito_gerado',
];

export const paymentMethods = [
  {
    value: 'pix',
    label: 'PIX Instantâneo',
  },
  {
    value: 'cartao',
    label: 'Cartão de Crédito',
  },
  {
    value: 'faturado',
    label: 'Faturado no Limite B2B',
  },
  {
    value: 'rma',
    label: 'Pagar com Crédito de RMA',
  },
];

export const deliveryMethods = [
  {
    value: 'balcao',
    label: 'Retirada no Balcão',
  },
  {
    value: 'motoboy',
    label: 'Entrega Rápida por Motoboy',
  },
  {
    value: 'rota_manha',
    label: 'Rota Agendada — Manhã',
  },
  {
    value: 'rota_tarde',
    label: 'Rota Agendada — Tarde',
  },
];