import { describe, expect, it } from 'vitest';
import { calculatePortfolioSnapshot, createPortfolioState, defaultPortfolioAssets } from '../src/lib/portfolioPerformance';

describe('portfolio performance', () => {
  it('creates initial positions from a 1,000,000 JPY portfolio', () => {
    const state = createPortfolioState(
      defaultPortfolioAssets,
      { BTCUSDT: 100_000, ETHUSDT: 5_000, SOLUSDT: 200 },
      150,
      1_000_000,
      0,
      0
    );

    expect(state.positions).toHaveLength(3);
    expect(state.initialInvestmentJpy).toBe(1_000_000);
    expect(state.positions[0].quantity).toBeCloseTo((1_000_000 * 0.34 / 150) / 100_000);
  });

  it('calculates JPY value, pnl and return', () => {
    const state = createPortfolioState(
      defaultPortfolioAssets,
      { BTCUSDT: 100_000, ETHUSDT: 5_000, SOLUSDT: 200 },
      150,
      1_000_000,
      0,
      0
    );

    const snapshot = calculatePortfolioSnapshot(
      state,
      { BTCUSDT: 110_000, ETHUSDT: 4_500, SOLUSDT: 220 },
      150,
      {
        BTCUSDT: [{ openTime: 1, closeTime: 2, open: 100_000, high: 111_000, low: 99_000, close: 110_000 }],
        ETHUSDT: [{ openTime: 1, closeTime: 2, open: 5_000, high: 5_050, low: 4_450, close: 4_500 }],
        SOLUSDT: [{ openTime: 1, closeTime: 2, open: 200, high: 225, low: 198, close: 220 }]
      }
    );

    expect(snapshot.totalValueJpy).toBeGreaterThan(1_000_000);
    expect(snapshot.rows[0].returnPct).toBeCloseTo(0.1);
    expect(snapshot.todayReturnPct).not.toBeNull();
  });
});
