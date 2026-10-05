import { validSalePrice } from '../../lib/pdv';

export function SalePriceInput({ value, name, disabled, onChange }: {
  value: number;
  name: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return <input
    className="pdv-sale-price-input"
    type="number" min="0" max="99999999.99" step="0.01" inputMode="decimal"
    aria-label={`Preço unitário de ${name}`}
    aria-invalid={!validSalePrice(value)}
    title="Preço para esta venda; o cadastro do produto será mantido"
    disabled={disabled}
    value={Number.isFinite(value) ? value : ''}
    onChange={event => onChange(event.target.value === '' ? Number.NaN : Number(event.target.value))}
  />;
}
