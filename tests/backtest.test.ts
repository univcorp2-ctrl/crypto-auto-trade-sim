import { describe, expect, it } from 'vitest';
import { runBacktest } from '../src/lib/backtest';
import { generateScenario } from '../src/lib/sampleData';
import { defaultParams } from '../src/lib/strategy';

describe('runBacktest', () => {
  it('returns metrics and equity curve', () => {
    const candles = generateScenario('trend', 240);
    const result = runBacktest(candles, defaultParams);
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.metrics.initialCapital).toBe(defaultParams.initialCapital);
    expect(result.metrics.finalEquity).toBeGreaterThan(0);
  });

  it('returns empty result for invalid parameter combinations', () => {
    const candles = generateScenario('trend', 100);
    const result = runBacktest(candles, { ...defaultParams, slowEma: 10, fastEma: 20 });
    expect(result.trades).toHaveLength(0);
    expect(result.metrics.finalEquity).toBe(defaultParams.initialCapital);
  });
});
