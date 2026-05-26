import { describe, expect, it } from 'vitest';
import {
  calculateAnnualizedVolatility,
  calculateMaxDrawdown,
  calculateReturn,
  calculateRiskScore,
  getTradeSignal,
  normalizeAllocations
} from '../src/portfolio';

const sampleHistory = [
  { date: '2026-05-01', valueJpy: 100 },
  { date: '2026-05-02', valueJpy: 120 },
  { date: '2026-05-03', valueJpy: 90 },
  { date: '2026-05-04', valueJpy: 110 }
].map((point) => ({ ...point, returnPct: calculateReturn(point.valueJpy, 100) }));

describe('portfolio calculations', () => {
  it('normalizes percentage allocations into ratios', () => {
    const normalized = normalizeAllocations([
      { symbol: 'BTCUSDT', allocationPct: 34 },
      { symbol: 'ETHUSDT', allocationPct: 33 },
      { symbol: 'SOLUSDT', allocationPct: 33 }
    ]);

    expect(normalized.reduce((sum, asset) => sum + asset.allocationPct, 0)).toBeCloseTo(1);
    expect(normalized[0].allocationPct).toBeCloseTo(0.34);
  });

  it('calculates return from current and initial values', () => {
    expect(calculateReturn(1_100_000, 1_000_000)).toBeCloseTo(0.1);
    expect(calculateReturn(900_000, 1_000_000)).toBeCloseTo(-0.1);
  });

  it('calculates max drawdown as a negative percentage', () => {
    expect(calculateMaxDrawdown(sampleHistory)).toBeCloseTo(-0.25);
  });

  it('calculates annualized volatility above zero when history changes', () => {
    expect(calculateAnnualizedVolatility(sampleHistory)).toBeGreaterThan(0);
  });

  it('generates buy and reduce signals from momentum and risk', () => {
    expect(getTradeSignal({ sevenDayReturnPct: 0.06, thirtyDayReturnPct: 0.04, returnPct: 0.1 }).signal).toBe('BUY');
    expect(getTradeSignal({ sevenDayReturnPct: -0.08, thirtyDayReturnPct: 0.01, returnPct: -0.05 }).signal).toBe('REDUCE');
    expect(getTradeSignal({ sevenDayReturnPct: 0.01, thirtyDayReturnPct: 0.01, returnPct: 0.02 }).signal).toBe('HOLD');
  });

  it('keeps risk score within the 0 to 100 range', () => {
    expect(calculateRiskScore(-0.2, 0.5)).toBeGreaterThanOrEqual(0);
    expect(calculateRiskScore(-0.01, 0.05)).toBeLessThanOrEqual(100);
  });
});
