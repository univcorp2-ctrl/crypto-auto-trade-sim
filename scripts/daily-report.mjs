import { mkdir, writeFile } from 'node:fs/promises';

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const REPORT_ISSUE_TITLE = 'Daily Crypto Return Report';
const REPORT_PATH = 'reports/latest-daily-return.md';
const TIME_ZONE = process.env.REPORT_TIME_ZONE || 'Asia/Tokyo';

const symbols = parseSymbols(process.env.SYMBOLS);
const exchangeProfile = process.env.EXCHANGE_PROFILE || 'binance-spot';
const exchangeRestBase = normalizeBaseUrl(process.env.EXCHANGE_REST_BASE || 'https://api.binance.com');

async function main() {
  const rows = [];
  const errors = [];

  for (const symbol of symbols) {
    try {
      rows.push(await buildSymbolReport(symbol));
    } catch (error) {
      errors.push({ symbol, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const markdown = renderReport(rows, errors);
  await mkdir('reports', { recursive: true });
  await writeFile(REPORT_PATH, markdown, 'utf8');

  await publishToGitHubIssue(markdown);
  await publishToWebhook(markdown, rows, errors);

  console.log(markdown);
}

async function buildSymbolReport(symbol) {
  const [price, klines] = await Promise.all([
    fetchTickerPrice(symbol),
    fetchDailyKlines(symbol, 40)
  ]);

  const stats = calculateDailyReturnStats(price, klines);
  return {
    symbol,
    price,
    ...stats
  };
}

async function fetchTickerPrice(symbol) {
  const url = new URL('/api/v3/ticker/price', exchangeRestBase);
  url.searchParams.set('symbol', symbol);
  const payload = await fetchJson(url);
  const price = Number(payload.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`invalid ticker price response for ${symbol}`);
  }
  return price;
}

async function fetchDailyKlines(symbol, limit) {
  const url = new URL('/api/v3/klines', exchangeRestBase);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', '1d');
  url.searchParams.set('limit', String(limit));
  const payload = await fetchJson(url);
  if (!Array.isArray(payload)) {
    throw new Error(`invalid kline response for ${symbol}`);
  }
  return payload
    .map((row) => ({
      openTime: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: Number(row[6])
    }))
    .filter((row) =>
      Number.isFinite(row.openTime) &&
      row.open > 0 &&
      row.high > 0 &&
      row.low > 0 &&
      row.close > 0 &&
      row.high >= row.low
    )
    .sort((a, b) => a.openTime - b.openTime);
}

function calculateDailyReturnStats(currentPrice, klines) {
  const latest = klines.at(-1);
  if (!latest) {
    throw new Error('no daily kline data');
  }

  const closeDaysAgo = (daysAgo) => {
    const index = klines.length - 1 - daysAgo;
    return index >= 0 ? klines[index].close : null;
  };

  const fromReference = (reference) => {
    if (!reference || reference <= 0) return null;
    return currentPrice / reference - 1;
  };

  return {
    todayOpen: latest.open,
    todayReturn: latest.open > 0 ? currentPrice / latest.open - 1 : null,
    previousCloseReturn: fromReference(closeDaysAgo(1)),
    sevenDayReturn: fromReference(closeDaysAgo(7)),
    thirtyDayReturn: fromReference(closeDaysAgo(30)),
    latestDailyOpenTime: latest.openTime,
    latestDailyCloseTime: latest.closeTime
  };
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
    await sleep(400 * attempt);
    return fetchJson(url, attempt + 1);
  }

  if (!response.ok) {
    if (attempt < maxAttempts && [408, 418, 429, 500, 502, 503, 504].includes(response.status)) {
      await sleep(700 * attempt);
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`HTTP ${response.status} from ${url.pathname}`);
  }

  return response.json();
}

function renderReport(rows, errors) {
  const generatedAt = formatDateTime(new Date());
  const body = [
    '# Daily Crypto Return Report',
    '',
    `Generated: **${generatedAt} (${TIME_ZONE})**`,
    `Exchange profile: **${exchangeProfile}**`,
    `REST base: \`${exchangeRestBase.origin}\``,
    '',
    '| Symbol | Current Price | Today | vs Prev Close | 7D | 30D | Today Open |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...rows.map((row) => [
      `| ${row.symbol}`,
      formatUsd(row.price),
      formatPct(row.todayReturn),
      formatPct(row.previousCloseReturn),
      formatPct(row.sevenDayReturn),
      formatPct(row.thirtyDayReturn),
      formatUsd(row.todayOpen),
      '|'
    ].join(' | ')),
    '',
    '## Notes',
    '',
    '- This report uses public market data only. No API key is required for this daily return check.',
    '- The default trading configuration remains dry-run/testnet-first. Do not enable live trading until backtests, paper trading, and risk checks pass.',
    '- Returns are calculated from the latest fetched spot price against daily candle references.',
    ''
  ];

  if (errors.length > 0) {
    body.push('## Fetch errors', '', '| Symbol | Error |', '|---|---|');
    for (const error of errors) {
      body.push(`| ${error.symbol} | ${escapeMarkdown(error.message)} |`);
    }
    body.push('');
  }

  body.push(`<!-- daily-report:${formatDate(new Date())} -->`);
  return body.join('\n');
}

async function publishToGitHubIssue(markdown) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) {
    console.log('GITHUB_TOKEN or GITHUB_REPOSITORY is not set; skipping issue publication.');
    return;
  }

  const apiBase = 'https://api.github.com';
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };

  const issues = await githubJson(`${apiBase}/repos/${repository}/issues?state=open&per_page=100`, { headers });
  let issue = issues.find((item) => item.title === REPORT_ISSUE_TITLE && !item.pull_request);

  if (!issue) {
    issue = await githubJson(`${apiBase}/repos/${repository}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: REPORT_ISSUE_TITLE, body: markdown })
    });
  } else {
    issue = await githubJson(`${apiBase}/repos/${repository}/issues/${issue.number}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ body: markdown })
    });
  }

  if (process.env.DAILY_REPORT_CREATE_COMMENT !== 'false') {
    const todayMarker = `daily-report:${formatDate(new Date())}`;
    const comments = await githubJson(`${apiBase}/repos/${repository}/issues/${issue.number}/comments?per_page=100`, { headers });
    const alreadyCommented = comments.some((comment) => typeof comment.body === 'string' && comment.body.includes(todayMarker));
    if (!alreadyCommented) {
      await githubJson(`${apiBase}/repos/${repository}/issues/${issue.number}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: markdown })
      });
    }
  }

  console.log(`Published report to issue #${issue.number}.`);
}

async function githubJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function publishToWebhook(markdown, rows, errors) {
  const webhookUrl = process.env.DAILY_REPORT_WEBHOOK_URL;
  if (!webhookUrl) return;

  const summary = [
    `Daily Crypto Return Report - ${formatDateTime(new Date())} ${TIME_ZONE}`,
    ...rows.map((row) => `${row.symbol}: ${formatUsd(row.price)} | Today ${formatPct(row.todayReturn)} | 7D ${formatPct(row.sevenDayReturn)} | 30D ${formatPct(row.thirtyDayReturn)}`),
    ...errors.map((error) => `${error.symbol}: ERROR ${error.message}`)
  ].join('\n');

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: summary, content: summary, markdown })
  });

  if (!response.ok) {
    throw new Error(`webhook publish failed: ${response.status}`);
  }
}

function parseSymbols(value) {
  const parsed = (value || '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_SYMBOLS;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  return new URL(url.origin);
}

function formatUsd(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value >= 100 ? 2 : 6 }).format(value);
}

function formatPct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
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

function escapeMarkdown(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
