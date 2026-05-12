import { Candle } from './types';

export type NullableSeries = Array<number | null>;

export function ema(values: number[], period: number): NullableSeries {
  if (period <= 1) return values.map((value) => value);
  const output: NullableSeries = Array(values.length).fill(null);
  if (values.length < period) return output;

  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output[period - 1] = seed;
  const multiplier = 2 / (period + 1);

  for (let index = period; index < values.length; index += 1) {
    const previous = output[index - 1] ?? seed;
    output[index] = (values[index] - previous) * multiplier + previous;
  }

  return output;
}

export function rsi(values: number[], period: number): NullableSeries {
  const output: NullableSeries = Array(values.length).fill(null);
  if (values.length <= period) return output;

  let gain = 0;
  let loss = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) gain += change;
    else loss += Math.abs(change);
  }

  let avgGain = gain / period;
  let avgLoss = loss / period;
  output[period] = calculateRsi(avgGain, avgLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const currentGain = Math.max(change, 0);
    const currentLoss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
    output[index] = calculateRsi(avgGain, avgLoss);
  }

  return output;
}

function calculateRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0 && avgGain === 0) return 50;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function atr(candles: Candle[], period: number): NullableSeries {
  const output: NullableSeries = Array(candles.length).fill(null);
  if (candles.length <= period) return output;

  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  const seed = trueRanges.slice(1, period + 1).reduce((sum, value) => sum + value, 0) / period;
  output[period] = seed;

  for (let index = period + 1; index < candles.length; index += 1) {
    const previous = output[index - 1] ?? seed;
    output[index] = (previous * (period - 1) + trueRanges[index]) / period;
  }

  return output;
}
