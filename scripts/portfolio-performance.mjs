import { mkdir, readFile, writeFile } from 'node:fs/promises';

const REPORT_ISSUE_TITLE = 'Portfolio Performance Tracker';
const REPORT_PATH = 'reports/latest-portfolio-performance.md';
const TIME_ZONE = process.env.REPORT_TIME_ZONE || 'Asia/Tokyo';
const DEFAULT_CONFIG_PATH = 'config/portfolio.json';

async function main() {
  const config = await loadConfig();
  const assets = normalizeAssets(config);
  const initialInvestmentJpy = Number(process.env.INITIAL_INVESTMENT_JPY || config.initialInvestmentJpy || 1_000_000);
  const exchangeRestBase = normalizeBaseUrl(process.env.EXCHANGE_REST_BASE || config.exchange?.restBaseUrl || 'https://api.binance.com');

  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const existingIssue = token && repository ? await findTrackerIssue(token, repository).catch(() => null) : null;
  const resetState = String(process.env.PORTFOLIO_RESET_STATE || 'false').toLowerCase() === 'true';
  const currentPrices = await fetchCurrentPrices(assets.map((asset) => asset.symbol), exchangeRestBase);
  const dailyKlines = await fetchDailyKlines(assets.map((asset) => asset.symbol), exchangeRestBase, 35);
  const usdJpy = await fetchUsdJpy(config.fx?.fallbackUsdJpy);

  let state = !resetState && existingIssue?.body ? readEmbeddedState(existingIssue.body) : null;
  if (!state) {
    state = createInitialState({
      config,
      assets,
      prices: currentPrices,
      usdJpy,
      initialInvestmentJpy
    });
  }

  const snapshot = calculateSnapshot({
    state,
    assets,
    prices: currentPrices,
    dailyKlines,
    usdJpy
  });

  const markdown = renderReport({ config, state, snapshot, exchangeRestBase, usdJpy });
  await mkdir('reports', { recursive: true });
  await writeFile(REPORT_PATH, markdown, 'utf8');

  if (token && repository) {
    await publishTrackerIssue({ token, repository, markdown, state, existingIssue });
  } else {
    console.log('GITHUB_TOKEN or GITHUB_REPOSITORY is not set; skipping GitHub Issue publication.');
  }

  await publishWebhook({ markdown, snapshot });
  console.log(markdown);
}

async function loadConfig() {
  try {
    return JSON.parse(await readFile(DEFAULT_CONFIG_PATH, 'utf8'));
  } catch {
    return {
      portfolioName: 'Hypothetical 1,000,000 JPY Crypto Portfolio',
      initialInvestmentJpy: 1_000_000,
      exchange: { restBaseUrl: 'https://api.binance.com' },
      fx: { fallbackUsdJpy: 157.8 },
      costs: { entryFeeBps: 10, entrySlippageBps: 5 },
      assets: [
        { symbol: 'BTCUSDT', label: 'Bitcoin', allocationPct: 0.34 },
        { symbol: 'ETHUSDT', label: 'Ethereum', allocationPct: 0.33 },
        { symbol: 'SOLUSDT', label: 'Solana', allocationPct: 0.33 }
      ]
    };
  }
}

function normalizeAssets(config) {
  const envSymbols = (process.env.PORTFOLIO_SYMBOLS || '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  if (envSymbols.length > 0) {
    const allocation = 1 / envSymbols.length;
    return envSymbols.map((symbol) => ({ symbol, label: symbol.replace('USDT', ''), allocationPct: allocation }));
  }

  const assets = Array.isArray(config.assets) ? config.assets : [];
  const total = assets.reduce((sum, asset) => sum + Number(asset.allocationPct || 0), 0);
  if (assets.length === 0 || total <= 0) throw new Error('portfolio assets are not configured');

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
    const rows = payload
      .map((row) => ({
        openTime: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
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
    console.warn(`FX fetch failed, using fallback: ${error instanceof Error ? error.message : String(error)}`);
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
    quoteCurrency: 'USDT',
    entryFeeBps,
    entrySlippageBps,
    positions: assets.map((asset) => {
      const allocationJpy = initialInvestmentJpy * asset.allocationPct;
      const allocationUsdt = allocationJpy / usdJpy;
      const entryPrice = prices[asset.symbol];
      const effectiveEntryPrice = entryPrice * costMultiplier;
      return {
        symbol: asset.symbol,
        label: asset.label,
        allocationPct: asset.allocationPct,
        allocationJpy,
        allocationUsdt,
        entryPriceUsdt: entryPrice,
        effectiveEntryPriceUsdt: effectiveEntryPrice,
        quantity: allocationUsdt / effectiveEntryPrice
      };
    })
  };
}

function calculateSnapshot({ state, assets, prices, dailyKlines, usdJpy }) {
  const rows = state.positions.map((position) => {
    const currentPrice = prices[position.symbol];
    const valueUsdt = position.quantity * currentPrice;
    const valueJpy = valueUsdt * usdJpy;
    const pnlJpy = valueJpy - position.allocationJpy;
    const returnPct = pnlJpy / position.allocationJpy;
    const klines = dailyKlines[position.symbol] || [];
    const latest = klines.at(-1);
    const refClose = (daysAgo) => {
      const index = klines.length - 1 - daysAgo;
      return index >= 0 ? klines[index].close : null;
    };
    const valueAtPrice = (price) => (price && price > 0 ? position.quantity * price * usdJpy : null);

    return {
      symbol: position.symbol,
      label: position.label || assets.find((asset) => asset.symbol === position.symbol)?.label || position.symbol,
      allocationPct: position.allocationPct,
      quantity: position.quantity,
      entryPriceUsdt: position.entryPriceUsdt,
      currentPriceUsdt: currentPrice,
      valueJpy,
      pnlJpy,
      returnPct,
      todayOpenValueJpy: valueAtPrice(latest?.open),
      previousCloseValueJpy: valueAtPrice(refClose(1)),
      sevenDayValueJpy: valueAtPrice(refClose(7)),
      thirtyDayValueJpy: valueAtPrice(refClose(30))
    };
  });

  const totalValueJpy = sum(rows.map((row) => row.valueJpy));
  const totalPnlJpy = totalValueJpy - state.initialInvestmentJpy;
  const totalReturnPct = totalPnlJpy / state.initialInvestmentJpy;

  const returnFromValue = (referenceValue) => {
    if (!referenceValue || referenceValue <= 0) return null;
    return totalValueJpy / referenceValue - 1;
  };

  return {
    generatedAt: new Date().toISOString(),
    usdJpy,
    totalValueJpy,
    totalPnlJpy,
    totalReturnPct,
    todayReturnPct: returnFromValue(sumNullable(rows.map((row) => row.todayOpenValueJpy))),
    previousCloseReturnPct: returnFromValue(sumNullable(rows.map((row) => row.previousCloseValueJpy))),
    sevenDayReturnPct: returnFromValue(sumNullable(rows.map((row) => row.sevenDayValueJpy))),
    thirtyDayReturnPct: returnFromValue(sumNullable(rows.map((row) => row.thirtyDayValueJpy))),
    rows
  };
}

function renderReport({ config, state, snapshot, exchangeRestBase, usdJpy }) {
  const status = snapshot.totalPnlJpy >= 0 ? '🟢' : '🔴';
  const stateComment = embedState(state);
  const lines = [
    '# Portfolio Performance Tracker',
    '',
    `${status} **Current value: ${formatJpy(snapshot.totalValueJpy)}**`,
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
    ...snapshot.rows.map((row) => [
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
    '## Tracking setup',
    '',
    `- Portfolio: ${state.portfolioName || config.portfolioName || 'Hypothetical Crypto Portfolio'}`,
    `- Started at: ${formatDateTime(new Date(state.startedAt))} (${TIME_ZONE})`,
    `- Generated at: ${formatDateTime(new Date(snapshot.generatedAt))} (${TIME_ZONE})`,
    `- Market data: ${exchangeRestBase.origin}`,
    '- FX: Frankfurter USD/JPY latest rate, with fallback from config when unavailable.',
    '- Entry costs: fee and slippage are included in simulated entry quantity if configured.',
    '',
    '## How to read this',
    '',
    '- This is a hypothetical portfolio tracker. It does not place orders.',
    '- The issue body is updated with the latest snapshot; daily comments preserve history.',
    '- To restart tracking from current prices, run the workflow manually with `reset_state=true`.',
    '',
    `<!-- portfolio-report:${formatDate(new Date(snapshot.generatedAt))} -->`,
    stateComment
  ];
  return lines.join('\n');
}

async function findTrackerIssue(token, repository) {
  const headers = githubHeaders(token);
  const issues = await githubJson(`https://api.github.com/repos/${repository}/issues?state=open&per_page=100`, { headers });
  return issues.find((issue) => issue.title === REPORT_ISSUE_TITLE && !issue.pull_request) || null;
}

async function publishTrackerIssue({ token, repository, markdown, state, existingIssue }) {
  const headers = githubHeaders(token);
  const issue = existingIssue || await findTrackerIssue(token, repository);
  let publishedIssue = issue;

  if (!publishedIssue) {
    publishedIssue = await githubJson(`https://api.github.com/repos/${repository}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: REPORT_ISSUE_TITLE, body: markdown })
    });
  } else {
    publishedIssue = await githubJson(`https://api.github.com/repos/${repository}/issues/${publishedIssue.number}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ body: markdown })
    });
  }

  const marker = `portfolio-report:${formatDate(new Date())}`;
  const comments = await githubJson(`https://api.github.com/repos/${repository}/issues/${publishedIssue.number}/comments?per_page=100`, { headers });
  const alreadyCommented = comments.some((comment) => typeof comment.body === 'string' && comment.body.includes(marker));
  if (!alreadyCommented) {
    await githubJson(`https://api.github.com/repos/${repository}/issues/${publishedIssue.number}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: markdown.replace(embedState(state), '') })
    });
  }

  console.log(`Published portfolio tracker to issue #${publishedIssue.number}.`);
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

async function publishWebhook({ markdown, snapshot }) {
  const webhookUrl = process.env.PERFORMANCE_WEBHOOK_URL;
  if (!webhookUrl) return;

  const summary = [
    `Portfolio Performance: ${formatJpy(snapshot.totalValueJpy)} (${formatSignedJpy(snapshot.totalPnlJpy)}, ${formatPct(snapshot.totalReturnPct)})`,
    `Today: ${formatPct(snapshot.todayReturnPct)} | 7D: ${formatPct(snapshot.sevenDayReturnPct)} | 30D: ${formatPct(snapshot.thirtyDayReturnPct)}`
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

function sumNullable(values) {
  if (values.some((value) => value === null || value === undefined || !Number.isFinite(value))) return null;
  return sum(values);
}

function formatJpy(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
}

function formatSignedJpy(value) {
  if (!Number.isFinite(value)) return '—';
  const formatted = formatJpy(Math.abs(value));
  return `${value >= 0 ? '+' : '-'}${formatted}`;
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

function formatDateTime(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
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
