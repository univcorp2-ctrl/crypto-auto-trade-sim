export type TradeSignal = 'BUY' | 'HOLD' | 'REDUCE';

export type HistoryPoint = {
  date: string;
  valueJpy: number;
  returnPct: number;
};

export type Position = {
  symbol: string;
  label: string;
  allocationPct: number;
  quantity: number;
  allocationJpy: number;
  entryPriceUsdt: number;
  currentPriceUsdt: number;
  valueJpy: number;
  pnlJpy: number;
  returnPct: number;
  sevenDayReturnPct: number | null;
  thirtyDayReturnPct: number | null;
  signal: TradeSignal;
  signalReason: string;
};

export type DashboardData = {
  generatedAt: string;
  timeZone: string;
  publicDashboardUrl: string;
  source: {
    exchange: string;
    restBaseUrl: string;
    fxProvider: string;
    quoteCurrency: string;
    baseCurrency: string;
    mode: 'live-public-data' | 'fallback-sample-data';
  };
  automation: {
    dryRun: boolean;
    liveTradingEnabled: boolean;
    scheduleLabel: string;
    cronUtc: string;
    githubActionsWorkflow: string;
  };
  portfolio: {
    name: string;
    startedAt: string;
    initialInvestmentJpy: number;
    entryUsdJpy: number;
    currentUsdJpy: number;
    entryFeeBps: number;
    entrySlippageBps: number;
    currentValueJpy: number;
    pnlJpy: number;
    totalReturnPct: number;
    todayReturnPct: number | null;
    previousCloseReturnPct: number | null;
    sevenDayReturnPct: number | null;
    thirtyDayReturnPct: number | null;
    maxDrawdownPct: number;
    volatilityPct: number;
    riskScore: number;
    positions: Position[];
    history: HistoryPoint[];
  };
};
