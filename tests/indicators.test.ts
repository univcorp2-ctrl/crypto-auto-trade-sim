import { describe, expect, it } from 'vitest';
import { atr, ema, rsi } from '../src/lib/indicators';
import { Candle } from '../src/lib/types';

describe('indicators', () => {
  it('calculates ema with null warmup', () => {
    const result = ema([1, 2, 3, 4, 5], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2);
    expect(result[4]).toBeGreaterThan(3);
  });

  it('calculates rsi for rising prices', () => {
    const result = rsi([1, 2, 3, 4, 5, 6, 7], 3);
    expect(result[3]).toBe(100);
    expect(result[6]).toBe(100);
  });

  it('calculates atr after warmup', () => {
    const candles: Candle[] = [
      { timestamp: 1, open: 10, high: 12, low: 9, close: 11, volume: 1 },
      { timestamp: 2, open: 11, high: 13, low: 10, close: 12, volume: 1 },
      { timestamp: 3, open: 12, high: 14, low: 11, close: 13, volume: 1 },
      { timestamp: 4, open: 13, high: 15, low: 12, close: 14, volume: 1 }
    ];
    const result = atr(candles, 2);
    expect(result[0]).toBeNull();
    expect(result[2]).toBeGreaterThan(0);
    expect(result[3]).toBeGreaterThan(0);
  });
});
