import { Candle } from '../lib/types';

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';

export type OrderIntent = {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  clientOrderId: string;
  reason: string;
};

export type OrderResult = {
  exchangeOrderId: string;
  status: 'accepted' | 'rejected' | 'filled' | 'partiallyFilled' | 'cancelled';
  filledQuantity: number;
  averagePrice?: number;
  raw?: unknown;
};

export type PortfolioSnapshot = {
  timestamp: number;
  equityUsd: number;
  cashUsd: number;
  positions: Array<{
    symbol: string;
    quantity: number;
    markPrice: number;
    unrealizedPnl: number;
  }>;
};

export interface MarketDataProvider {
  getRecentCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]>;
  getLastPrice(symbol: string): Promise<number>;
}

export interface ExecutionAdapter {
  dryRun: boolean;
  placeOrder(intent: OrderIntent): Promise<OrderResult>;
  cancelOrder(symbol: string, exchangeOrderId: string): Promise<void>;
}

export interface PositionStore {
  loadPortfolio(): Promise<PortfolioSnapshot>;
  savePortfolio(snapshot: PortfolioSnapshot): Promise<void>;
}

export interface AuditLogger {
  info(event: string, payload: Record<string, unknown>): Promise<void>;
  warn(event: string, payload: Record<string, unknown>): Promise<void>;
  error(event: string, payload: Record<string, unknown>): Promise<void>;
}
