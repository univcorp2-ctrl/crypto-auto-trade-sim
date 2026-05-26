import { mkdir, readFile, writeFile } from 'node:fs/promises';

const CONFIG_PATH = 'config/portfolio.json';
const PUBLIC_DATA_PATH = 'public/data/performance.json';
const REPORT_PATH = 'reports/latest-public-dashboard.md';
const PUBLIC_DASHBOARD_URL = process.env.PUBLIC_DASHBOARD_URL || 'https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/';
const TIME_ZONE = process.env.REPORT_TIME_ZONE || 'Asia/Tokyo';
const FALLBACK_PRICES = {
  BTCUSDT: 107500,
  ETHUSDT: 2910,
  SOLUSDT: 181
};

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const assets = normalizeAssets(config.assets);
  const exchangeRestBase = normalizeBaseUrl(process.env.EXCHANGE_REST_BASE || config.exchange?.restBaseUrl || 'https://api.binance.com');
  const initialInvestmentJpy = Number(process.env.INITIAL_INVESTMENT_JPY || config.initialInvestmentJpy || 1_000_000);

  let mode = 'live-public-data';
  let prices;
  let dailyKlines;
  let usdJpy;

  try {
    [prices, dailyKlines, usdJpy] = await Promise.all([
      fetchCurrentPrices(assets.map((asset) => asset.symbol), exchangeRestBase),
      fetchDailyKlines(assets.map((asset) => asset.symbol), exchangeRestBase, 45),
      fetchUsdJpy(config.fx?.fallbackUsdJpy || 155)
    ]);
  } catch (error) {
    mode = 'fallback-sample-data';
    console.warn(`Public market data fetch failed; using fallback sample data. ${error instanceof Error ? error.message : String(error)}`);
    usdJpy = Number(config.fx?.fallbackUsdJpy || 155);
    prices = Object.fromEntries(assets.map((asset) => [asset.symbol, FALLBACK_PRICES[asset.symbol] || 100]));
    dailyKlines = Object.fromEntries(assets.map((asset, index) => [asset.symbol, createFallbackKlines(prices[asset.symbol], index)]));
  }

  const data = buildDashboardData({ config, assets, prices, dailyKlines, usdJpy, exchangeRestBase, initialInvestmentJpy, mode });
  const report = renderMarkdownReport(data);

  await mkdir('public/data', { recursive: true });
  await mkdir('reports', { recursive: true });
  await writeFile(PUBLIC_DATA_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await writeFile(REPORT_PATH, report, 'utf8');

  await publishWebhook(data, report);
  console.log(`Generated ${PUBLIC_DATA_PATH}`);
  console.log(`Dashboard URL: ${PUBLIC_DASHBOARD_URL}`);
}

function normalizeAssets(assets) {
  if (!Array.isArray(assets) || assets.length === 0) throw new Error('config.assets is required');
  const total = assets.reduce((sum, asset) => sum + Number(asset.allocationPct || 0), 0);
  if (total <= 0) throw new Error('asset allocation total must be positive');
  return assets.map((asset) => ({
    symbol: String(asset.symbol).toUpperCase(),
    label: asset.label || String(asset.symbol).replace('USDT', ''),
    allocationPct: Number(asset.allocationPct) / total
  }));
}

async function fetchCurrentPrices(symbols, baseUrl) {
  const entries = await Promise.all(symbols.map(async (symbol) => {
    const url = new URL('/api/v3/ticker/price', baseUrl);
    url.searchParams.set('symbol', symbol);
    const payload = await fetchJson(url);
    const price = Number(payload.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`invalid price for ${symbol}`);
    return [symbol, price];
  }));
  return Object.fromEntries(entries);
}

async function fetchDailyKlines(symbols, baseUrl, limit) {
  const entries = await Promise.all(symbols.map(async (symbol) => {
    const url = new URL('/api/v3/klines', baseUrl);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '1d');
    url.searchParams.set('limit', String(limit));
    const payload = await fetchJson(url);
    if (!Array.isArray(payload)) throw new Error(`invalid kline response for ${symbol}`);
    const rows = payload
      .map((row) => ({
        openTime: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        closeTime: Number(row[6])
      }))
      .filter((row) => row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0 && row.high >= row.low)
      .sort((a, b) => a.openTime - b.openTime);
    if (rows.length < 2) throw new Error(`not enough kline rows for ${symbol}`);
    return [symbol, rows];
  }));
  return Object.fromEntries(entries);
}

async function fetchUsdJpy(fallback) {
  try {
    const url = new URL('https://api.frankfurter.dev/v2/rates');
    url.searchParams.set('base', 'USD');
    url.searchParams.set('symbols', 'JPY');
    const payload = await fetchJson(url);
    const rate = Number(payload.rates?.JPY);
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch (error) {
    console.warn(`USD/JPY fetch failed; using fallback. ${error instanceof Error ? error.message : String(error)}`);
  }
  return Number(fallback || 155);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'crypto-auto-trade-sim/1.0' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${url.hostname} returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildDashboardData({ config, assets, prices, dailyKlines, usdJpy, exchangeRestBase, initialInvestmentJpy, mode }) {
  const entryUsdJpy = Number(config.entryUsdJpy || usdJpy);
  const entryFeeBps = Number(config.costs?.entryFeeBps ?? 10);
  const entrySlippageBps = Number(config.costs?.entrySlippageBps ?? 8);
  const costMultiplier = 1 + (entryFeeBps + entrySlippageBps) / 10_000;

  const positions = assets.map((asset) => {
    const klines = dailyKlines[asset.symbol] || [];
    const firstClose = klines[0]?.close || prices[asset.symbol];
    const currentPriceUsdt = prices[asset.symbol];
    const allocationJpy = Math.round(initialInvestmentJpy * asset.allocationPct);
    const entryPriceUsdt = firstClose * costMultiplier;
    const quantity = allocationJpy / entryUsdJpy / entryPriceUsdt;
    const valueJpy = quantity * currentPriceUsdt * usdJpy;
    const pnlJpy = valueJpy - allocationJpy;
    const sevenDayReturnPct = returnSince(klines, currentPriceUsdt, 7);
    const thirtyDayReturnPct = returnSince(klines, currentPriceUsdt, 30);
    const returnPct = pnlJpy / allocationJpy;
    const { signal, reason } = getTradeSignal({ sevenDayReturnPct, thirtyDayReturnPct, returnPct });

    return {
      symbol: asset.symbol,
      label: asset.label,
      allocationPct: asset.allocationPct,
      quantity,
      allocationJpy,
      entryPriceUsdt,
      currentPriceUsdt,
      valueJpy: Math.round(valueJpy),
      pnlJpy: Math.round(pnlJpy),
      returnPct,
      sevenDayReturnPct,
      thirtyDayReturnPct,
      signal,
      signalReason: reason
    };
  });

  const history = buildPortfolioHistory({ assets, dailyKlines, positions, usdJpy, initialInvestmentJpy });
  const currentValueJpy = Math.round(positions.reduce((sum, position) => sum + position.valueJpy, 0));
  const pnlJpy = currentValueJpy - initialInvestmentJpy;
  const totalReturnPct = pnlJpy / initialInvestmentJpy;
  const todayReturnPct = history.length >= 2 ? (history.at(-1).valueJpy - history.at(-2).valueJpy) / history.at(-2).valueJpy : null;
  const previousCloseReturnPct = todayReturnPct;
  const sevenDayReturnPct = history.length >= 8 ? (history.at(-1).valueJpy - history.at(-8).valueJpy) / history.at(-8).valueJpy : null;
  const thirtyDayReturnPct = history.length >= 31 ? (history.at(-1).valueJpy - history.at(-31).valueJpy) / history.at(-31).valueJpy : null;
  const maxDrawdownPct = calculateMaxDrawdown(history);
  const volatilityPct = calculateAnnualizedVolatility(history);
  const riskScore = calculateRiskScore(maxDrawdownPct, volatilityPct);

  return {
    generatedAt: new Date().toISOString(),
    timeZone: TIME_ZONE,
    publicDashboardUrl: PUBLIC_DASHBOARD_URL,
    source: {
      exchange: mode === 'live-public-data' ? config.exchange?.name || 'Binance Spot public market data' : 'Fallback sample data',
      restBaseUrl: exchangeRestBase,
      fxProvider: mode === 'live-public-data' ? config.fx?.provider || 'Frankfurter public FX rates' : 'Fallback USD/JPY',
      quoteCurrency: 'USDT',
      baseCurrency: 'JPY',
      mode
    },
    automation: {
      dryRun: config.automation?.dryRun !== false,
      liveTradingEnabled: config.automation?.liveTradingEnabled === true && process.env.ENABLE_LIVE_TRADING === 'true',
      scheduleLabel: config.automation?.scheduleLabel || 'Every day 09:30 JST',
      cronUtc: config.automation?.cronUtc || '30 0 * * *',
      githubActionsWorkflow: 'Deploy Web App to GitHub Pages'
    },
    portfolio: {
      name: config.name || 'Crypto Dry-run Portfolio',
      startedAt: config.startedAt || new Date().toISOString(),
      initialInvestmentJpy,
      entryUsdJpy,
      currentUsdJpy: usdJpy,
      entryFeeBps,
      entrySlippageBps,
      currentValueJpy,
      pnlJpy,
      totalReturnPct,
      todayReturnPct,
      previousCloseReturnPct,
      sevenDayReturnPct,
      thirtyDayReturnPct,
      maxDrawdownPct,
      volatilityPct,
      riskScore,
      positions,
      history
    }
  };
}

function returnSince(klines, currentPrice, days) {
  if (!Array.isArray(klines) || klines.length < days + 1) return null;
  const base = klines.at(-(days + 1))?.close;
  return base > 0 ? (currentPrice - base) / base : null;
}

function buildPortfolioHistory({ assets, dailyKlines, positions, usdJpy, initialInvestmentJpy }) {
  const minLength = Math.min(...assets.map((asset) => dailyKlines[asset.symbol]?.length || 0));
  if (!Number.isFinite(minLength) || minLength <= 1) return [];
  const startIndex = Math.max(0, minLength - 45);
  const rows = [];

  for (let offset = startIndex; offset < minLength; offset += 1) {
    const valueJpy = assets.reduce((sum, asset) => {
      const position = positions.find((item) => item.symbol === asset.symbol);
      const close = dailyKlines[asset.symbol][offset]?.close || 0;
      return sum + (position?.quantity || 0) * close * usdJpy;
    }, 0);
    const dateMs = dailyKlines[assets[0].symbol][offset]?.openTime || Date.now();
    rows.push({
      date: new Date(dateMs).toISOString().slice(0, 10),
      valueJpy: Math.round(valueJpy),
      returnPct: (valueJpy - initialInvestmentJpy) / initialInvestmentJpy
    });
  }

  const latest = rows.at(-1);
  if (latest) {
    latest.valueJpy = Math.round(positions.reduce((sum, position) => sum + position.valueJpy, 0));
    latest.returnPct = (latest.valueJpy - initialInvestmentJpy) / initialInvestmentJpy;
  }

  return rows;
}

function calculateMaxDrawdown(points) {
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of points) {
    peak = Math.max(peak, point.valueJpy);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, (point.valueJpy - peak) / peak);
  }
  return maxDrawdown;
}

function calculateAnnualizedVolatility(points) {
  if (points.length < 3) return 0;
  const returns = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].valueJpy;
    const current = points[index].valueJpy;
    if (previous > 0 && current > 0) returns.push((current - previous) / previous);
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365);
}

function calculateRiskScore(maxDrawdownPct, volatilityPct) {
  const drawdownPenalty = Math.min(Math.abs(maxDrawdownPct) * 260, 65);
  const volatilityPenalty = Math.min(Math.abs(volatilityPct) * 80, 35);
  return Math.round(Math.max(0, Math.min(100, 100 - drawdownPenalty - volatilityPenalty)));
}

function getTradeSignal({ sevenDayReturnPct, thirtyDayReturnPct, returnPct }) {
  const sevenDay = sevenDayReturnPct ?? 0;
  const thirtyDay = thirtyDayReturnPct ?? 0;
  if (sevenDay > 0.045 && thirtyDay > 0.02) {
    return { signal: 'BUY', reason: '7日・30日モメンタムが両方プラス。小さく追加検討。' };
  }
  if (sevenDay < -0.06 || thirtyDay < -0.12 || returnPct < -0.2) {
    return { signal: 'REDUCE', reason: '下落率がリスク閾値を超過。縮小または様子見。' };
  }
  return { signal: 'HOLD', reason: '優位性が中立。現ポジション維持。' };
}

function createFallbackKlines(currentPrice, indexSeed) {
  const now = Date.now();
  return Array.from({ length: 45 }, (_, index) => {
    const drift = 1 + (index - 44) * 0.0028;
    const wave = 1 + Math.sin(index / 4 + indexSeed) * 0.035;
    const close = currentPrice * drift * wave;
    const openTime = now - (44 - index) * 86_400_000;
    return {
      openTime,
      open: close * 0.99,
      high: close * 1.025,
      low: close * 0.975,
      close,
      volume: 0,
      closeTime: openTime + 86_399_000
    };
  });
}

function renderMarkdownReport(data) {
  const lines = [
    `# ${data.portfolio.name}`,
    '',
    `- Generated: ${data.generatedAt}`,
    `- Dashboard: ${data.publicDashboardUrl}`,
    `- Current value: ${data.portfolio.currentValueJpy.toLocaleString('ja-JP')} JPY`,
    `- P/L: ${data.portfolio.pnlJpy.toLocaleString('ja-JP')} JPY`,
    `- Return: ${(data.portfolio.totalReturnPct * 100).toFixed(2)}%`,
    `- Risk score: ${data.portfolio.riskScore}/100`,
    `- Data mode: ${data.source.mode}`,
    '',
    '## Positions',
    '',
    '| Asset | Value JPY | P/L JPY | Return | Signal |',
    '|---|---:|---:|---:|---|',
    ...data.portfolio.positions.map((position) =>
      `| ${position.label} (${position.symbol}) | ${position.valueJpy.toLocaleString('ja-JP')} | ${position.pnlJpy.toLocaleString('ja-JP')} | ${(position.returnPct * 100).toFixed(2)}% | ${position.signal} |`
    ),
    ''
  ];
  return `${lines.join('\n')}\n`;
}

async function publishWebhook(data, markdown) {
  const webhookUrl = process.env.PERFORMANCE_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `${data.portfolio.name}: ${data.portfolio.currentValueJpy.toLocaleString('ja-JP')} JPY (${(data.portfolio.totalReturnPct * 100).toFixed(2)}%)`,
        markdown
      })
    });
  } catch (error) {
    console.warn(`Webhook notification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
