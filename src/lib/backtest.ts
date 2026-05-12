import { atr, ema, rsi } from './indicators';
import { isValidParams, StrategyParams } from './strategy';
import { BacktestMetrics, BacktestResult, Candle, EquityPoint, Position, Trade } from './types';

export function runBacktest(candles: Candle[], params: StrategyParams): BacktestResult {
  if (!isValidParams(params) || candles.length < Math.max(params.slowEma, params.atrPeriod, params.rsiPeriod) + 2) {
    return emptyResult(params.initialCapital);
  }

  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const closes = sorted.map((candle) => candle.close);
  const fast = ema(closes, Math.round(params.fastEma));
  const slow = ema(closes, Math.round(params.slowEma));
  const rsiValues = rsi(closes, Math.round(params.rsiPeriod));
  const atrValues = atr(sorted, Math.round(params.atrPeriod));

  let cash = params.initialCapital;
  let position: Position | null = null;
  let equityHigh = params.initialCapital;
  let tradingStopped = false;
  let exposureBars = 0;

  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const candle = sorted[index];
    const previousCandle = sorted[index - 1];
    const currentFast = fast[index];
    const currentSlow = slow[index];
    const currentRsi = rsiValues[index];
    const currentAtr = atrValues[index];

    if (position) {
      exposureBars += 1;
      position.highestClose = Math.max(position.highestClose, candle.close);

      if (currentAtr) {
        const trailingStop = position.highestClose - currentAtr * params.trailingAtr;
        position.stopPrice = Math.max(position.stopPrice, trailingStop);
      }

      const takeProfitPrice = position.entryPrice + position.entryAtr * params.takeProfitAtr;
      let exitReason: Trade['exitReason'] | null = null;
      let exitPrice = candle.close;

      if (candle.low <= position.stopPrice) {
        exitReason = position.stopPrice > position.entryPrice ? 'trailingStop' : 'stop';
        exitPrice = position.stopPrice;
      } else if (candle.high >= takeProfitPrice) {
        exitReason = 'takeProfit';
        exitPrice = takeProfitPrice;
      } else if (currentSlow !== null && previousCandle.close >= currentSlow && candle.close < currentSlow) {
        exitReason = 'trendExit';
      }

      if (exitReason) {
        const executedExit = applySlippage(exitPrice, params.slippageBps, 'sell');
        const grossExit = position.quantity * executedExit;
        const exitFee = fee(grossExit, params.feeBps);
        cash += grossExit - exitFee;

        const entryValue = position.quantity * position.entryPrice;
        const exitValue = position.quantity * executedExit;
        const pnl = exitValue - entryValue - position.feesPaid - exitFee;

        trades.push({
          side: 'long',
          entryTime: position.entryTime,
          exitTime: candle.timestamp,
          entryPrice: position.entryPrice,
          exitPrice: executedExit,
          quantity: position.quantity,
          pnl,
          pnlPct: pnl / Math.max(entryValue, 1),
          feesPaid: position.feesPaid + exitFee,
          exitReason
        });

        position = null;
      }
    }

    const markToMarket = calculateEquity(cash, position, candle.close);
    equityHigh = Math.max(equityHigh, markToMarket);
    const drawdown = equityHigh === 0 ? 0 : (equityHigh - markToMarket) / equityHigh;
    if (drawdown >= params.maxDrawdownStop) {
      tradingStopped = true;
    }

    if (!position && !tradingStopped && currentFast !== null && currentSlow !== null && currentRsi !== null && currentAtr !== null) {
      const trendPct = (currentFast - currentSlow) / candle.close;
      const previousFast = fast[index - 1];
      const previousSlow = slow[index - 1];
      const trendTurnedUp = previousFast !== null && previousSlow !== null && previousFast <= previousSlow && currentFast > currentSlow;
      const trendContinuation = currentFast > currentSlow && candle.close > currentFast && previousCandle.close <= previousCandle.open;
      const entrySignal =
        currentFast > currentSlow &&
        trendPct >= params.minTrendPct &&
        candle.close > currentFast &&
        currentRsi >= params.rsiEntryMin &&
        currentRsi <= params.rsiEntryMax &&
        (trendTurnedUp || trendContinuation);

      if (entrySignal) {
        const executedEntry = applySlippage(candle.close, params.slippageBps, 'buy');
        const stopDistance = Math.max(currentAtr * params.atrStopMultiplier, executedEntry * 0.002);
        const equity = calculateEquity(cash, null, candle.close);
        const riskBudget = equity * params.riskPerTrade;
        const qtyByRisk = riskBudget / stopDistance;
        const qtyByCapital = (equity * params.maxPositionPct) / executedEntry;
        const quantity = Math.max(0, Math.min(qtyByRisk, qtyByCapital));
        const notional = quantity * executedEntry;
        const entryFee = fee(notional, params.feeBps);

        if (quantity > 0 && cash > notional + entryFee) {
          cash -= notional + entryFee;
          position = {
            quantity,
            entryPrice: executedEntry,
            entryTime: candle.timestamp,
            entryAtr: currentAtr,
            stopPrice: executedEntry - stopDistance,
            highestClose: candle.close,
            feesPaid: entryFee
          };
        }
      }
    }

    const equity = calculateEquity(cash, position, candle.close);
    equityHigh = Math.max(equityHigh, equity);
    equityCurve.push({
      timestamp: candle.timestamp,
      equity,
      drawdown: equityHigh === 0 ? 0 : (equityHigh - equity) / equityHigh
    });
  }

  const last = sorted.at(-1);
  if (position && last) {
    const executedExit = applySlippage(last.close, params.slippageBps, 'sell');
    const grossExit = position.quantity * executedExit;
    const exitFee = fee(grossExit, params.feeBps);
    cash += grossExit - exitFee;
    const entryValue = position.quantity * position.entryPrice;
    const exitValue = position.quantity * executedExit;
    const pnl = exitValue - entryValue - position.feesPaid - exitFee;
    trades.push({
      side: 'long',
      entryTime: position.entryTime,
      exitTime: last.timestamp,
      entryPrice: position.entryPrice,
      exitPrice: executedExit,
      quantity: position.quantity,
      pnl,
      pnlPct: pnl / Math.max(entryValue, 1),
      feesPaid: position.feesPaid + exitFee,
      exitReason: 'endOfData'
    });
    equityCurve.push({ timestamp: last.timestamp, equity: cash, drawdown: calculateMaxDrawdownValue(equityCurve, cash) });
  }

  return {
    trades,
    equityCurve,
    metrics: calculateMetrics(params.initialCapital, cash, trades, equityCurve, exposureBars, sorted.length)
  };
}

function fee(notional: number, feeBps: number): number {
  return notional * (feeBps / 10_000);
}

function applySlippage(price: number, slippageBps: number, side: 'buy' | 'sell'): number {
  const adjustment = slippageBps / 10_000;
  return side === 'buy' ? price * (1 + adjustment) : price * (1 - adjustment);
}

function calculateEquity(cash: number, position: Position | null, markPrice: number): number {
  return cash + (position ? position.quantity * markPrice : 0);
}

function calculateMetrics(
  initialCapital: number,
  finalEquity: number,
  trades: Trade[],
  equityCurve: EquityPoint[],
  exposureBars: number,
  totalBars: number
): BacktestMetrics {
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));

  return {
    initialCapital,
    finalEquity,
    totalReturn: finalEquity / initialCapital - 1,
    maxDrawdown: calculateMaxDrawdown(equityCurve),
    winRate: trades.length === 0 ? 0 : wins.length / trades.length,
    profitFactor: grossLoss === 0 ? Number.POSITIVE_INFINITY : grossProfit / grossLoss,
    tradeCount: trades.length,
    sharpe: calculateSharpe(equityCurve),
    exposure: totalBars === 0 ? 0 : exposureBars / totalBars
  };
}

function calculateSharpe(equityCurve: EquityPoint[]): number {
  if (equityCurve.length < 3) return 0;
  const returns: number[] = [];
  for (let index = 1; index < equityCurve.length; index += 1) {
    const previous = equityCurve[index - 1].equity;
    if (previous > 0) returns.push(equityCurve[index].equity / previous - 1);
  }
  if (returns.length < 2) return 0;
  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (returns.length - 1);
  const stdev = Math.sqrt(variance);
  if (stdev === 0) return 0;
  return (average / stdev) * Math.sqrt(365);
}

function calculateMaxDrawdown(equityCurve: EquityPoint[]): number {
  return equityCurve.reduce((max, point) => Math.max(max, point.drawdown), 0);
}

function calculateMaxDrawdownValue(equityCurve: EquityPoint[], equity: number): number {
  const peak = Math.max(...equityCurve.map((point) => point.equity), equity);
  return peak === 0 ? 0 : (peak - equity) / peak;
}

function emptyResult(initialCapital: number): BacktestResult {
  return {
    trades: [],
    equityCurve: [{ timestamp: Date.now(), equity: initialCapital, drawdown: 0 }],
    metrics: {
      initialCapital,
      finalEquity: initialCapital,
      totalReturn: 0,
      maxDrawdown: 0,
      winRate: 0,
      profitFactor: 0,
      tradeCount: 0,
      sharpe: 0,
      exposure: 0
    }
  };
}
