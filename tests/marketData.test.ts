import { describe, expect, it } from 'vitest';
import { calculateDailyReturnStats, DailyKline, parseBinanceKline } from '../src/lib/marketData';

describe('market data helpers', () => {
  it('parses Binance kline arrays', () => {
    const parsed = parseBinanceKline([
      1_700_000_000_000,
      '100',
      '115',
      '95',
      '110',
      '1234.5',
      1_700_086_399_999,
      '0',
      100,
      '0',
      '0',
      '0'
    ]);

    expect(parsed.open).toBe(100);
    expect(parsed.high).toBe(115);
    expect(parsed.low).toBe(95);
    expect(parsed.close).toBe(110);
    expect(parsed.volume).toBe(1234.5);
  });

  it('calculates today and lookback returns from current price', () => {
    const day = 24 * 60 * 60 * 1000;
    const base = Date.UTC(2025, 0, 1);
    const klines: DailyKline[] = Array.from({ length: 31 }, (_, index) => ({
      openTime: base + index * day,
      closeTime: base + (index + 1) * day - 1,
      open: 100 + index,
      high: 105 + index,
      low: 95 + index,
      close: 101 + index,
      volume: 1000
    }));

    const stats = calculateDailyReturnStats(140, klines);

    expect(stats.todayOpen).toBe(130);
    expect(stats.todayReturn).toBeCloseTo(140 / 130 - 1);
    expect(stats.previousCloseReturn).toBeCloseTo(140 / 130 - 1);
    expect(stats.sevenDayReturn).toBeCloseTo(140 / 124 - 1);
    expect(stats.thirtyDayReturn).toBeCloseTo(140 / 101 - 1);
    expect(stats.dailyRows.at(-1)?.isCurrentDay).toBe(true);
  });
});
