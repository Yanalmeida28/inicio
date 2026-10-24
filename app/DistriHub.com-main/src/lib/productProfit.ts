export function productProfitMetrics(cost: string, price: string) {
  if (!cost.trim() || !price.trim()) return null;
  const costValue = Number(cost);
  const priceValue = Number(price);
  if (!Number.isFinite(costValue) || !Number.isFinite(priceValue) || costValue < 0 || priceValue <= 0) return null;
  const costCents = Math.round(costValue * 100);
  const priceCents = Math.round(priceValue * 100);
  if (!Number.isSafeInteger(costCents) || !Number.isSafeInteger(priceCents) || priceCents <= 0) return null;
  const profitCents = priceCents - costCents;
  return {
    grossProfit: profitCents / 100,
    markup: costCents > 0 ? (profitCents / costCents) * 100 : null,
    grossMargin: (profitCents / priceCents) * 100,
  };
}
