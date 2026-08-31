export type ServiceOrderStatus =
  | 'aberta'
  | 'em_andamento'
  | 'aguardando_peca'
  | 'aguardando_cliente'
  | 'concluida'
  | 'cancelada';

export interface ServiceOrder {
  id: string;
  user_id: string;
  branch_id: string;

  customer_id: string | null;
  customer_name: string | null;

  service_segment: string;

  equipment_type: string | null;
  equipment_identification: string | null;
  serial_number: string | null;

  accessories_left: string | null;
  physical_condition: string | null;
  entry_damage: string | null;
  entry_notes: string | null;

  status: ServiceOrderStatus;

  labor_total: number;
  parts_total: number;
  total: number;

  created_at: string;
  updated_at: string;
}

export interface ServiceOrderItem {
  id: string;
  service_order_id: string;
  user_id: string;

  product_id: string;
  branch_id: string;

  product_name: string;

  quantity: number;
  unit_cost: number;
  unit_price: number;

  created_at: string;
}

export interface ServiceOrderPhoto {
  id: string;
  service_order_id: string;
  user_id: string;

  label: string;
  storage_path: string;

  created_at: string;
}