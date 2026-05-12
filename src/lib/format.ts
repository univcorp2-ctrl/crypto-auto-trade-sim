export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'percent',
    maximumFractionDigits: 2
  }).format(value);
}

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}
