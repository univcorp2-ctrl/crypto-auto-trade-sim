import { mkdir, writeFile } from 'node:fs/promises';
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const SL = String.fromCharCode(47);
const DQ = String.fromCharCode(34);
const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const products = { BTCUSDT: 'BTC-USD', ETHUSDT: 'ETH-USD', SOLUSDT: 'SOL-USD' };
const labels = { BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', SOLUSDT: 'Solana', USDT: 'USDT 待機資金' };
const startCapitalJpy = Number(process.env.START_CAPITAL_JPY || 1000000);
const historyDays = Number(process.env.HISTORY_DAYS || 180);
await mkdir('dist/data', { recursive: true });
const usdJpy = await getUsdJpy();
const market = {};
const sourceErrors = [];
for (const symbol of symbols) {
  try {
    market[symbol] = await fetchCoinbaseCandles(products[symbol], historyDays);
  } catch (error) {
    sourceErrors.push(symbol + ': ' + message(error));
  }
}
const ready = symbols.every(function(symbol) { return Array.isArray(market[symbol]); });
const result = ready ? simulateWaiwai(market, usdJpy) : emptyDashboard(sourceErrors.join(' | '), usdJpy);
await writeFile('dist/data/live-results.json', JSON.stringify(result, null, 2) + '\n', 'utf8');
await writeFile('dist/data/trades.csv', renderCsv(result.trades), 'utf8');
await writeFile('dist/data/trades.xls', renderTsv(result.trades), 'utf8');
await writeFile('dist/index.html', renderHtml(result), 'utf8');
console.log('built production dashboard ' + result.mode + ' rows=' + result.dataProvenance.candleRowsTotal);

async function fetchCoinbaseCandles(product, days) {
  const now = new Date();
  const startedAt = new Date(now.getTime() - days * 86400000);
  const url = new URL('/products/' + product + '/candles', 'https://api.exchange.coinbase.com');
  url.searchParams.set('granularity', '86400');
  url.searchParams.set('start', startedAt.toISOString());
  url.searchParams.set('end', now.toISOString());
  const rows = await fetchJson(url);
  if (!Array.isArray(rows) || negative(rows.length - 30)) throw new Error('not enough daily candles');
  return rows.map(function(row) {
    return { date: new Date(Number(row[0]) * 1000).toISOString().slice(0, 10), timestamp: Number(row[0]) * 1000, low: Number(row[1]), high: Number(row[2]), open: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) };
  }).sort(function(a, b) { return a.timestamp - b.timestamp; });
}

async function getUsdJpy() {
  try {
    const data = await fetchJson('https://api.frankfurter.dev/v2/rates?base=USD&symbols=JPY');
    const rate = Number(data.rates && data.rates.JPY);
    return positive(rate) ? rate : 155;
  } catch {
    return 155;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'crypto-auto-trade-sim-production' } });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + String(url));
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function simulateWaiwai(market, fx) {
  const feeRate = 0.001;
  const lookback = 7;
  const maDays = 20;
  const minLength = Math.min.apply(null, symbols.map(function(symbol) { return market[symbol].length; }));
  const startIndex = Math.max(maDays, lookback);
  const indexes = Array.from({ length: Math.max(0, minLength - startIndex) }, function(_, offset) { return startIndex + offset; });
  const holdings = Object.fromEntries(symbols.map(function(symbol) { return [symbol, { quantity: 0, costUsdt: 0 }]; }));
  let cashUsdt = startCapitalJpy / fx;
  let realizedPnlUsdt = 0;
  const history = [];
  const trades = [];
  indexes.forEach(function(index) {
    const prices = Object.fromEntries(symbols.map(function(symbol) { return [symbol, market[symbol][index].close]; }));
    const totalBefore = cashUsdt + symbols.reduce(function(sum, symbol) { return sum + holdings[symbol].quantity * prices[symbol]; }, 0);
    const selected = symbols.filter(function(symbol) {
      const series = market[symbol];
      const price = series[index].close;
      const previous = series[index - lookback].close;
      const movingAverage = average(series.slice(index - maDays, index).map(function(row) { return row.close; }));
      return positive(price - movingAverage) && positive(price - previous);
    }).sort(function(left, right) {
      return change(prices[right], market[right][index - lookback].close) - change(prices[left], market[left][index - lookback].close);
    });
    const weights = Object.fromEntries(symbols.map(function(symbol) { return [symbol, selected.includes(symbol) ? 1 / selected.length : 0]; }));
    symbols.forEach(function(symbol) {
      const price = prices[symbol];
      const holding = holdings[symbol];
      const currentValue = holding.quantity * price;
      const targetValue = totalBefore * (weights[symbol] || 0);
      const diff = targetValue - currentValue;
      if (!positive(Math.abs(diff) - totalBefore * 0.006)) return;
      const fee = Math.abs(diff) * feeRate;
      if (positive(diff) && positive(cashUsdt - fee)) {
        const spend = Math.min(diff, cashUsdt - fee);
        const quantity = spend / price;
        holding.quantity += quantity;
        holding.costUsdt += spend;
        cashUsdt -= spend + fee;
        trades.push(tradeRow(market[symbol][index].date, symbol, 'BUY', quantity, price, fee, 0, fx));
      } else if (negative(diff) && positive(holding.quantity)) {
        const sellValue = Math.min(Math.abs(diff), holding.quantity * price);
        const quantity = sellValue / price;
        const averageCost = positive(holding.quantity) ? holding.costUsdt / holding.quantity : 0;
        const pnl = (price - averageCost) * quantity - fee;
        realizedPnlUsdt += pnl;
        holding.quantity -= quantity;
        holding.costUsdt = Math.max(0, holding.costUsdt - averageCost * quantity);
        cashUsdt += sellValue - fee;
        trades.push(tradeRow(market[symbol][index].date, symbol, 'SELL', quantity, price, fee, pnl, fx));
      }
    });
    const valueUsdt = cashUsdt + symbols.reduce(function(sum, symbol) { return sum + holdings[symbol].quantity * prices[symbol]; }, 0);
    history.push({ date: market[symbols[0]][index].date, valueJpy: Math.round(valueUsdt * fx), valueUsdt, returnPct: change(valueUsdt, startCapitalJpy / fx) });
  });
  const lastPrices = Object.fromEntries(symbols.map(function(symbol) { return [symbol, market[symbol].at(-1).close]; }));
  const currentValueUsdt = cashUsdt + symbols.reduce(function(sum, symbol) { return sum + holdings[symbol].quantity * lastPrices[symbol]; }, 0);
  const positions = symbols.map(function(symbol) {
    const holding = holdings[symbol];
    const valueUsdt = holding.quantity * lastPrices[symbol];
    const pnlUsdt = valueUsdt - holding.costUsdt;
    return { symbol, asset: symbol.replace('USDT', ''), label: labels[symbol], quantity: holding.quantity, priceUsdt: lastPrices[symbol], valueJpy: Math.round(valueUsdt * fx), allocationPct: positive(currentValueUsdt) ? valueUsdt / currentValueUsdt : 0, unrealizedPnlJpy: Math.round(pnlUsdt * fx), returnPct: positive(holding.costUsdt) ? pnlUsdt / holding.costUsdt : 0 };
  }).filter(function(row) { return positive(row.valueJpy - 100); });
  if (positive(cashUsdt * fx - 100)) {
    positions.push({ symbol: 'USDT', asset: 'USDT', label: labels.USDT, quantity: cashUsdt, priceUsdt: 1, valueJpy: Math.round(cashUsdt * fx), allocationPct: positive(currentValueUsdt) ? cashUsdt / currentValueUsdt : 0, unrealizedPnlJpy: 0, returnPct: 0 });
  }
  const currentValueJpy = Math.round(currentValueUsdt * fx);
  const previous = history.at(-2)?.valueJpy || currentValueJpy;
  const sevenAgo = history.at(-8)?.valueJpy || previous;
  const thirtyAgo = history.at(-31)?.valueJpy || previous;
  const provenance = buildProvenance(market, fx);
  return { generatedAt: new Date().toISOString(), publicUrl: 'https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/', mode: 'real-market-backtest', dataQuality: 'real-public-market-data', apiStatus: 'public-data-connected', accountStatus: 'Coinbase Exchangeの実ローソク足データとFrankfurterのUSD/JPYで、ワイワイ自動売買を実行した場合の結果を計算しています。実口座の約定結果ではありません。', dataProvenance: provenance, exchange: { name: 'Coinbase Exchange public candles', symbols, usdJpy: fx, userDataEnabled: false }, summary: { currentValueJpy, realizedPnlJpy: Math.round(realizedPnlUsdt * fx), unrealizedPnlJpy: Math.round(positions.reduce(function(sum, row) { return sum + row.unrealizedPnlJpy; }, 0)), totalPnlJpy: currentValueJpy - startCapitalJpy, totalReturnPct: change(currentValueJpy, startCapitalJpy), todayPnlJpy: currentValueJpy - previous, todayReturnPct: change(currentValueJpy, previous), sevenDayPnlJpy: currentValueJpy - sevenAgo, sevenDayReturnPct: change(currentValueJpy, sevenAgo), thirtyDayPnlJpy: currentValueJpy - thirtyAgo, thirtyDayReturnPct: change(currentValueJpy, thirtyAgo) }, positions, trades: trades.slice(-160).reverse(), history, metrics: calculateMetrics(history, trades), exports: { json: 'data/live-results.json', csv: 'data/trades.csv', excel: 'data/trades.xls' } };
}

function buildProvenance(market, fx) {
  const perSymbol = Object.fromEntries(symbols.map(function(symbol) {
    const rows = market[symbol] || [];
    return [symbol, { product: products[symbol], source: 'Coinbase Exchange REST /products/{product}/candles', granularitySeconds: 86400, rows: rows.length, firstDate: rows[0]?.date || null, lastDate: rows.at(-1)?.date || null, lastCloseUsd: rows.at(-1)?.close || null }];
  }));
  return { priceSource: 'Coinbase Exchange public candles', fxSource: 'Frankfurter USD to JPY latest rate', usdJpy: fx, fetchedAt: new Date().toISOString(), candleRowsTotal: Object.values(perSymbol).reduce(function(sum, row) { return sum + row.rows; }, 0), perSymbol };
}

function emptyDashboard(reason, fx) {
  return { generatedAt: new Date().toISOString(), publicUrl: 'https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/', mode: 'real-data-unavailable', dataQuality: 'unavailable', apiStatus: 'disconnected', accountStatus: 'リアルマーケットデータ取得に失敗しました: ' + reason, dataProvenance: { priceSource: 'unavailable', fxSource: 'Frankfurter fallback or unavailable', usdJpy: fx, fetchedAt: new Date().toISOString(), candleRowsTotal: 0, perSymbol: {} }, exchange: { name: 'unavailable', symbols, usdJpy: fx, userDataEnabled: false }, summary: { currentValueJpy: 0, realizedPnlJpy: 0, unrealizedPnlJpy: 0, totalPnlJpy: 0, totalReturnPct: 0, todayPnlJpy: 0, todayReturnPct: 0, sevenDayPnlJpy: 0, sevenDayReturnPct: 0, thirtyDayPnlJpy: 0, thirtyDayReturnPct: 0 }, positions: [], trades: [], history: [{ date: new Date().toISOString().slice(0, 10), valueJpy: 0, returnPct: 0 }], metrics: calculateMetrics([], []), exports: { json: 'data/live-results.json', csv: 'data/trades.csv', excel: 'data/trades.xls' } };
}

function renderHtml(data) {
  const css = 'body{margin:0;background:#06101d;color:#edf4ff;font-family:Inter,system-ui,sans-serif}main{max-width:1540px;margin:auto;padding:28px}.hero,.card{background:linear-gradient(180deg,rgba(24,36,54,.95),rgba(9,18,31,.95));border:1px solid #29405f;border-radius:22px;box-shadow:0 25px 80px #0008}.hero{padding:28px;margin-bottom:16px;display:flex;justify-content:space-between;gap:20px}.grid{display:grid;gap:16px}.kpis{grid-template-columns:repeat(6,1fr)}.two{grid-template-columns:1.35fr .85fr}.card{padding:22px;margin-bottom:16px}h1{margin:0;font-size:34px}.muted{color:#9fb0c9}.kpi strong{display:block;font-size:26px;margin-top:8px}.pos{color:#22c55e}.neg{color:#fb7185}svg{width:100%;height:280px}polyline{fill:none;stroke:#60a5fa;stroke-width:2.5}.asset{display:flex;justify-content:space-between;border:1px solid #26364c;border-radius:14px;padding:13px;margin:8px 0;background:#ffffff08}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #334155;padding:11px;text-align:left}.btn,.tab{display:inline-block;color:#dbeafe;text-decoration:none;border:1px solid #36506c;border-radius:12px;padding:11px 18px;margin:5px;background:#ffffff10;cursor:pointer}.tab.active{background:#2563eb;color:white}.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.input{background:#0b1625;color:white;border:1px solid #36506c;border-radius:12px;padding:12px}.hidden{display:none}.modal{position:fixed;inset:0;background:#0009;display:grid;place-items:center;padding:20px}.modal.hidden{display:none}.modalbox{max-width:920px;max-height:82vh;overflow:auto;background:#0b1625;border:1px solid #36506c;border-radius:20px;padding:20px}pre{white-space:pre-wrap;color:#cfe8ff}@media(max-width:1000px){.kpis,.two{grid-template-columns:1fr}.hero{display:block}}';
  const s = data.summary;
  const points = chartPoints(data.history);
  const card = function(label, value, klass) { return tag('section', tag('span', label, { class: 'muted' }) + tag('strong', value, { class: klass || '' }), { class: 'card kpi' }); };
  const positions = data.positions.map(function(row) { return tag('div', tag('b', row.asset) + tag('span', row.label) + tag('strong', jpy(row.valueJpy)) + tag('small', pct(row.allocationPct)), { class: 'asset', 'data-position-row': '1', 'data-symbol': row.symbol }); }).join('');
  const trades = data.trades.slice(0, 80).map(function(row) { return tag('tr', tag('td', row.datetime) + tag('td', row.symbol) + tag('td', row.side) + tag('td', num(row.quantity, 6)) + tag('td', num(row.priceUsdt, 2)) + tag('td', num(row.feeUsdt, 5)) + tag('td', num(row.realizedPnlUsdt, 2), { class: positive(row.realizedPnlUsdt) ? 'pos' : 'neg' }), { 'data-trade-row': '1', 'data-side': row.side, 'data-symbol': row.symbol }); }).join('');
  const provenanceRows = Object.entries(data.dataProvenance.perSymbol || {}).map(function(entry) { const row = entry[1]; return tag('tr', tag('td', entry[0]) + tag('td', row.product) + tag('td', String(row.rows)) + tag('td', row.firstDate || '') + tag('td', row.lastDate || '') + tag('td', num(row.lastCloseUsd, 2))); }).join('');
  const rawJson = JSON.stringify(data, null, 2);
  const script = interactiveScript();
  return LT + '!doctype html' + GT + tag('html', tag('head', voidTag('meta', { charset: 'utf-8' }) + voidTag('meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }) + tag('title', 'Crypto Auto Trade Simulator') + tag('style', css)) + tag('body', tag('main', tag('section', tag('div', tag('h1', 'Crypto Auto Trade Simulator') + tag('p', 'リアルデータによるワイワイ自動売買の結果モニタリング', { class: 'muted' })) + tag('div', tag('div', '最終更新 ' + new Date(data.generatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })) + tag('div', data.mode + ' / ' + data.apiStatus, { class: 'pos' })), { class: 'hero' }) + tag('section', data.accountStatus, { class: 'card muted' }) + tag('section', card('総資産', jpy(s.currentValueJpy), positive(s.totalPnlJpy) ? 'pos' : 'neg') + card('確定損益', jpy(s.realizedPnlJpy), positive(s.realizedPnlJpy) ? 'pos' : 'neg') + card('含み損益', jpy(s.unrealizedPnlJpy), positive(s.unrealizedPnlJpy) ? 'pos' : 'neg') + card('本日の損益', jpy(s.todayPnlJpy), positive(s.todayPnlJpy) ? 'pos' : 'neg') + card('過去7日', jpy(s.sevenDayPnlJpy), positive(s.sevenDayPnlJpy) ? 'pos' : 'neg') + card('過去30日', jpy(s.thirtyDayPnlJpy), positive(s.thirtyDayPnlJpy) ? 'pos' : 'neg'), { class: 'grid kpis' }) + tag('section', tag('article', tag('div', tag('h2', 'ポートフォリオ推移') + tag('div', tag('button', '30日', { class: 'tab active', 'data-range': '30' }) + tag('button', '90日', { class: 'tab', 'data-range': '90' }) + tag('button', '全期間', { class: 'tab', 'data-range': 'ALL' }), { class: 'toolbar' })) + tag('svg', tag('polyline', '', { id: 'equity-line', points }), { viewBox: '0 0 100 100', preserveAspectRatio: 'none' }) + tag('div', tag('span', data.history.at(-30)?.date || '') + tag('span', data.history.at(-1)?.date || '', { style: 'float:right' }), { class: 'muted', id: 'chart-range-label' }), { class: 'card' }) + tag('article', tag('h2', '資産配分') + tag('div', tag('button', '全て', { class: 'tab active', 'data-position-filter': 'ALL' }) + tag('button', 'BTC', { class: 'tab', 'data-position-filter': 'BTCUSDT' }) + tag('button', 'ETH', { class: 'tab', 'data-position-filter': 'ETHUSDT' }) + tag('button', 'SOL', { class: 'tab', 'data-position-filter': 'SOLUSDT' }), { class: 'toolbar' }) + (positions || 'データなし'), { class: 'card' }), { class: 'grid two' }) + tag('section', tag('article', tag('h2', '最新約定 / ワイワイトレード履歴') + tag('div', tag('input', '', { id: 'trade-search', class: 'input', placeholder: 'ペア・日時・売買で検索' }) + tag('button', '全部', { class: 'tab active', 'data-side-filter': 'ALL' }) + tag('button', '買い', { class: 'tab', 'data-side-filter': 'BUY' }) + tag('button', '売り', { class: 'tab', 'data-side-filter': 'SELL' }), { class: 'toolbar' }) + tag('table', tag('thead', tag('tr', tag('th', '日時') + tag('th', 'ペア') + tag('th', '売買') + tag('th', '数量') + tag('th', '価格') + tag('th', '手数料') + tag('th', '実現損益'))) + tag('tbody', trades || tag('tr', tag('td', '取引なし', { colspan: '7' }))), { class: 'card' }) + tag('article', tag('h2', 'パフォーマンス') + tag('p', '勝率 ' + pct(data.metrics.winRate) + ' / 取引回数 ' + data.metrics.totalTrades + ' / PF ' + num(data.metrics.profitFactor, 2) + ' / 最大DD ' + pct(data.metrics.maxDrawdownPct)) + tag('h2', 'データ検証') + tag('table', tag('thead', tag('tr', tag('th', 'Symbol') + tag('th', 'Product') + tag('th', 'Rows') + tag('th', 'First') + tag('th', 'Last') + tag('th', 'Last Close USD'))) + tag('tbody', provenanceRows)), { class: 'card' }), { class: 'grid two' }) + tag('section', tag('h2', 'データエクスポート / 操作') + tag('a', 'JSON', { href: 'data/live-results.json', class: 'btn' }) + tag('a', 'CSV', { href: 'data/trades.csv', class: 'btn' }) + tag('a', 'Excel', { href: 'data/trades.xls', class: 'btn' }) + tag('button', '生データを表示', { id: 'open-raw', class: 'btn' }) + tag('button', 'URLコピー', { id: 'copy-url', class: 'btn' }) + tag('button', '再読み込み', { id: 'reload-page', class: 'btn' }), { class: 'card' }) + tag('div', tag('div', tag('button', '閉じる', { id: 'close-raw', class: 'btn' }) + tag('pre', rawJson, { id: 'raw-json' }), { class: 'modalbox' }), { id: 'raw-modal', class: 'modal hidden' }) + tag('script', script))) , { lang: 'ja' });
}

function interactiveScript() {
  return `(function(){
var data = JSON.parse(document.getElementById('raw-json').textContent);
var byId = function(id){return document.getElementById(id)};
function points(rows){var values=rows.map(function(r){return r.valueJpy||0});var min=Math.min.apply(null,values);var max=Math.max.apply(null,values);var span=Math.max(max-min,1);return values.map(function(v,i){var x=(i/Math.max(values.length-1,1))*100;var y=100-((v-min)/span)*100;return x.toFixed(2)+','+y.toFixed(2)}).join(' ')}
function activate(group,el){document.querySelectorAll(group).forEach(function(b){b.classList.remove('active')});el.classList.add('active')}
document.querySelectorAll('[data-range]').forEach(function(btn){btn.addEventListener('click',function(){activate('[data-range]',btn);var r=btn.getAttribute('data-range');var rows=r==='ALL'?data.history:data.history.slice(-Number(r));byId('equity-line').setAttribute('points',points(rows));byId('chart-range-label').textContent=(rows[0]?rows[0].date:'')+' 〜 '+(rows.at(-1)?rows.at(-1).date:'')})});
document.querySelectorAll('[data-position-filter]').forEach(function(btn){btn.addEventListener('click',function(){activate('[data-position-filter]',btn);var f=btn.getAttribute('data-position-filter');document.querySelectorAll('[data-position-row]').forEach(function(row){row.style.display=f==='ALL'||row.getAttribute('data-symbol')===f?'':'none'})})});
var side='ALL';function filterTrades(){var q=(byId('trade-search').value||'').toLowerCase();document.querySelectorAll('[data-trade-row]').forEach(function(row){var okSide=side==='ALL'||row.getAttribute('data-side')===side;var okText=row.textContent.toLowerCase().indexOf(q)!==-1;row.style.display=okSide&&okText?'':'none'})}
document.querySelectorAll('[data-side-filter]').forEach(function(btn){btn.addEventListener('click',function(){activate('[data-side-filter]',btn);side=btn.getAttribute('data-side-filter');filterTrades()})});
byId('trade-search').addEventListener('input',filterTrades);
byId('open-raw').addEventListener('click',function(){byId('raw-modal').classList.remove('hidden')});
byId('close-raw').addEventListener('click',function(){byId('raw-modal').classList.add('hidden')});
byId('copy-url').addEventListener('click',function(){navigator.clipboard.writeText(location.href)});
byId('reload-page').addEventListener('click',function(){location.reload()});
})();`;
}

function tag(name, body, attrs = {}) { return LT + name + attr(attrs) + GT + String(body || '') + LT + SL + name + GT; }
function voidTag(name, attrs = {}) { return LT + name + attr(attrs) + GT; }
function attr(attrs) { return Object.entries(attrs).map(function(entry) { return ' ' + entry[0] + '=' + DQ + String(entry[1]).replaceAll(DQ, '') + DQ; }).join(''); }
function chartPoints(rows) { const values = rows.map(function(row) { return row.valueJpy || 0; }); const min = Math.min.apply(null, values); const max = Math.max.apply(null, values); const span = Math.max(max - min, 1); return values.map(function(value, index) { const x = index / Math.max(values.length - 1, 1) * 100; const y = 100 - (value - min) / span * 100; return x.toFixed(2) + ',' + y.toFixed(2); }).join(' '); }
function tradeRow(date, symbol, side, quantity, price, fee, pnl, fx) { return { id: date + '-' + symbol + '-' + side, datetime: date, symbol, side, quantity, priceUsdt: price, notionalUsdt: quantity * price, feeUsdt: fee, realizedPnlUsdt: pnl, realizedPnlJpy: Math.round(pnl * fx), source: 'waiwai-real-market-backtest' }; }
function calculateMetrics(history, trades) { const realized = trades.map(function(row) { return Number(row.realizedPnlUsdt || 0); }).filter(function(value) { return value !== 0; }); const wins = realized.filter(positive); const losses = realized.filter(negative); const grossProfit = wins.reduce(sum, 0); const grossLoss = Math.abs(losses.reduce(sum, 0)); return { winRate: realized.length ? wins.length / realized.length : 0, totalTrades: trades.length, winningTrades: wins.length, losingTrades: losses.length, profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? 99 : 0, maxDrawdownPct: maxDrawdown(history), volatilityPct: volatility(history), sharpeLike: sharpe(history) }; }
function maxDrawdown(history) { let peak = 0; let drawdown = 0; history.forEach(function(row) { peak = Math.max(peak, row.valueJpy); if (positive(peak)) drawdown = Math.min(drawdown, (row.valueJpy - peak) / peak); }); return drawdown; }
function volatility(history) { const returns = history.slice(1).map(function(row, index) { return change(row.valueJpy, history[index].valueJpy); }); const mean = average(returns); const variance = returns.length ? returns.reduce(function(total, value) { return total + (value - mean) ** 2; }, 0) / Math.max(returns.length - 1, 1) : 0; return Math.sqrt(variance) * Math.sqrt(365); }
function sharpe(history) { const vol = volatility(history); const returns = history.slice(1).map(function(row, index) { return change(row.valueJpy, history[index].valueJpy); }); return positive(vol) ? average(returns) * 365 / vol : 0; }
function renderCsv(trades) { const header = ['datetime', 'symbol', 'side', 'quantity', 'priceUsdt', 'notionalUsdt', 'feeUsdt', 'realizedPnlUsdt', 'source']; return header.join(',') + '\n' + trades.map(function(row) { return header.map(function(key) { return JSON.stringify(row[key] || ''); }).join(','); }).join('\n') + '\n'; }
function renderTsv(trades) { const header = ['datetime', 'symbol', 'side', 'quantity', 'priceUsdt', 'notionalUsdt', 'feeUsdt', 'realizedPnlUsdt', 'source']; return header.join('\t') + '\n' + trades.map(function(row) { return header.map(function(key) { return String(row[key] || ''); }).join('\t'); }).join('\n') + '\n'; }
function jpy(value) { return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function pct(value) { return new Intl.NumberFormat('ja-JP', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0)); }
function num(value, digits = 2) { return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }).format(Number(value || 0)); }
function positive(value) { return Math.sign(Number(value)) === 1; }
function negative(value) { return Math.sign(Number(value)) === -1; }
function change(current, previous) { return positive(previous) ? (current - previous) / previous : 0; }
function average(values) { return values.length ? values.reduce(sum, 0) / values.length : 0; }
function sum(total, value) { return total + value; }
function message(error) { return error instanceof Error ? error.message : String(error); }
