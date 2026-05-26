import type { HistoryPoint, Position, TradeSignal } from './types';

export type RawAllocation = {
  symbol: string;
  allocationPct: number;
};

export function normalizeAllocations<T extends RawAllocation>(assets: T[]): T[] {
  const total = assets.reduce((sum, asset) => sum + positiveNumber(asset.allocationPct), 0);
  if (total <= 0) {
    throw new Error('asset allocation total must be positive');
  }

  return assets.map((asset) => ({
    ...asset,
    allocationPct: positiveNumber(asset.allocationPct) / total
  }));
}

export function calculateReturn(currentValue: number, initialValue: number): number {
  if (!Number.isFinite(initialValue) || initialValue <= 0) return 0;
  return (currentValue - initialValue) / initialValue;
}

export function calculateMaxDrawdown(points: HistoryPoint[]): number {
  let peak = 0;
  let maxDrawdown = 0;

  for (const point of points) {
    peak = Math.max(peak, point.valueJpy);
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, (point.valueJpy - peak) / peak);
    }
  }

  return maxDrawdown;
}

export function calculateAnnualizedVolatility(points: HistoryPoint[]): number {
  if (points.length < 3) return 0;
  const returns: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]?.valueJpy ?? 0;
    const current = points[index]?.valueJpy ?? 0;
    if (previous > 0 && current > 0) {
      returns.push((current - previous) / previous);
    }
  }

  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365);
}

export function getTradeSignal(position: Pick<Position, 'sevenDayReturnPct' | 'thirtyDayReturnPct' | 'returnPct'>): {
  signal: TradeSignal;
  reason: string;
} {
  const sevenDay = position.sevenDayReturnPct ?? 0;
  const thirtyDay = position.thirtyDayReturnPct ?? 0;

  if (sevenDay > 0.045 && thirtyDay > 0.02) {
    return { signal: 'BUY', reason: '7日・30日モメンタムが両方プラス。小さく追加検討。' };
  }

  if (sevenDay < -0.06 || thirtyDay < -0.12 || position.returnPct < -0.2) {
    return { signal: 'REDUCE', reason: '下落率がリスク閾値を超過。縮小または様子見。' };
  }

  return { signal: 'HOLD', reason: '優位性が中立。現ポジション維持。' };
}

export function calculateRiskScore(maxDrawdownPct: number, volatilityPct: number): number {
  const drawdownPenalty = Math.min(Math.abs(maxDrawdownPct) * 260, 65);
  const volatilityPenalty = Math.min(Math.abs(volatilityPct) * 80, 35);
  return Math.round(Math.max(0, Math.min(100, 100 - drawdownPenalty - volatilityPenalty)));
}

function positiveNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
