import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ClipboardList,
  ImagePlus,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import type {
  BusinessSegment,
  PartnerBranch,
  PartnerCustomer,
  PartnerProduct,
  ServiceOrder,
} from '../../types';

import { supabase } from '../../lib/supabase';

type Props = {
  userId?: string;
  segment: BusinessSegment;
  branches: PartnerBranch[];
  customers: PartnerCustomer[];
  products: PartnerProduct[];
  selectedBranchId: string | null;
  warrantyTerms?: string;
  onUpdateWarrantyTerms?: (value: string) => void;
};

type DraftItem = {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  stock: number;
  is_service: boolean;
};

type Photo = {
  id: string;
  file: File;
  type: 'entry' | 'exit';
  label: string;
  preview: string;
};

const money = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const inputDarkStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#FFFFFF',
  color: '#172033',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelDarkStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  color: '#172033',
  fontWeight: 600,
  fontSize: 14,
};

export function ServiceOrdersModule({
  userId,
  segment,
  branches,
  customers,
  products,
  selectedBranchId,
  warrantyTerms = '',
  onUpdateWarrantyTerms,
}: Props) {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const [customerId, setCustomerId] = useState('');
  const [equipmentType, setEquipmentType] = useState('');
  const [identification, setIdentification] = useState('');
  const [serial, setSerial] = useState('');
  const [accessories, setAccessories] = useState('');
  const [condition, setCondition] = useState('');
  const [damage, setDamage] = useState('');
  const [notes, setNotes] = useState('');
  const [labor, setLabor] = useState('');

  const [productSearch, setProductSearch] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [entryPhotos, setEntryPhotos] = useState<Photo[]>([]);
  const [exitPhotos, setExitPhotos] = useState<Photo[]>([]);

  const photos = [...entryPhotos, ...exitPhotos];

  const entryFileRef = useRef<HTMLInputElement>(null);
  const exitFileRef = useRef<HTMLInputElement>(null);

  const branch = branches.find(
    (item) => item.id === selectedBranchId
  );

  const customer = customers.find(
    (item) => item.id === customerId
  );

  const availableProducts = useMemo(() => {
    const term = productSearch.toLowerCase();

    return products.filter((product) => {
      if (product.branch_id !== selectedBranchId) {
        return false;
      }

      return (
        product.name.toLowerCase().includes(term) ||
        (product.sku ?? '').toLowerCase().includes(term)
      );
    });
  }, [products, selectedBranchId, productSearch]);

  const partsTotal = items.reduce(
    (total, item) =>
      total + item.unit_price * item.quantity,
    0
  );

  const laborTotal = Number(labor) || 0;

  const total = partsTotal + laborTotal;

  useEffect(() => {
    async function loadOrders() {
      if (!supabase || !userId) {
        return;
      }

      let query = supabase
        .from('service_orders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', {
          ascending: false,
        });

      if (selectedBranchId) {
        query = query.eq('branch_id', selectedBranchId);
      }

      const { data, error } = await query;

      if (error) {
        console.error(
          'Erro ao carregar Ordens de Serviço:',
          error
        );
        return;
      }

      setOrders((data as ServiceOrder[]) ?? []);
    }

    loadOrders();
  }, [userId, selectedBranchId]);

  const filteredOrders = orders.filter((order) =>
    `${order.customer_name ?? ''} ${
      order.equipment_identification ?? ''
    } ${order.serial_number ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function addProduct(product: PartnerProduct) {
    setItems((current) => {
      const existing = current.find(
        (item) => item.product_id === product.id
      );

      if (existing) {
        return current.map((item) => {
          if (item.product_id !== product.id) {
            return item;
          }

          const nextQuantity = product.is_service
            ? item.quantity + 1
            : Math.min(
                item.quantity + 1,
                product.stock
              );

          return {
            ...item,
            quantity: nextQuantity,
          };
        });
      }

      if (!product.is_service && product.stock < 1) {
        return current;
      }

      return [
        ...current,
        {
          product_id: product.id,
          name: product.name,
          quantity: 1,
          unit_price: product.sale_price,
          stock: product.stock,
          is_service: product.is_service,
        },
      ];
    });
  }

  function removeProduct(productId: string) {
    setItems((current) =>
      current.filter(
        (item) => item.product_id !== productId
      )
    );
  }

  function resetForm() {
    [...entryPhotos, ...exitPhotos].forEach((photo) => {
      URL.revokeObjectURL(photo.preview);
    });

    setOpen(false);
    setCustomerId('');
    setEquipmentType('');
    setIdentification('');
    setSerial('');
    setAccessories('');
    setCondition('');
    setDamage('');
    setNotes('');
    setLabor('');
    setProductSearch('');
    setItems([]);
    setEntryPhotos([]);
    setExitPhotos([]);
  }

  function addPhotos(files: FileList | null, type: 'entry' | 'exit') {
    if (!files) {
      return;
    }

    const current = type === 'entry' ? entryPhotos : exitPhotos;
    const setter = type === 'entry' ? setEntryPhotos : setExitPhotos;

    const remaining = 8 - current.length;

    if (remaining <= 0) {
      return;
    }

    const selectedFiles = Array.from(files).slice(
      0,
      remaining
    );

    const newPhotos: Photo[] = selectedFiles.map(
      (file, index) => ({
        id: crypto.randomUUID(),
        file,
        type,
        label:
          current.length === 0 && index === 0
            ? type === 'entry' ? 'Frente' : 'Saída'
            : type === 'entry' ? 'Entrada' : 'Saída',
        preview: URL.createObjectURL(file),
      })
    );

    setter((existing) => [...existing, ...newPhotos]);
  }

  async function saveOrder() {
    if (!supabase || !userId) {
      return;
    }

    if (!selectedBranchId) {
      alert('Selecione uma filial antes de abrir a OS.');
      return;
    }

    if (
      !equipmentType &&
      !identification &&
      !serial
    ) {
      alert(
        'Informe o equipamento, identificação ou número de série.'
      );
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase.rpc(
        'create_service_order',
        {
          p_branch_id: selectedBranchId,
          p_customer_id: customerId || null,
          p_customer_name: customer?.name ?? '',
          p_service_segment: segment,
          p_equipment_type: equipmentType,
          p_equipment_identification: identification,
          p_serial_number: serial,
          p_accessories_left: accessories,
          p_physical_condition: condition,
          p_entry_damage: damage,
          p_entry_notes: notes,
          p_labor_total: laborTotal,
          p_items: items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
        }
      );

      if (error || !data) {
        throw new Error(
          error?.message ??
            'Não foi possível criar a Ordem de Serviço.'
        );
      }

      const orderId = data as string;

      for (const photo of photos) {
        const extension =
          photo.file.name.split('.').pop() || 'jpg';

        const storagePath = `${selectedBranchId}/${orderId}/${photo.type}/${photo.id}.${extension}`;
        const branchId = selectedBranchId;

        if (!branchId) {
          throw new Error('Filial da operação ausente.');
        }

        const upload = await supabase.storage
          .from('service-order-photos')
          .upload(storagePath, photo.file);

        if (upload.error) {
          console.error(
            'Erro ao enviar foto:',
            upload.error
          );
          continue;
        }

        await supabase
          .from('service_order_photos')
          .insert({
            service_order_id: orderId,
            user_id: userId,
            branch_id: branchId,
            photo_type: photo.type,
            operation_type: 'service_order',
            label: photo.label,
            storage_path: storagePath,
          });
      }

      const createdOrder: ServiceOrder = {
        id: orderId,
        user_id: userId,
        branch_id: selectedBranchId,
        customer_id: customerId || null,
        customer_name: customer?.name ?? '',
        service_segment: segment,
        os_number: null,
        equipment_type: equipmentType,
        equipment_brand: null,
        equipment_model: null,
        equipment_identification: identification,
        serial_number: serial,
        imei: null,
        reported_issue: null,
        observations: notes,
        technician_name: null,
        entry_date: new Date().toISOString(),
        forecast_delivery: null,
        accessories_left: accessories,
        physical_condition: condition,
        entry_damage: damage,
        entry_notes: notes,
        screen_condition: null,
        shell_condition: null,
        side_condition: null,
        rear_condition: null,
        connectors_condition: null,
        buttons_condition: null,
        other_damage: null,
        inspection_notes: null,
        status: 'aberta',
        approval_status: 'aguardando_aprovacao',
        approval_notes: null,
        labor_total: laborTotal,
        parts_total: partsTotal,
        discount_total: 0,
        total,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setOrders((current) => [
        createdOrder,
        ...current,
      ]);

      alert(
        'Ordem de Serviço criada com sucesso!\n\nAs peças foram baixadas do estoque da filial selecionada.'
      );

      resetForm();
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : 'Erro ao criar a Ordem de Serviço.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      style={{
        padding: 24,
        maxWidth: 1280,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 22,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
            }}
          >
            Ordens de Serviço
          </h1>

          <p
            style={{
              opacity: 0.7,
              margin: '6px 0',
            }}
          >
            OS multi-segmento, vistoria de entrada e
            controle de peças por filial.
          </p>
        </div>

        <button
          className="partner-primary-btn"
          disabled={!selectedBranchId}
          onClick={() => setOpen(true)}
        >
          <Plus size={18} />
          Nova OS
        </button>
      </div>

      {!selectedBranchId && (
        <div
          className="partner-card"
          style={{
            padding: 16,
            marginBottom: 18,
          }}
        >
          Selecione uma filial para abrir uma OS e
          consumir o estoque correto.
        </div>
      )}

      {open && (
        <div
          className="partner-card"
          style={{
            padding: 22,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>
                Nova Ordem de Serviço
              </h2>

              <small>
                Filial: {branch?.name ?? 'Não selecionada'}
              </small>
            </div>

            <button
              className="partner-icon-btn"
              onClick={resetForm}
            >
              <X size={20} />
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
              gap: 16,
              marginTop: 22,
            }}
          >
            <label style={labelDarkStyle}>
              <span style={{ color: '#172033' }}>Cliente</span>
              <select
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                style={{ ...inputDarkStyle, WebkitAppearance: 'none', appearance: 'none' }}
              >
                <option value="" style={{ backgroundColor: '#FFFFFF', color: '#172033' }}>Sem cliente</option>
                {customers.map((item) => (
                  <option key={item.id} value={item.id} style={{ backgroundColor: '#FFFFFF', color: '#172033' }}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelDarkStyle}>
              <span style={{ color: '#172033' }}>Tipo de equipamento</span>
              <input
                value={equipmentType}
                onChange={(event) => setEquipmentType(event.target.value)}
                placeholder="Celular, notebook, ar-condicionado, veículo..."
                style={inputDarkStyle}
                className="dark-os-input"
              />
            </label>

            <label style={labelDarkStyle}>
              <span style={{ color: '#172033' }}>Identificação do Equipamento</span>
              <input
                value={identification}
                onChange={(event) => setIdentification(event.target.value)}
                placeholder="Modelo, patrimônio, placa, etiqueta..."
                style={{ ...inputDarkStyle }}
              />
            </label>

            <label style={labelDarkStyle}>
              <span style={{ color: '#172033' }}>Nº de Série</span>
              <input
                value={serial}
                onChange={(event) => setSerial(event.target.value)}
                placeholder="Opcional"
                style={{ ...inputDarkStyle }}
              />
            </label>
          </div>

          <div style={{ marginTop: 24, padding: 18, borderRadius: 14, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#172033' }}>
              <ClipboardList size={18} />
              Laudo e Vistoria de Entrada
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
                gap: 16,
              }}
            >
              <label style={labelDarkStyle}>
                <span style={{ color: '#172033' }}>Acessórios Deixados</span>
                <textarea
                  value={accessories}
                  onChange={(event) => setAccessories(event.target.value)}
                  rows={4}
                  placeholder="Cabos, fontes, controles, capas..."
                  style={{ ...inputDarkStyle, minHeight: 110, resize: 'vertical' }}
                />
              </label>

              <label style={labelDarkStyle}>
                <span style={{ color: '#172033' }}>Estado físico</span>
                <textarea
                  value={condition}
                  onChange={(event) => setCondition(event.target.value)}
                  rows={4}
                  placeholder="Riscos, trincas, amassados, desgaste..."
                  style={{ ...inputDarkStyle, minHeight: 110, resize: 'vertical' }}
                />
              </label>

              <label style={labelDarkStyle}>
                <span style={{ color: '#172033' }}>Avarias identificadas</span>
                <textarea
                  value={damage}
                  onChange={(event) => setDamage(event.target.value)}
                  rows={4}
                  placeholder="Registre o que já existia na entrada."
                  style={{ ...inputDarkStyle, minHeight: 110, resize: 'vertical' }}
                />
              </label>

              <label style={labelDarkStyle}>
                <span style={{ color: '#172033' }}>Observações</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder="Sintomas, testes, observações do cliente..."
                  style={{ ...inputDarkStyle, minHeight: 110, resize: 'vertical' }}
                />
              </label>
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              <div
                style={{
                  padding: 18,
                  borderRadius: 14,
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <h3 style={{ margin: 0 }}>
                    <Camera size={18} />
                    Fotos de entrada
                  </h3>

                  <button
                    className="partner-secondary-btn"
                    onClick={() => entryFileRef.current?.click()}
                    disabled={entryPhotos.length >= 8}
                  >
                    <ImagePlus size={17} />
                    Adicionar foto
                  </button>
                </div>

                <input
                  ref={entryFileRef}
                  hidden
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => addPhotos(event.target.files, 'entry')}
                />

                {entryPhotos.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))',
                      gap: 10,
                    }}
                  >
                    {entryPhotos.map((photo) => (
                      <div key={photo.id}>
                        <img
                          src={photo.preview}
                          alt={photo.label}
                          style={{
                            width: '100%',
                            aspectRatio: 1,
                            objectFit: 'cover',
                            borderRadius: 10,
                          }}
                        />

                        <small>{photo.label} · ENTRADA</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 20,
                      border: '1px dashed #999',
                      borderRadius: 10,
                      opacity: 0.65,
                    }}
                  >
                    Registre frente, verso/lados e detalhes das avarias.
                  </div>
                )}
              </div>

              <div
                style={{
                  padding: 18,
                  borderRadius: 14,
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <h3 style={{ margin: 0 }}>
                    <Package size={18} />
                    Fotos de saída
                  </h3>

                  <button
                    className="partner-secondary-btn"
                    onClick={() => exitFileRef.current?.click()}
                    disabled={exitPhotos.length >= 8}
                  >
                    <ImagePlus size={17} />
                    Adicionar foto
                  </button>
                </div>

                <input
                  ref={exitFileRef}
                  hidden
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => addPhotos(event.target.files, 'exit')}
                />

                {exitPhotos.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))',
                      gap: 10,
                    }}
                  >
                    {exitPhotos.map((photo) => (
                      <div key={photo.id}>
                        <img
                          src={photo.preview}
                          alt={photo.label}
                          style={{
                            width: '100%',
                            aspectRatio: 1,
                            objectFit: 'cover',
                            borderRadius: 10,
                          }}
                        />

                        <small>{photo.label} · SAÍDA</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 20,
                      border: '1px dashed #999',
                      borderRadius: 10,
                      opacity: 0.65,
                    }}
                  >
                    Registre fotos finais, entrega e item concluído.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <h3>
              <Package size={18} />
              Peças e produtos utilizados
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'minmax(250px,1fr) 2fr',
                gap: 16,
              }}
            >
              <div>
                <label style={labelDarkStyle}>
                  <span style={{ color: '#172033' }}>Buscar no estoque da filial</span>
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Nome ou SKU"
                    style={{ ...inputDarkStyle }}
                  />
                </label>

                {availableProducts
                  .slice(0, 20)
                  .map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() =>
                        addProduct(product)
                      }
                      disabled={
                        !product.is_service &&
                        product.stock < 1
                      }
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: 10,
                        marginTop: 7,
                        borderRadius: 9,
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        color: '#172033',
                      }}
                    >
                      <b>{product.name}</b>

                      <br />

                      <small>
                        {product.is_service
                          ? 'Serviço'
                          : `Estoque: ${product.stock}`}{' '}
                        · {money(product.sale_price)}
                      </small>
                    </button>
                  ))}
              </div>

              <div>
                {items.length > 0 ? (
                  items.map((item) => (
                    <div
                      key={item.product_id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          '1fr 80px 100px 36px',
                        gap: 8,
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <span>
                        {item.name}

                        <small
                          style={{
                            display: 'block',
                            opacity: 0.6,
                          }}
                        >
                          {item.is_service
                            ? 'Serviço'
                            : `Estoque: ${item.stock}`}
                        </small>
                      </span>

                      <input
                        type="number"
                        min={1}
                        max={item.is_service ? undefined : item.stock}
                        value={item.quantity}
                        onChange={(event) => {
                          const value = Number(event.target.value);

                          setItems((current) =>
                            current.map((currentItem) =>
                              currentItem.product_id === item.product_id
                                ? {
                                    ...currentItem,
                                    quantity: Math.max(
                                      1,
                                      Math.min(
                                        value,
                                        currentItem.is_service ? 999 : currentItem.stock
                                      )
                                    ),
                                  }
                                : currentItem
                            )
                          );
                        }}
                        style={{ ...inputDarkStyle }}
                      />

                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unit_price}
                        onChange={(event) => {
                          const value = Number(event.target.value);

                          setItems((current) =>
                            current.map((currentItem) =>
                              currentItem.product_id === item.product_id
                                ? {
                                    ...currentItem,
                                    unit_price: value,
                                  }
                                : currentItem
                            )
                          );
                        }}
                        style={{ ...inputDarkStyle }}
                      />

                      <button
                        className="partner-icon-btn"
                        onClick={() =>
                          removeProduct(
                            item.product_id
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      padding: 18,
                      opacity: 0.6,
                    }}
                  >
                    Nenhuma peça adicionada.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 20,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 14,
              alignItems: 'end',
              flexWrap: 'wrap',
            }}
          >
            <label style={labelDarkStyle}>
              <span style={{ color: '#172033' }}>Mão de obra</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={labor}
                onChange={(event) => setLabor(event.target.value)}
                style={{ ...inputDarkStyle }}
              />
            </label>

            <div>
              <small>
                Peças: {money(partsTotal)}
              </small>

              <br />

              <b>Total: {money(total)}</b>
            </div>

            <button
              className="partner-primary-btn"
              disabled={saving}
              onClick={saveOrder}
            >
              {saving
                ? 'Salvando...'
                : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      <div
        className="partner-card"
        style={{
          padding: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <Search size={18} />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar OS"
            style={{
              flex: 1,
              backgroundColor: '#FFFFFF',
              color: '#172033',
              border: '1px solid #E2E8F0',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          />
        </div>

        {filteredOrders.length > 0 ? (
          filteredOrders.map((order) => (
            <div
              key={order.id}
              style={{
                padding: 14,
                borderTop:
                  '1px solid rgba(127,127,127,.15)',
                display: 'flex',
                justifyContent:
                  'space-between',
              }}
            >
              <span>
                <b>
                  OS #{order.id.slice(0, 8)}
                </b>{' '}
                ·{' '}
                {order.customer_name ||
                  'Sem cliente'}

                <br />

                <small>
                  {order.equipment_type ||
                    'Equipamento'}{' '}
                  ·{' '}
                  {order.equipment_identification ||
                    order.serial_number ||
                    'Sem identificação'}
                </small>
              </span>

              <b>{money(order.total)}</b>
            </div>
          ))
        ) : (
          <div
            style={{
              padding: 35,
              textAlign: 'center',
              opacity: 0.6,
            }}
          >
            <p>
              Nenhuma OS encontrada.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}