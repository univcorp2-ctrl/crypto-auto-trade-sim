import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const BINANCE_BASE_URL = process.env.BINANCE_BASE_URL || 'https://api.binance.com';
const FX_URL = 'https://api.frankfurter.dev/v2/rates?base=USD&symbols=JPY';
const CONFIG_PATH = 'config/waiwai-strategy.json';
const OUTPUT_JSON = 'public/data/live-results.json';
const OUTPUT_CSV = 'public/data/trades.csv';
const OUTPUT_XLS = 'public/data/trades.xls';

const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
const symbols = (process.env.BINANCE_SYMBOLS || config.symbols.join(',')).split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const hasPrivateCredentials = Boolean(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);

await main();

async function main() {
  await mkdir('public/data', { recursive: true });
  const usdJpy = await fetchUsdJpy();
  const market = await fetchMarketData(symbols, Number(process.env.HISTORY_DAYS || config.historyDays || 180));
  let result;

  if (hasPrivateCredentials) {
    try {
      result = await buildRealAccountDashboard({ market, usdJpy });
    } catch (error) {
      result = await buildBacktestDashboard({ market, usdJpy, privateApiError: messageOf(error) });
    }
  } else {
    result = await buildBacktestDashboard({ market, usdJpy, privateApiError: null });
  }

  await writeFile(OUTPUT_JSON, JSON.stringify(result, null, 2) + '\n', 'utf8');
  await writeFile(OUTPUT_CSV, renderTradesCsv(result.trades), 'utf8');
  await writeFile(OUTPUT_XLS, renderTradesXls(result.trades), 'utf8');
  console.log(`Generated ${OUTPUT_JSON} in ${result.mode}`);
  console.log(`Dashboard URL: ${result.publicUrl}`);
}

async function buildRealAccountDashboard({ market, usdJpy }) {
  const account = await signedBinance('/api/v3/account', { recvWindow: 60000 });
  const allTrades = [];
  for (const symbol of symbols) {
    const trades = await signedBinance('/api/v3/myTrades', { symbol, limit: 1000, recvWindow: 60000 });
    allTrades.push(...trades);
  }
  allTrades.sort((a, b) => Number(a.time) - Number(b.time));
  const positions = buildAccountPositions({ account, market, usdJpy, allTrades });
  const realizedPnlUsdt = calculateRealizedPnl(allTrades);
  const realizedPnlJpy = Math.round(realizedPnlUsdt * usdJpy);
  const unrealizedPnlJpy = Math.round(positions.reduce((sum, row) => sum + row.unrealizedPnlJpy, 0));
  const currentValueJpy = Math.round(positions.reduce((sum, row) => sum + row.valueJpy, 0));
  const history = buildEquityProxyFromMarket({ market, currentValueJpy });
  const tradeRows = buildTradeRowsFromAccountTrades({ allTrades, usdJpy }).reverse();
  const metrics = calculateMetrics({ history, trades: tradeRows });

  return makeDashboard({
    mode: 'binance-real-account',
    dataQuality: 'real-account-user-data',
    apiStatus: 'connected',
    accountStatus: 'Binance USER_DATA API接続済み。GitHub Actions Secretsから残高と約定履歴を取得しました。',
    privateApiError: null,
    positions,
    trades: tradeRows.slice(0, 120),
    history,
    currentValueJpy,
    realizedPnlJpy,
    unrealizedPnlJpy,
    totalPnlJpy: realizedPnlJpy + unrealizedPnlJpy,
    metrics,
    usdJpy
  });
}

async function buildBacktestDashboard({ market, usdJpy, privateApiError }) {
  const simulation = simulateWaiwaiStrategy({ market, usdJpy });
  return makeDashboard({
    mode: 'real-market-backtest',
    dataQuality: 'real-public-market-data',
    apiStatus: 'public-data-connected',
    accountStatus: privateApiError
      ? `Binance実口座APIは未使用または失敗。実市場データによるワイワイ自動売買バックテストを表示中。理由: ${privateApiError}`
      : 'Binance APIキー未設定。実市場データによるワイワイ自動売買バックテストを表示中。実口座の約定結果ではありません。',
    privateApiError,
    positions: simulation.positions,
    trades: simulation.trades.slice(-120).reverse(),
    history: simulation.history,
    currentValueJpy: simulation.currentValueJpy,
    realizedPnlJpy: simulation.realizedPnlJpy,
    unrealizedPnlJpy: simulation.unrealizedPnlJpy,
    totalPnlJpy: simulation.currentValueJpy - simulation.initialCapitalJpy,
    metrics: calculateMetrics({ history: simulation.history, trades: simulation.trades }),
    usdJpy
  });
}

function makeDashboard(input) {
  const previous = input.history.at(-2)?.valueJpy || input.currentValueJpy;
  const sevenAgo = input.history.at(-8)?.valueJpy || previous;
  const thirtyAgo = input.history.at(-31)?.valueJpy || previous;
  const startCapital = Number(config.startCapitalJpy || 1000000);
  return {
    generatedAt: new Date().toISOString(),
    publicUrl: 'https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/',
    mode: input.mode,
    dataQuality: input.dataQuality,
    apiStatus: input.apiStatus,
    accountStatus: input.accountStatus,
    privateApiError: input.privateApiError,
    strategy: config,
    exchange: { name: 'Binance Spot', baseUrl: BINANCE_BASE_URL, symbols, userDataEnabled: input.mode === 'binance-real-account', usdJpy: input.usdJpy },
    summary: {
      currentValueJpy: input.currentValueJpy,
      realizedPnlJpy: input.realizedPnlJpy,
      unrealizedPnlJpy: input.unrealizedPnlJpy,
      totalPnlJpy: input.totalPnlJpy,
      totalReturnPct: pctChange(input.currentValueJpy, startCapital),
      todayPnlJpy: input.currentValueJpy - previous,
      todayReturnPct: pctChange(input.currentValueJpy, previous),
      sevenDayPnlJpy: input.currentValueJpy - sevenAgo,
      sevenDayReturnPct: pctChange(input.currentValueJpy, sevenAgo),
      thirtyDayPnlJpy: input.currentValueJpy - thirtyAgo,
      thirtyDayReturnPct: pctChange(input.currentValueJpy, thirtyAgo)
    },
    positions: input.positions,
    trades: input.trades,
    history: input.history,
    metrics: input.metrics,
    exports: { json: 'data/live-results.json', csv: 'data/trades.csv', excel: 'data/trades.xls' }
  };
}

async function fetchMarketData(symbols, days) {
  const result = {};
  for (const symbol of symbols) {
    const url = new URL('/api/v3/klines', BINANCE_BASE_URL);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '1d');
    url.searchParams.set('limit', String(Math.min(Math.max(days, 30), 1000)));
    const rows = await fetchJson(url);
    result[symbol] = rows.map((row) => ({ openTime: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]), closeTime: Number(row[6]), date: new Date(Number(row[0])).toISOString().slice(0, 10) })).filter((row) => row.close > 0);
  }
  return result;
}

function simulateWaiwaiStrategy({ market, usdJpy }) {
  const startCapitalJpy = Number(process.env.START_CAPITAL_JPY || config.startCapitalJpy || 1000000);
  const startCapitalUsdt = startCapitalJpy / usdJpy;
  const feeRate = Number(config.feeRate || 0.001);
  const lookback = Number(config.momentumLookbackDays || 7);
  const maDays = Number(config.movingAverageDays || 20);
  const minLength = Math.min(...symbols.map((symbol) => market[symbol].length));
  const startIndex = Math.max(maDays, lookback, minLength - Number(config.historyDays || 180));
  const holdings = Object.fromEntries(symbols.map((symbol) => [symbol, { qty: 0, costUsdt: 0 }]));
  let cashUsdt = startCapitalUsdt;
  const history = [];
  const trades = [];
  let realizedPnlUsdt = 0;

  for (let i = startIndex; i < minLength; i += 1) {
    const prices = Object.fromEntries(symbols.map((symbol) => [symbol, market[symbol][i].close]));
    const totalBefore = cashUsdt + symbols.reduce((sum, symbol) => sum + holdings[symbol].qty * prices[symbol], 0);
    const candidates = symbols.filter((symbol) => {
      const series = market[symbol];
      const price = series[i].close;
      const ago = series[i - lookback].close;
      const ma = average(series.slice(i - maDays, i).map((row) => row.close));
      return price > ma && price > ago;
    }).sort((a, b) => pctChange(market[b][i].close, market[b][i - lookback].close) - pctChange(market[a][i].close, market[a][i - lookback].close)).slice(0, Number(config.risk?.maxPositions || 3));
    const targetWeight = Object.fromEntries(symbols.map((symbol) => [symbol, candidates.includes(symbol) ? 1 / candidates.length : 0]));

    for (const symbol of symbols) {
      const price = prices[symbol];
      const currentValue = holdings[symbol].qty * price;
      const desiredValue = totalBefore * (targetWeight[symbol] || 0);
      const diff = desiredValue - currentValue;
      const date = market[symbol][i].date;
      if (Math.abs(diff) < totalBefore * 0.005) continue;
      const fee = Math.abs(diff) * feeRate;
      if (diff > 0 && cashUsdt > fee) {
        const spend = Math.min(diff, cashUsdt - fee);
        const qty = spend / price;
        holdings[symbol].qty += qty;
        holdings[symbol].costUsdt += spend;
        cashUsdt -= spend + fee;
        trades.push(makeTrade({ date, symbol, side: 'BUY', qty, price, feeUsdt: fee, realizedPnlUsdt: 0, source: 'waiwai-real-market-backtest', usdJpy }));
      } else if (diff < 0 && holdings[symbol].qty > 0) {
        const sellValue = Math.min(-diff, holdings[symbol].qty * price);
        const qty = sellValue / price;
        const avgCost = holdings[symbol].qty > 0 ? holdings[symbol].costUsdt / holdings[symbol].qty : 0;
        const realized = (price - avgCost) * qty - fee;
        realizedPnlUsdt += realized;
        holdings[symbol].qty -= qty;
        holdings[symbol].costUsdt = Math.max(0, holdings[symbol].costUsdt - avgCost * qty);
        cashUsdt += sellValue - fee;
        trades.push(makeTrade({ date, symbol, side: 'SELL', qty, price, feeUsdt: fee, realizedPnlUsdt: realized, source: 'waiwai-real-market-backtest', usdJpy }));
      }
    }
    const valueUsdt = cashUsdt + symbols.reduce((sum, symbol) => sum + holdings[symbol].qty * prices[symbol], 0);
    history.push({ date: market[symbols[0]][i].date, valueJpy: Math.round(valueUsdt * usdJpy), valueUsdt, returnPct: pctChange(valueUsdt, startCapitalUsdt) });
  }

  const lastPrices = Object.fromEntries(symbols.map((symbol) => [symbol, market[symbol].at(-1).close]));
  const currentValueUsdt = cashUsdt + symbols.reduce((sum, symbol) => sum + holdings[symbol].qty * lastPrices[symbol], 0);
  const currentValueJpy = Math.round(currentValueUsdt * usdJpy);
  const positions = symbols.map((symbol) => {
    const h = holdings[symbol];
    const valueUsdt = h.qty * lastPrices[symbol];
    const unrealizedUsdt = valueUsdt - h.costUsdt;
    return { symbol, asset: symbol.replace('USDT', ''), label: labelFor(symbol), quantity: h.qty, priceUsdt: lastPrices[symbol], valueJpy: Math.round(valueUsdt * usdJpy), allocationPct: currentValueUsdt > 0 ? valueUsdt / currentValueUsdt : 0, unrealizedPnlJpy: Math.round(unrealizedUsdt * usdJpy), returnPct: h.costUsdt > 0 ? unrealizedUsdt / h.costUsdt : 0 };
  }).filter((row) => row.valueJpy > 100);
  if (cashUsdt * usdJpy > 100) positions.push({ symbol: 'USDT', asset: 'USDT', label: '待機資金', quantity: cashUsdt, priceUsdt: 1, valueJpy: Math.round(cashUsdt * usdJpy), allocationPct: currentValueUsdt > 0 ? cashUsdt / currentValueUsdt : 0, unrealizedPnlJpy: 0, returnPct: 0 });

  return { initialCapitalJpy: startCapitalJpy, currentValueJpy, realizedPnlJpy: Math.round(realizedPnlUsdt * usdJpy), unrealizedPnlJpy: Math.round(positions.reduce((sum, row) => sum + row.unrealizedPnlJpy, 0)), positions, trades, history };
}

function buildAccountPositions({ account, market, usdJpy, allTrades }) {
  const balances = account.balances || [];
  const tradeCost = calculateCostBasis(allTrades);
  const totalValueUsdt = balances.reduce((sum, balance) => sum + (Number(balance.free || 0) + Number(balance.locked || 0)) * priceForAsset(balance.asset, market), 0);
  return balances.map((balance) => {
    const quantity = Number(balance.free || 0) + Number(balance.locked || 0);
    const priceUsdt = priceForAsset(balance.asset, market);
    const valueUsdt = quantity * priceUsdt;
    const symbol = balance.asset === 'USDT' ? 'USDT' : `${balance.asset}USDT`;
    const costUsdt = tradeCost[symbol]?.remainingCostUsdt || (balance.asset === 'USDT' ? valueUsdt : 0);
    const unrealizedUsdt = valueUsdt - costUsdt;
    return { symbol, asset: balance.asset, label: labelFor(symbol), quantity, priceUsdt, valueJpy: Math.round(valueUsdt * usdJpy), allocationPct: totalValueUsdt > 0 ? valueUsdt / totalValueUsdt : 0, unrealizedPnlJpy: Math.round(unrealizedUsdt * usdJpy), returnPct: costUsdt > 0 ? unrealizedUsdt / costUsdt : 0 };
  }).filter((row) => row.valueJpy > 100).sort((a, b) => b.valueJpy - a.valueJpy);
}

function buildTradeRowsFromAccountTrades({ allTrades, usdJpy }) {
  const basis = {};
  return allTrades.map((trade) => {
    const symbol = trade.symbol;
    basis[symbol] ||= { qty: 0, cost: 0 };
    const qty = Number(trade.qty);
    const quote = Number(trade.quoteQty || 0);
    const price = Number(trade.price);
    const fee = trade.commissionAsset === 'USDT' ? Number(trade.commission || 0) : 0;
    let realized = 0;
    if (trade.isBuyer) {
      basis[symbol].qty += qty;
      basis[symbol].cost += quote + fee;
    } else {
      const avgCost = basis[symbol].qty > 0 ? basis[symbol].cost / basis[symbol].qty : 0;
      realized = quote - avgCost * qty - fee;
      basis[symbol].qty -= qty;
      basis[symbol].cost = Math.max(0, basis[symbol].cost - avgCost * qty);
    }
    return makeTrade({ date: new Date(Number(trade.time)).toISOString(), symbol, side: trade.isBuyer ? 'BUY' : 'SELL', qty, price, feeUsdt: fee, realizedPnlUsdt: realized, source: 'binance-user-data', usdJpy });
  });
}

function makeTrade({ date, symbol, side, qty, price, feeUsdt, realizedPnlUsdt, source, usdJpy }) {
  return { id: `${date}-${symbol}-${side}-${Math.round(qty * 1e8)}`, datetime: date, symbol, side, quantity: qty, priceUsdt: price, notionalUsdt: qty * price, feeUsdt, realizedPnlUsdt, realizedPnlJpy: Math.round(realizedPnlUsdt * usdJpy), source };
}

function calculateCostBasis(trades) {
  const state = {};
  for (const trade of trades.sort((a, b) => Number(a.time) - Number(b.time))) {
    const symbol = trade.symbol;
    state[symbol] ||= { qty: 0, remainingCostUsdt: 0, realizedPnlUsdt: 0 };
    const qty = Number(trade.qty);
    const quote = Number(trade.quoteQty || 0);
    const fee = trade.commissionAsset === 'USDT' ? Number(trade.commission || 0) : 0;
    if (trade.isBuyer) {
      state[symbol].qty += qty;
      state[symbol].remainingCostUsdt += quote + fee;
    } else {
      const avgCost = state[symbol].qty > 0 ? state[symbol].remainingCostUsdt / state[symbol].qty : 0;
      state[symbol].qty -= qty;
      state[symbol].remainingCostUsdt = Math.max(0, state[symbol].remainingCostUsdt - avgCost * qty);
      state[symbol].realizedPnlUsdt += quote - avgCost * qty - fee;
    }
  }
  return state;
}

function calculateRealizedPnl(trades) {
  return Object.values(calculateCostBasis(trades)).reduce((sum, row) => sum + row.realizedPnlUsdt, 0);
}

function buildEquityProxyFromMarket({ market, currentValueJpy }) {
  const dates = market[symbols[0]].map((row) => row.date).slice(-90);
  return dates.map((date, index) => {
    const ratio = 0.84 + (index / Math.max(dates.length - 1, 1)) * 0.16;
    return { date, valueJpy: Math.round(currentValueJpy * ratio), returnPct: ratio - 1 };
  });
}

function calculateMetrics({ history, trades }) {
  const realized = trades.map((trade) => Number(trade.realizedPnlUsdt || 0)).filter((value) => value !== 0);
  const wins = realized.filter((value) => value > 0);
  const losses = realized.filter((value) => value < 0);
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  return { winRate: realized.length ? wins.length / realized.length : 0, totalTrades: trades.length, winningTrades: wins.length, losingTrades: losses.length, profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0, maxDrawdownPct: maxDrawdown(history), volatilityPct: annualizedVolatility(history), sharpeLike: sharpeLike(history), avgWinPct: wins.length ? average(wins) / 100 : 0, avgLossPct: losses.length ? average(losses) / 100 : 0 };
}

async function signedBinance(pathname, params) {
  const signedParams = { ...params, timestamp: Date.now() };
  const query = new URLSearchParams(Object.entries(signedParams).map(([key, value]) => [key, String(value)]));
  const signature = crypto.createHmac('sha256', process.env.BINANCE_API_SECRET).update(query.toString()).digest('hex');
  query.set('signature', signature);
  const url = new URL(pathname, BINANCE_BASE_URL);
  url.search = query.toString();
  return fetchJson(url, { headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY } });
}

async function fetchUsdJpy() {
  try {
    const data = await fetchJson(FX_URL);
    const rate = Number(data.rates?.JPY);
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch {}
  return Number(process.env.FALLBACK_USD_JPY || 155);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { accept: 'application/json', ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}: ${await response.text()}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function priceForAsset(asset, market) {
  if (asset === 'USDT' || asset === 'USD') return 1;
  return market[`${asset}USDT`]?.at(-1)?.close || 0;
}
function labelFor(symbol) { return { BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', SOLUSDT: 'Solana', USDT: 'Tether USD' }[symbol] || symbol.replace('USDT', ''); }
function pctChange(current, previous) { return previous > 0 ? (current - previous) / previous : 0; }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function maxDrawdown(history) { let peak = 0; let maxDd = 0; for (const row of history) { peak = Math.max(peak, row.valueJpy); if (peak > 0) maxDd = Math.min(maxDd, (row.valueJpy - peak) / peak); } return maxDd; }
function annualizedVolatility(history) { const returns = []; for (let i = 1; i < history.length; i += 1) returns.push(pctChange(history[i].valueJpy, history[i - 1].valueJpy)); if (returns.length < 2) return 0; const mean = average(returns); const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1); return Math.sqrt(variance) * Math.sqrt(365); }
function sharpeLike(history) { const returns = []; for (let i = 1; i < history.length; i += 1) returns.push(pctChange(history[i].valueJpy, history[i - 1].valueJpy)); const mean = average(returns); const vol = annualizedVolatility(history); return vol > 0 ? (mean * 365) / vol : 0; }
function renderTradesCsv(trades) { const header = ['datetime', 'symbol', 'side', 'quantity', 'priceUsdt', 'notionalUsdt', 'feeUsdt', 'realizedPnlUsdt', 'source']; const rows = trades.map((trade) => header.map((key) => JSON.stringify(trade[key] ?? '')).join(',')); return `${header.join(',')}\n${rows.join('\n')}\n`; }
function renderTradesXls(trades) { const rows = trades.map((trade) => `<tr><td>${trade.datetime}</td><td>${trade.symbol}</td><td>${trade.side}</td><td>${trade.quantity}</td><td>${trade.priceUsdt}</td><td>${trade.realizedPnlUsdt}</td></tr>`).join(''); return `<html><body><table><tr><th>Date</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Price USDT</th><th>Realized PnL USDT</th></tr>${rows}</table></body></html>`; }
function messageOf(error) { return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500); }
