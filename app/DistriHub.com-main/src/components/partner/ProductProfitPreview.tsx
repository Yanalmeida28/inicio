import { money } from '../../utils';
import { productProfitMetrics } from '../../lib/productProfit';

const percent = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function ProductProfitPreview({ cost, retail, wholesale }: { cost: string; retail: string; wholesale: string }) {
  return <section className="product-profit-preview" aria-label="Indicadores de rentabilidade">
    <div className="product-profit-grid">
      {[{ label: 'Varejo', price: retail }, { label: 'Atacado', price: wholesale }].map(({ label, price }) => {
        const metrics = productProfitMetrics(cost, price);
        return <div key={label} className={`product-profit-card${metrics && metrics.grossProfit < 0 ? ' is-loss' : ''}`} role="group" aria-label={`Rentabilidade no ${label.toLowerCase()}`}>
          <h5>{label}</h5>
          <dl>
            <div><dt>Markup sobre o custo</dt><dd>{metrics?.markup != null ? percent(metrics.markup) : metrics ? 'Não se aplica (custo zero)' : '—'}</dd></div>
            <div><dt>Margem bruta sobre a venda</dt><dd>{metrics ? percent(metrics.grossMargin) : '—'}</dd></div>
            <div className="product-profit-total"><dt>Lucro bruto por unidade</dt><dd>{metrics ? money.format(metrics.grossProfit) : '—'}</dd></div>
          </dl>
          {!metrics && <small>Informe custo e preço de venda maior que zero.</small>}
          {metrics && metrics.grossProfit < 0 && <small className="product-profit-loss">Preço de venda abaixo do custo.</small>}
        </div>;
      })}
    </div>
    <p>Lucro bruto estimado, antes de taxas, impostos, comissões e despesas. Os indicadores não alteram os preços.</p>
  </section>;
}
