export type StrategyParams = {
  initialCapital: number;
  fastEma: number;
  slowEma: number;
  rsiPeriod: number;
  rsiEntryMin: number;
  rsiEntryMax: number;
  atrPeriod: number;
  atrStopMultiplier: number;
  takeProfitAtr: number;
  trailingAtr: number;
  riskPerTrade: number;
  maxPositionPct: number;
  minTrendPct: number;
  feeBps: number;
  slippageBps: number;
  maxDrawdownStop: number;
};

export const defaultParams: StrategyParams = {
  initialCapital: 10_000,
  fastEma: 21,
  slowEma: 55,
  rsiPeriod: 14,
  rsiEntryMin: 48,
  rsiEntryMax: 68,
  atrPeriod: 14,
  atrStopMultiplier: 2.4,
  takeProfitAtr: 4.2,
  trailingAtr: 2.7,
  riskPerTrade: 0.01,
  maxPositionPct: 0.35,
  minTrendPct: 0.004,
  feeBps: 8,
  slippageBps: 5,
  maxDrawdownStop: 0.18
};

export function isValidParams(params: StrategyParams): boolean {
  return (
    params.initialCapital > 0 &&
    params.fastEma > 1 &&
    params.slowEma > params.fastEma &&
    params.rsiPeriod > 1 &&
    params.rsiEntryMin >= 0 &&
    params.rsiEntryMax <= 100 &&
    params.rsiEntryMin < params.rsiEntryMax &&
    params.atrPeriod > 1 &&
    params.atrStopMultiplier > 0 &&
    params.takeProfitAtr > 0 &&
    params.trailingAtr > 0 &&
    params.riskPerTrade > 0 &&
    params.riskPerTrade <= 0.05 &&
    params.maxPositionPct > 0 &&
    params.maxPositionPct <= 1 &&
    params.minTrendPct >= 0 &&
    params.feeBps >= 0 &&
    params.slippageBps >= 0 &&
    params.maxDrawdownStop > 0 &&
    params.maxDrawdownStop <= 0.8
  );
}
