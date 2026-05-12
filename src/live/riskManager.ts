import { OrderIntent, PortfolioSnapshot } from './interfaces';

export type LiveRiskLimits = {
  maxOrderUsd: number;
  maxPositionUsd: number;
  maxDailyLossPct: number;
  maxConsecutiveLosses: number;
  maxApiFailures: number;
  allowedSymbols: string[];
};

export type RiskState = {
  dailyPnlPct: number;
  consecutiveLosses: number;
  apiFailures: number;
  killSwitch: boolean;
};

export type RiskDecision =
  | { approved: true; order: OrderIntent }
  | { approved: false; reason: string };

export function approveOrder(
  order: OrderIntent,
  lastPrice: number,
  portfolio: PortfolioSnapshot,
  limits: LiveRiskLimits,
  state: RiskState
): RiskDecision {
  if (state.killSwitch) return reject('kill switch is active');
  if (!limits.allowedSymbols.includes(order.symbol)) return reject(`symbol is not allowed: ${order.symbol}`);
  if (state.dailyPnlPct <= -Math.abs(limits.maxDailyLossPct)) return reject('daily loss limit exceeded');
  if (state.consecutiveLosses >= limits.maxConsecutiveLosses) return reject('consecutive loss limit exceeded');
  if (state.apiFailures >= limits.maxApiFailures) return reject('api failure limit exceeded');

  const orderUsd = order.quantity * (order.limitPrice ?? lastPrice);
  if (orderUsd <= 0) return reject('invalid order notional');
  if (orderUsd > limits.maxOrderUsd) return reject('order notional exceeds maxOrderUsd');

  const existing = portfolio.positions.find((position) => position.symbol === order.symbol);
  const existingUsd = existing ? Math.abs(existing.quantity * existing.markPrice) : 0;
  if (order.side === 'buy' && existingUsd + orderUsd > limits.maxPositionUsd) {
    return reject('position notional would exceed maxPositionUsd');
  }

  return { approved: true, order };
}

function reject(reason: string): RiskDecision {
  return { approved: false, reason };
}
