import { DailyKline, PriceMap } from './liveMarket';

export type PortfolioAssetConfig = {
  symbol: string;
  label: string;
  allocationPct: number;
};

export type PortfolioPosition = {
  symbol: string;
  label: string;
  allocationPct: number;
  allocationJpy: number;
  entryUsdJpy: number;
  entryPriceUsdt: number;
  effectiveEntryPriceUsdt: number;
  quantity: number;
};

export type PortfolioState = {
  startedAt: string;
  initialInvestmentJpy: number;
  entryUsdJpy: number;
  positions: PortfolioPosition[];
};

export type PortfolioRow = PortfolioPosition & {
  currentPriceUsdt: number;
  valueJpy: number;
  pnlJpy: number;
  returnPct: number;
  todayOpenValueJpy: number | null;
};

export type PortfolioSnapshot = {
  totalValueJpy: number;
  totalPnlJpy: number;
  totalReturnPct: number;
  todayReturnPct: number | null;
  rows: PortfolioRow[];
};

export const defaultPortfolioAssets: PortfolioAssetConfig[] = [
  { symbol: 'BTCUSDT', label: 'Bitcoin', allocationPct: 0.34 },
  { symbol: 'ETHUSDT', label: 'Ethereum', allocationPct: 0.33 },
  { symbol: 'SOLUSDT', label: 'Solana', allocationPct: 0.33 }
];

export function createPortfolioState(
  assets: PortfolioAssetConfig[],
  prices: PriceMap,
  usdJpy: number,
  initialInvestmentJpy = 1_000_000,
  entryFeeBps = 10,
  entrySlippageBps = 5
): PortfolioState {
  const normalized = normalizeAllocations(assets);
  const costMultiplier = 1 + (entryFeeBps + entrySlippageBps) / 10_000;

  return {
    startedAt: new Date().toISOString(),
    initialInvestmentJpy,
    entryUsdJpy: usdJpy,
    positions: normalized.map((asset) => {
      const entryPrice = prices[asset.symbol];
      if (!entryPrice || entryPrice <= 0) throw new Error(`missing entry price for ${asset.symbol}`);
      const allocationJpy = initialInvestmentJpy * asset.allocationPct;
      const allocationUsdt = allocationJpy / usdJpy;
      const effectiveEntryPriceUsdt = entryPrice * costMultiplier;
      return {
        ...asset,
        allocationJpy,
        entryUsdJpy: usdJpy,
        entryPriceUsdt: entryPrice,
        effectiveEntryPriceUsdt,
        quantity: allocationUsdt / effectiveEntryPriceUsdt
      };
    })
  };
}

export function calculatePortfolioSnapshot(
  state: PortfolioState,
  prices: PriceMap,
  usdJpy: number,
  dailyKlines: Record<string, DailyKline[]> = {}
): PortfolioSnapshot {
  const rows: PortfolioRow[] = state.positions.map((position) => {
    const currentPrice = prices[position.symbol];
    if (!currentPrice || currentPrice <= 0) throw new Error(`missing current price for ${position.symbol}`);
    const valueJpy = position.quantity * currentPrice * usdJpy;
    const pnlJpy = valueJpy - position.allocationJpy;
    const klines = dailyKlines[position.symbol] || [];
    const latest = klines.at(-1);
    const todayOpenValueJpy = latest?.open ? position.quantity * latest.open * usdJpy : null;

    return {
      ...position,
      currentPriceUsdt: currentPrice,
      valueJpy,
      pnlJpy,
      returnPct: pnlJpy / position.allocationJpy,
      todayOpenValueJpy
    };
  });

  const totalValueJpy = rows.reduce((sum, row) => sum + row.valueJpy, 0);
  const totalPnlJpy = totalValueJpy - state.initialInvestmentJpy;
  const todayOpenValueJpy = rows.every((row) => row.todayOpenValueJpy !== null)
    ? rows.reduce((sum, row) => sum + (row.todayOpenValueJpy ?? 0), 0)
    : null;

  return {
    totalValueJpy,
    totalPnlJpy,
    totalReturnPct: totalPnlJpy / state.initialInvestmentJpy,
    todayReturnPct: todayOpenValueJpy && todayOpenValueJpy > 0 ? totalValueJpy / todayOpenValueJpy - 1 : null,
    rows
  };
}

export function normalizeAllocations(assets: PortfolioAssetConfig[]): PortfolioAssetConfig[] {
  const total = assets.reduce((sum, asset) => sum + asset.allocationPct, 0);
  if (assets.length === 0 || total <= 0) throw new Error('portfolio assets must have positive allocations');
  return assets.map((asset) => ({ ...asset, allocationPct: asset.allocationPct / total }));
}
