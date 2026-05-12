export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Position = {
  quantity: number;
  entryPrice: number;
  entryTime: number;
  entryAtr: number;
  stopPrice: number;
  highestClose: number;
  feesPaid: number;
};

export type Trade = {
  side: 'long';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  feesPaid: number;
  exitReason: 'stop' | 'trailingStop' | 'takeProfit' | 'trendExit' | 'endOfData';
};

export type EquityPoint = {
  timestamp: number;
  equity: number;
  drawdown: number;
};

export type BacktestMetrics = {
  initialCapital: number;
  finalEquity: number;
  totalReturn: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  tradeCount: number;
  sharpe: number;
  exposure: number;
};

export type BacktestResult = {
  trades: Trade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
};
