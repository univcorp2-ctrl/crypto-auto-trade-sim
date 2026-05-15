import { mkdir, readFile, writeFile } from 'node:fs/promises';

const CONFIG_PATH = 'config/portfolio.json';
const PUBLIC_DATA_PATH = 'public/data/performance.json';
const REPORT_PATH = 'reports/latest-public-dashboard.md';
const ISSUE_TITLE = 'Portfolio Performance Tracker';
const TIME_ZONE = process.env.REPORT_TIME_ZONE || 'Asia/Tokyo';
const PUBLIC_DASHBOARD_URL = process.env.PUBLIC_DASHBOARD_URL || 'https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/';

async function main() {
  const config = await loadConfig();
  const assets = normalizeAssets(config.assets);
  const initialInvestmentJpy = Number(process.env.INITIAL_INVESTMENT_JPY || config.initialInvestmentJpy || 1_000_000);
  const exchangeRestBase = normalizeBaseUrl(process.env.EXCHANGE_REST_BASE || config.exchange?.restBaseUrl || 'https://api.binance.com');
  const resetState = String(process.env.PORTFOLIO_RESET_STATE || 'false').toLowerCase() === 'true';

  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const existingIssue = token && repository ? await findTrackerIssue(token, repository).catch(() => null) : null;

  const symbols = assets.map((asset) => asset.symbol);
  const [prices, dailyKlines, usdJpy] = await Promise.all([
    fetchCurrentPrices(symbols, exchangeRestBase),
    fetchDailyKlines(symbols, exchangeRestBase, 40),
    fetchUsdJpy(config.fx?.fallbackUsdJpy)
  ]);

  let state = !resetState && existingIssue?.body ? readEmbeddedState(existingIssue.body) : null;
  if (!state || !isStateCompatible(state, assets)) {
    state = createInitialState({ config, assets, prices, usdJpy, initialInvestmentJpy });
  }

  const snapshot = calculateSnapshot({ state, assets, prices, dailyKlines, usdJpy });
  const dashboardData = renderDashboardData({ config, state, snapshot, dailyKlines, exchangeRestBase, usdJpy });
  const markdown = renderMarkdownReport({ state, snapshot, dashboardData, exchangeRestBase, usdJpy });

  await mkdir('public/data', { recursive: true });
  await mkdir('reports', { recursive: true });
  await writeFile(PUBLIC_DATA_PATH, JSON.stringify(dashboardData, null, 2), 'utf8');
  await writeFile(REPORT_PATH, markdown, 'utf8');

  if (token && repository) {
    await publishIssue({ token, repository, markdown, state, existingIssue });
  } else {
    console.log('GITHUB_TOKEN or GITHUB_REPOSITORY is not set; skipping Issue publication.');
  }

  await publishWebhook({ dashboardData, markdown });
  console.log(`Generated ${PUBLIC_DATA_PATH}`);
  console.log(`Dashboard URL: ${PUBLIC_DASHBOARD_URL}`);
}

async function loadConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
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
    return [symbol, rows];
  }));
  return Object.fromEntries(entries);
}

async function fetchUsdJpy(fallback) {
  const url = new URL('https://api.frankfurter.dev/v2/rates');
  url.searchParams.set('base', 'USD');
  url.searchParams.set('quotes', 'JPY');

  try {
    const payload = await fetchJson(url);
    const rate = Number(payload.rates?.JPY);
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch (error) {
    console.warn(`USD/JPY fetch failed; using fallback. ${error instanceof Error ? error.message : String(error)}`);
  }

  const fallbackRate = Number(process.env.USD_JPY_FALLBACK || fallback || 157.8);
  if (!Number.isFinite(fallbackRate) || fallbackRate <= 0) throw new Error('USD/JPY fallback is invalid');
  return fallbackRate;
}

async function fetchJson(url, attempt = 1) {
  const maxAttempts = 3;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000)
  }).catch((error) => {
    if (attempt < maxAttempts) return null;
    throw error;
  });

  if (!response) {
    await sleep(500 * attempt);
    return fetchJson(url, attempt + 1);
  }

  if (!response.ok) {
    if (attempt < maxAttempts && [408, 418, 429, 500, 502, 503, 504].includes(response.status)) {
      await sleep(800 * attempt);
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`HTTP ${response.status} from ${url.href}`);
  }

  return response.json();
}

function createInitialState({ config, assets, prices, usdJpy, initialInvestmentJpy }) {
  const entryFeeBps = Number(config.costs?.entryFeeBps || 0);
  const entrySlippageBps = Number(config.costs?.entrySlippageBps || 0);
  const costMultiplier = 1 + (entryFeeBps + entrySlippageBps) / 10_000;

  return {
    version: 1,
    portfolioName: config.portfolioName || 'Hypothetical Crypto Portfolio',
    startedAt: new Date().toISOString(),
    initialInvestmentJpy,
    entryUsdJpy: usdJpy,
    entryFeeBps,
    entrySlippageBps,
    positions: assets.map((asset) => {
      const allocationJpy = initialInvestmentJpy * asset.allocationPct;
      const allocationUsdt = allocationJpy / usdJpy;
      const entryPriceUsdt = prices[asset.symbol];
      const effectiveEntryPriceUsdt = entryPriceUsdt * costMultiplier;
      return {
        symbol: asset.symbol,
        label: asset.label,
        allocationPct: asset.allocationPct,
        allocationJpy,
        allocationUsdt,
        entryPriceUsdt,
        effectiveEntryPriceUsdt,
        quantity: allocationUsdt / effectiveEntryPriceUsdt
      };
    })
  };
}

function isStateCompatible(state, assets) {
  if (!state || !Array.isArray(state.positions)) return false;
  const configured = new Set(assets.map((asset) => asset.symbol));
  const stored = new Set(state.positions.map((position) => position.symbol));
  return configured.size === stored.size && [...configured].every((symbol) => stored.has(symbol));
}

function calculateSnapshot({ state, prices, dailyKlines, usdJpy }) {
  const rows = state.positions.map((position) => {
    const currentPriceUsdt = prices[position.symbol];
    const valueJpy = position.quantity * currentPriceUsdt * usdJpy;
    const pnlJpy = valueJpy - position.allocationJpy;
    const klines = dailyKlines[position.symbol] || [];
    const latest = klines.at(-1);

    const valueAtPrice = (price) => price && price > 0 ? position.quantity * price * usdJpy : null;
    const closeDaysAgo = (daysAgo) => {
      const index = klines.length - 1 - daysAgo;
      return index >= 0 ? klines[index].close : null;
    };

    return {
      symbol: position.symbol,
      label: position.label,
      allocationPct: position.allocationPct,
      quantity: position.quantity,
      allocationJpy: position.allocationJpy,
      entryPriceUsdt: position.entryPriceUsdt,
      effectiveEntryPriceUsdt: position.effectiveEntryPriceUsdt,
      currentPriceUsdt,
      valueJpy,
      pnlJpy,
      returnPct: pnlJpy / position.allocationJpy,
      todayOpenValueJpy: valueAtPrice(latest?.open),
      previousCloseValueJpy: valueAtPrice(closeDaysAgo(1)),
      sevenDayValueJpy: valueAtPrice(closeDaysAgo(7)),
      thirtyDayValueJpy: valueAtPrice(closeDaysAgo(30))
    };
  });

  const totalValueJpy = sum(rows.map((row) => row.valueJpy));
  const totalPnlJpy = totalValueJpy - state.initialInvestmentJpy;
  const fromReference = (values) => {
    if (values.some((value) => value === null || value === undefined || !Number.isFinite(value))) return null;
    const reference = sum(values);
    return reference > 0 ? totalValueJpy / reference - 1 : null;
  };

  return {
    generatedAt: new Date().toISOString(),
    totalValueJpy,
    totalPnlJpy,
    totalReturnPct: totalPnlJpy / state.initialInvestmentJpy,
    todayReturnPct: fromReference(rows.map((row) => row.todayOpenValueJpy)),
    previousCloseReturnPct: fromReference(rows.map((row) => row.previousCloseValueJpy)),
    sevenDayReturnPct: fromReference(rows.map((row) => row.sevenDayValueJpy)),
    thirtyDayReturnPct: fromReference(rows.map((row) => row.thirtyDayValueJpy)),
    rows
  };
}

function renderDashboardData({ config, state, snapshot, dailyKlines, exchangeRestBase, usdJpy }) {
  return {
    schemaVersion: 1,
    publicDashboardUrl: PUBLIC_DASHBOARD_URL,
    generatedAt: snapshot.generatedAt,
    timeZone: TIME_ZONE,
    schedule: {
      label: '毎日 09:30 JST',
      cronUtc: '30 0 * * *'
    },
    source: {
      exchange: 'Binance Spot public market data',
      restBaseUrl: exchangeRestBase.origin,
      fxProvider: 'Frankfurter USD/JPY',
      quoteCurrency: 'USDT',
      baseCurrency: 'JPY'
    },
    portfolio: {
      name: state.portfolioName || config.portfolioName,
      startedAt: state.startedAt,
      initialInvestmentJpy: state.initialInvestmentJpy,
      entryUsdJpy: state.entryUsdJpy,
      currentUsdJpy: usdJpy,
      entryFeeBps: state.entryFeeBps,
      entrySlippageBps: state.entrySlippageBps,
      currentValueJpy: snapshot.totalValueJpy,
      pnlJpy: snapshot.totalPnlJpy,
      totalReturnPct: snapshot.totalReturnPct,
      todayReturnPct: snapshot.todayReturnPct,
      previousCloseReturnPct: snapshot.previousCloseReturnPct,
      sevenDayReturnPct: snapshot.sevenDayReturnPct,
      thirtyDayReturnPct: snapshot.thirtyDayReturnPct,
      positions: snapshot.rows.map((row) => ({
        symbol: row.symbol,
        label: row.label,
        allocationPct: row.allocationPct,
        quantity: row.quantity,
        allocationJpy: row.allocationJpy,
        entryPriceUsdt: row.entryPriceUsdt,
        effectiveEntryPriceUsdt: row.effectiveEntryPriceUsdt,
        currentPriceUsdt: row.currentPriceUsdt,
        valueJpy: row.valueJpy,
        pnlJpy: row.pnlJpy,
        returnPct: row.returnPct
      })),
      history: buildHistory(state, dailyKlines, usdJpy, snapshot)
    }
  };
}

function buildHistory(state, dailyKlines, usdJpy, snapshot) {
  const firstSymbol = state.positions[0]?.symbol;
  const baseRows = (dailyKlines[firstSymbol] || []).slice(-30);
  const history = baseRows.map((baseRow) => {
    const date = toIsoDate(baseRow.openTime);
    const valueJpy = state.positions.reduce((total, position) => {
      const row = (dailyKlines[position.symbol] || []).find((item) => toIsoDate(item.openTime) === date);
      const price = row?.close || snapshot.rows.find((item) => item.symbol === position.symbol)?.currentPriceUsdt || position.entryPriceUsdt;
      return total + position.quantity * price * usdJpy;
    }, 0);
    return {
      date,
      valueJpy,
      returnPct: valueJpy / state.initialInvestmentJpy - 1
    };
  });

  const today = toIsoDate(Date.now());
  const last = history.at(-1);
  if (!last || last.date !== today) {
    history.push({ date: today, valueJpy: snapshot.totalValueJpy, returnPct: snapshot.totalReturnPct });
  } else {
    last.valueJpy = snapshot.totalValueJpy;
    last.returnPct = snapshot.totalReturnPct;
  }

  return history;
}

function renderMarkdownReport({ state, snapshot, dashboardData, exchangeRestBase, usdJpy }) {
  const status = snapshot.totalPnlJpy >= 0 ? '🟢' : '🔴';
  const lines = [
    '# Portfolio Performance Tracker',
    '',
    `${status} **${formatJpy(snapshot.totalValueJpy)}** (${formatSignedJpy(snapshot.totalPnlJpy)}, ${formatPct(snapshot.totalReturnPct)})`,
    '',
    `Dashboard: ${PUBLIC_DASHBOARD_URL}`,
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Initial investment | ${formatJpy(state.initialInvestmentJpy)} |`,
    `| Current value | ${formatJpy(snapshot.totalValueJpy)} |`,
    `| Total P/L | ${formatSignedJpy(snapshot.totalPnlJpy)} |`,
    `| Total return | ${formatPct(snapshot.totalReturnPct)} |`,
    `| Today return | ${formatPct(snapshot.todayReturnPct)} |`,
    `| vs previous close | ${formatPct(snapshot.previousCloseReturnPct)} |`,
    `| 7D return | ${formatPct(snapshot.sevenDayReturnPct)} |`,
    `| 30D return | ${formatPct(snapshot.thirtyDayReturnPct)} |`,
    `| USD/JPY used | ${usdJpy.toFixed(4)} |`,
    '',
    '## Positions',
    '',
    '| Asset | Quantity | Entry USDT | Current USDT | Value JPY | P/L JPY | Return |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...dashboardData.portfolio.positions.map((row) => [
      `| ${row.label} (${row.symbol})`,
      formatQuantity(row.quantity),
      formatUsd(row.entryPriceUsdt),
      formatUsd(row.currentPriceUsdt),
      formatJpy(row.valueJpy),
      formatSignedJpy(row.pnlJpy),
      formatPct(row.returnPct),
      '|'
    ].join(' | ')),
    '',
    '## Update policy',
    '',
    '- Public dashboard is rebuilt every day at 09:30 JST.',
    '- This tracker is hypothetical and does not place orders.',
    `- Market data source: ${exchangeRestBase.origin}`,
    '- The latest Issue body is updated, and daily comments preserve history.',
    '',
    `<!-- portfolio-report:${formatDate(new Date(snapshot.generatedAt))} -->`,
    embedState(state)
  ];
  return lines.join('\n');
}

async function publishIssue({ token, repository, markdown, state, existingIssue }) {
  const headers = githubHeaders(token);
  let issue = existingIssue || await findTrackerIssue(token, repository);

  if (!issue) {
    issue = await githubJson(`https://api.github.com/repos/${repository}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: ISSUE_TITLE, body: markdown })
    });
  } else {
    issue = await githubJson(`https://api.github.com/repos/${repository}/issues/${issue.number}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ body: markdown })
    });
  }

  const marker = `portfolio-report:${formatDate(new Date())}`;
  const comments = await githubJson(`https://api.github.com/repos/${repository}/issues/${issue.number}/comments?per_page=100`, { headers });
  const alreadyCommented = comments.some((comment) => typeof comment.body === 'string' && comment.body.includes(marker));
  if (!alreadyCommented) {
    await githubJson(`https://api.github.com/repos/${repository}/issues/${issue.number}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: markdown.replace(embedState(state), '') })
    });
  }

  console.log(`Published dashboard snapshot to issue #${issue.number}.`);
}

async function findTrackerIssue(token, repository) {
  const headers = githubHeaders(token);
  const issues = await githubJson(`https://api.github.com/repos/${repository}/issues?state=open&per_page=100`, { headers });
  return issues.find((issue) => issue.title === ISSUE_TITLE && !issue.pull_request) || null;
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

async function githubJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function publishWebhook({ dashboardData, markdown }) {
  const webhookUrl = process.env.PERFORMANCE_WEBHOOK_URL;
  if (!webhookUrl) return;

  const p = dashboardData.portfolio;
  const summary = [
    `Portfolio Performance Dashboard`,
    `URL: ${PUBLIC_DASHBOARD_URL}`,
    `Current: ${formatJpy(p.currentValueJpy)} (${formatSignedJpy(p.pnlJpy)}, ${formatPct(p.totalReturnPct)})`,
    `Today: ${formatPct(p.todayReturnPct)} | 7D: ${formatPct(p.sevenDayReturnPct)} | 30D: ${formatPct(p.thirtyDayReturnPct)}`
  ].join('\n');

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: summary, content: summary, markdown })
  });

  if (!response.ok) throw new Error(`webhook publish failed: ${response.status}`);
}

function embedState(state) {
  return `<!-- portfolio-state:${Buffer.from(JSON.stringify(state), 'utf8').toString('base64')} -->`;
}

function readEmbeddedState(body) {
  const match = body.match(/<!-- portfolio-state:([A-Za-z0-9+/=]+) -->/);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  return new URL(url.origin);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function toIsoDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function formatJpy(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
}

function formatSignedJpy(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : '-'}${formatJpy(Math.abs(value))}`;
}

function formatUsd(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value >= 100 ? 2 : 6 }).format(value);
}

function formatPct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

function formatQuantity(value) {
  if (!Number.isFinite(value)) return '—';
  return value >= 1 ? value.toFixed(6) : value.toFixed(8);
}

function formatDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
