import { Candle } from './types';

export type ScenarioName = 'trend' | 'range' | 'crashRecovery';

export function generateScenario(name: ScenarioName, length = 420): Candle[] {
  switch (name) {
    case 'range':
      return generateCandles(length, 62_000, (i) => Math.sin(i / 12) * 0.012, 0.022, 7);
    case 'crashRecovery':
      return generateCandles(
        length,
        72_000,
        (i) => {
          if (i < length * 0.28) return -0.006;
          if (i < length * 0.42) return -0.018;
          if (i < length * 0.62) return 0.01;
          return 0.004;
        },
        0.03,
        19
      );
    case 'trend':
    default:
      return generateCandles(length, 48_000, (i) => 0.0025 + Math.sin(i / 31) * 0.006, 0.026, 3);
  }
}

function generateCandles(
  length: number,
  startPrice: number,
  drift: (index: number) => number,
  volatility: number,
  seed: number
): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const start = Date.UTC(2024, 0, 1);
  let random = seededRandom(seed);

  for (let index = 0; index < length; index += 1) {
    const open = price;
    const noise = (random() - 0.5) * volatility;
    const close = Math.max(10, open * (1 + drift(index) + noise));
    const high = Math.max(open, close) * (1 + random() * volatility * 0.8);
    const low = Math.min(open, close) * (1 - random() * volatility * 0.8);
    const volume = 800 + random() * 2_600;

    candles.push({
      timestamp: start + index * 24 * 60 * 60 * 1000,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: round(volume)
    });

    price = close;
  }

  return candles;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseCandlesCsv(csv: string): Candle[] {
  return csv
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((cell) => cell.trim()))
    .filter((cells, index) => !(index === 0 && Number.isNaN(Number(cells[1]))))
    .map((cells) => {
      const [time, open, high, low, close, volume] = cells;
      const timestamp = Number.isFinite(Number(time)) ? Number(time) : Date.parse(time);
      return {
        timestamp,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume ?? 0)
      };
    })
    .filter(
      (candle) =>
        Number.isFinite(candle.timestamp) &&
        candle.open > 0 &&
        candle.high > 0 &&
        candle.low > 0 &&
        candle.close > 0 &&
        candle.high >= candle.low
    );
}
