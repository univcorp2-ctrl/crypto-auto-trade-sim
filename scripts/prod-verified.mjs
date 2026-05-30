import { mkdir, writeFile } from 'node:fs/promises';
const C = String.fromCharCode;
const L = C(60);
const R = C(62);
const S = C(47);
const Q = C(34);
const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT'];
const products = { BTCUSDT:'BTC-USD', ETHUSDT:'ETH-USD', SOLUSDT:'SOL-USD' };
const names = { BTCUSDT:'Bitcoin', ETHUSDT:'Ethereum', SOLUSDT:'Solana', USDT:'Cash USDT' };
const startJpy = 1000000;
await mkdir('dist/data', { recursive:true });
const fx = await fxRate();
const market = {};
const errors = [];
for (const s of symbols) {
  try { market[s] = await candles(products[s]); }
  catch (e) { errors.push(s + ' ' + msg(e)); }
}
const ready = symbols.every(function(s){ return Array.isArray(market[s]); });
const data = ready ? runStrategy(market, fx) : unavailable(errors.join(' | '), fx);
await writeFile('dist/data/live-results.json', JSON.stringify(data, null, 2) + '\n', 'utf8');
await writeFile('dist/data/trades.csv', toCsv(data.trades), 'utf8');
await writeFile('dist/data/trades.xls', toTsv(data.trades), 'utf8');
await writeFile('dist/index.html', page(data), 'utf8');
console.log('verified dashboard built ' + data.mode + ' candles ' + data.dataProvenance.candleRowsTotal);
async function candles(product) {
  const end = new Date();
  const start = new Date(end.getTime() - 180 * 86400000);
  const u = new URL('/products/' + product + '/candles', 'https://api.exchange.coinbase.com');
  u.searchParams.set('granularity', '86400');
  u.searchParams.set('start', start.toISOString());
  u.searchParams.set('end', end.toISOString());
  const rows = await json(u);
  if (!Array.isArray(rows) || neg(rows.length - 30)) throw new Error('not enough candles');
  return rows.map(function(r){ return { date:new Date(Number(r[0]) * 1000).toISOString().slice(0,10), time:Number(r[0]) * 1000, low:Number(r[1]), high:Number(r[2]), open:Number(r[3]), close:Number(r[4]), volume:Number(r[5]) }; }).sort(function(a,b){ return a.time - b.time; });
}
async function fxRate() { try { const d = await json('https://api.frankfurter.dev/v2/rates?base=USD&symbols=JPY'); return pos(Number(d.rates.JPY)) ? Number(d.rates.JPY) : 155; } catch { return 155; } }
async function json(u) { const r = await fetch(u, { headers:{ accept:'application/json', 'user-agent':'crypto-auto-trade-sim' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
function runStrategy(m, fx) {
  const feeRate = 0.001;
  const ma = 20;
  const look = 7;
  const minLen = Math.min.apply(null, symbols.map(function(s){ return m[s].length; }));
  const indexes = Array.from({ length: Math.max(0, minLen - ma) }, function(_, i){ return i + ma; });
  const h = Object.fromEntries(symbols.map(function(s){ return [s, { q:0, cost:0 }]; }));
  let cash = startJpy / fx;
  let realized = 0;
  const history = [];
  const trades = [];
  indexes.forEach(function(i){
    const prices = Object.fromEntries(symbols.map(function(s){ return [s, m[s][i].close]; }));
    const total = cash + symbols.reduce(function(sum, s){ return sum + h[s].q * prices[s]; }, 0);
    const selected = symbols.filter(function(s){ return pos(prices[s] - avg(m[s].slice(i - ma, i).map(function(x){ return x.close; }))) && pos(prices[s] - m[s][i - look].close); }).sort(function(a,b){ return ret(prices[b], m[b][i - look].close) - ret(prices[a], m[a][i - look].close); });
    const weights = Object.fromEntries(symbols.map(function(s){ return [s, selected.includes(s) ? 1 / selected.length : 0]; }));
    symbols.forEach(function(s){
      const price = prices[s];
      const current = h[s].q * price;
      const want = total * (weights[s] || 0);
      const diff = want - current;
      if (!pos(Math.abs(diff) - total * 0.006)) return;
      const fee = Math.abs(diff) * feeRate;
      if (pos(diff) && pos(cash - fee)) {
        const spend = Math.min(diff, cash - fee);
        const q = spend / price;
        h[s].q += q;
        h[s].cost += spend;
        cash -= spend + fee;
        trades.push(trade(m[s][i].date, s, 'BUY', q, price, fee, 0, fx));
      } else if (neg(diff) && pos(h[s].q)) {
        const sell = Math.min(Math.abs(diff), h[s].q * price);
        const q = sell / price;
        const avgCost = h[s].cost / h[s].q;
        const pnl = (price - avgCost) * q - fee;
        realized += pnl;
        h[s].q -= q;
        h[s].cost = Math.max(0, h[s].cost - avgCost * q);
        cash += sell - fee;
        trades.push(trade(m[s][i].date, s, 'SELL', q, price, fee, pnl, fx));
      }
    });
    const value = cash + symbols.reduce(function(sum, s){ return sum + h[s].q * prices[s]; }, 0);
    history.push({ date:m[symbols[0]][i].date, valueJpy:Math.round(value * fx), valueUsd:value, returnPct:ret(value, startJpy / fx) });
  });
  const last = Object.fromEntries(symbols.map(function(s){ return [s, m[s].at(-1).close]; }));
  const totalUsd = cash + symbols.reduce(function(sum, s){ return sum + h[s].q * last[s]; }, 0);
  const positions = symbols.map(function(s){ const val = h[s].q * last[s]; const pnl = val - h[s].cost; return { symbol:s, asset:s.replace('USDT',''), label:names[s], quantity:h[s].q, priceUsd:last[s], valueJpy:Math.round(val * fx), allocationPct:pos(totalUsd) ? val / totalUsd : 0, unrealizedPnlJpy:Math.round(pnl * fx), returnPct:pos(h[s].cost) ? pnl / h[s].cost : 0 }; }).filter(function(x){ return pos(x.valueJpy - 100); });
  if (pos(cash * fx - 100)) positions.push({ symbol:'USDT', asset:'USDT', label:names.USDT, quantity:cash, priceUsd:1, valueJpy:Math.round(cash * fx), allocationPct:pos(totalUsd) ? cash / totalUsd : 0, unrealizedPnlJpy:0, returnPct:0 });
  const current = Math.round(totalUsd * fx);
  const prev = history.at(-2)?.valueJpy || current;
  const seven = history.at(-8)?.valueJpy || prev;
  const thirty = history.at(-31)?.valueJpy || prev;
  const provenance = provenanceFrom(m, fx);
  return { generatedAt:new Date().toISOString(), publicUrl:'https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/', mode:'real-market-backtest', dataQuality:'real-public-market-data', apiStatus:'connected', accountStatus:'Coinbase Exchangeの実ローソク足データとFrankfurterのUSD JPYで、ワイワイ自動売買を実行した場合の結果を計算しています。実口座の約定結果ではありません。', dataProvenance:provenance, summary:{ currentValueJpy:current, realizedPnlJpy:Math.round(realized * fx), unrealizedPnlJpy:Math.round(positions.reduce(function(sum,x){ return sum + x.unrealizedPnlJpy; }, 0)), totalPnlJpy:current - startJpy, totalReturnPct:ret(current, startJpy), todayPnlJpy:current - prev, todayReturnPct:ret(current, prev), sevenDayPnlJpy:current - seven, sevenDayReturnPct:ret(current, seven), thirtyDayPnlJpy:current - thirty, thirtyDayReturnPct:ret(current, thirty) }, positions, trades:trades.slice(-160).reverse(), history, metrics:metric(history, trades), exports:{ json:'data/live-results.json', csv:'data/trades.csv', excel:'data/trades.xls' } };
}
function provenanceFrom(m, fx) { const per = Object.fromEntries(symbols.map(function(s){ const rows = m[s]; return [s, { product:products[s], source:'Coinbase Exchange candles', granularitySeconds:86400, rows:rows.length, firstDate:rows[0].date, lastDate:rows.at(-1).date, lastCloseUsd:rows.at(-1).close }]; })); return { priceSource:'Coinbase Exchange public candles', fxSource:'Frankfurter USD JPY latest rate', usdJpy:fx, fetchedAt:new Date().toISOString(), candleRowsTotal:Object.values(per).reduce(function(sum,x){ return sum + x.rows; }, 0), perSymbol:per }; }
function unavailable(reason, fx) { return { generatedAt:new Date().toISOString(), publicUrl:'https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/', mode:'real-data-unavailable', dataQuality:'unavailable', apiStatus:'disconnected', accountStatus:'リアルマーケットデータ取得に失敗しました: ' + reason, dataProvenance:{ priceSource:'unavailable', fxSource:'Frankfurter or fallback', usdJpy:fx, fetchedAt:new Date().toISOString(), candleRowsTotal:0, perSymbol:{} }, summary:{ currentValueJpy:0, realizedPnlJpy:0, unrealizedPnlJpy:0, totalPnlJpy:0, totalReturnPct:0, todayPnlJpy:0, todayReturnPct:0, sevenDayPnlJpy:0, sevenDayReturnPct:0, thirtyDayPnlJpy:0, thirtyDayReturnPct:0 }, positions:[], trades:[], history:[{ date:new Date().toISOString().slice(0,10), valueJpy:0, returnPct:0 }], metrics:metric([],[]), exports:{ json:'data/live-results.json', csv:'data/trades.csv', excel:'data/trades.xls' } }; }
function page(d) { const s=d.summary; const pts=chart(d.history); const posRows=d.positions.map(function(x){return tg('div',tg('b',x.asset)+tg('span',x.label)+tg('strong',yen(x.valueJpy))+tg('small',percent(x.allocationPct)),{class:'asset','data-pos':'1','data-symbol':x.symbol});}).join(''); const tradeRows=d.trades.slice(0,80).map(function(x){return tg('tr',tg('td',x.datetime)+tg('td',x.symbol)+tg('td',x.side)+tg('td',number(x.quantity,6))+tg('td',number(x.priceUsd||x.priceUsdt,2))+tg('td',number(x.feeUsd||x.feeUsdt,5))+tg('td',number(x.realizedPnlUsd||x.realizedPnlUsdt,2),{class:pos(x.realizedPnlUsd||x.realizedPnlUsdt)?'pos':'neg'}),{'data-trade':'1','data-side':x.side,'data-symbol':x.symbol});}).join(''); const provRows=Object.entries(d.dataProvenance.perSymbol||{}).map(function(e){const x=e[1];return tg('tr',tg('td',e[0])+tg('td',x.product)+tg('td',String(x.rows))+tg('td',x.firstDate)+tg('td',x.lastDate)+tg('td',number(x.lastCloseUsd,2)));}).join(''); const raw=JSON.stringify(d,null,2); const css='body{margin:0;background:#06101d;color:#edf4ff;font-family:system-ui,sans-serif}main{max-width:1540px;margin:auto;padding:28px}.hero,.card{background:linear-gradient(180deg,#182436ee,#09121fee);border:1px solid #29405f;border-radius:22px;box-shadow:0 25px 80px #0008}.hero{padding:28px;margin-bottom:16px;display:flex;justify-content:space-between;gap:20px}.grid{display:grid;gap:16px}.kpis{grid-template-columns:repeat(6,1fr)}.two{grid-template-columns:1.35fr .85fr}.card{padding:22px;margin-bottom:16px}h1{margin:0;font-size:34px}.muted{color:#9fb0c9}.kpi strong{display:block;font-size:26px;margin-top:8px}.pos{color:#22c55e}.neg{color:#fb7185}svg{width:100%;height:280px}polyline{fill:none;stroke:#60a5fa;stroke-width:2.5}.asset{display:flex;justify-content:space-between;border:1px solid #26364c;border-radius:14px;padding:13px;margin:8px 0;background:#ffffff08}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #334155;padding:11px;text-align:left}.btn,.tab{display:inline-block;color:#dbeafe;text-decoration:none;border:1px solid #36506c;border-radius:12px;padding:11px 18px;margin:5px;background:#ffffff10;cursor:pointer}.tab.active{background:#2563eb;color:white}.input{background:#0b1625;color:white;border:1px solid #36506c;border-radius:12px;padding:12px}.hidden{display:none}.modal{position:fixed;inset:0;background:#0009;display:grid;place-items:center;padding:20px}.modal.hidden{display:none}.modalbox{max-width:920px;max-height:82vh;overflow:auto;background:#0b1625;border:1px solid #36506c;border-radius:20px;padding:20px}pre{white-space:pre-wrap;color:#cfe8ff}@media(max-width:1000px){.kpis,.two{grid-template-columns:1fr}.hero{display:block}}'; const k=function(a,b,c){return tg('section',tg('span',a,{class:'muted'})+tg('strong',b,{class:c||''}),{class:'card kpi'});}; const body=tg('main',tg('section',tg('div',tg('h1','Crypto Auto Trade Simulator')+tg('p','リアルデータによるワイワイ自動売買の結果モニタリング',{class:'muted'}))+tg('div','最終更新 '+new Date(d.generatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+tg('br')+d.mode+' / '+d.apiStatus,{class:'muted'}),{class:'hero'})+tg('section',d.accountStatus,{class:'card muted'})+tg('section',k('総資産',yen(s.currentValueJpy),pos(s.totalPnlJpy)?'pos':'neg')+k('確定損益',yen(s.realizedPnlJpy),pos(s.realizedPnlJpy)?'pos':'neg')+k('含み損益',yen(s.unrealizedPnlJpy),pos(s.unrealizedPnlJpy)?'pos':'neg')+k('本日の損益',yen(s.todayPnlJpy),pos(s.todayPnlJpy)?'pos':'neg')+k('過去7日',yen(s.sevenDayPnlJpy),pos(s.sevenDayPnlJpy)?'pos':'neg')+k('過去30日',yen(s.thirtyDayPnlJpy),pos(s.thirtyDayPnlJpy)?'pos':'neg'),{class:'grid kpis'})+tg('section',tg('article',tg('h2','ポートフォリオ推移')+tg('div',tg('button','30日',{class:'tab active','data-range':'30'})+tg('button','90日',{class:'tab','data-range':'90'})+tg('button','全期間',{class:'tab','data-range':'ALL'}))+tg('svg',tg('polyline','',{id:'line',points:pts}),{viewBox:'0 0 100 100',preserveAspectRatio:'none'})+tg('div',d.history.at(-30)?.date+' 〜 '+d.history.at(-1)?.date,{id:'range-label',class:'muted'}),{class:'card'})+tg('article',tg('h2','資産配分')+tg('div',tg('button','全て',{class:'tab active','data-filter-pos':'ALL'})+tg('button','BTC',{class:'tab','data-filter-pos':'BTCUSDT'})+tg('button','ETH',{class:'tab','data-filter-pos':'ETHUSDT'})+tg('button','SOL',{class:'tab','data-filter-pos':'SOLUSDT'}))+posRows,{class:'card'}),{class:'grid two'})+tg('section',tg('article',tg('h2','最新約定 / ワイワイトレード履歴')+tg('input','',{id:'search',class:'input',placeholder:'検索'})+tg('button','全部',{class:'tab active','data-side':'ALL'})+tg('button','買い',{class:'tab','data-side':'BUY'})+tg('button','売り',{class:'tab','data-side':'SELL'})+tg('table',tg('thead',tg('tr',tg('th','日時')+tg('th','ペア')+tg('th','売買')+tg('th','数量')+tg('th','価格')+tg('th','手数料')+tg('th','実現損益')))+tg('tbody',tradeRows||tg('tr',tg('td','取引なし',{colspan:'7'})))),{class:'card'})+tg('article',tg('h2','パフォーマンス')+tg('p','勝率 '+percent(d.metrics.winRate)+' / 取引回数 '+d.metrics.totalTrades+' / PF '+number(d.metrics.profitFactor,2)+' / 最大DD '+percent(d.metrics.maxDrawdownPct))+tg('h2','データ検証')+tg('table',tg('thead',tg('tr',tg('th','Symbol')+tg('th','Product')+tg('th','Rows')+tg('th','First')+tg('th','Last')+tg('th','Last close USD')))+tg('tbody',provRows)),{class:'card'}),{class:'grid two'})+tg('section',tg('h2','データエクスポート / 操作')+tg('a','JSON',{href:'data/live-results.json',class:'btn'})+tg('a','CSV',{href:'data/trades.csv',class:'btn'})+tg('a','Excel',{href:'data/trades.xls',class:'btn'})+tg('button','生データ表示',{id:'openRaw',class:'btn'})+tg('button','URLコピー',{id:'copyUrl',class:'btn'})+tg('button','再読み込み',{id:'reload',class:'btn'}),{class:'card'})+tg('div',tg('div',tg('button','閉じる',{id:'closeRaw',class:'btn'})+tg('pre',raw,{id:'raw'}),{class:'modalbox'}),{id:'modal',class:'modal hidden'})); const js=clientJs(); return LT+'!doctype html'+GT+tg('html',tg('head',void('meta',{charset:'utf-8'})+void('meta',{name:'viewport',content:'width=device-width,initial-scale=1'})+tg('title','Crypto Auto Trade Simulator')+tg('style',css))+tg('body',body+tg('script',js)),{lang:'ja'}); }
function clientJs(){return `(function(){var data=JSON.parse(document.getElementById('raw').textContent);function by(id){return document.getElementById(id)}function pts(rows){var vals=rows.map(function(r){return r.valueJpy||0});var min=Math.min.apply(null,vals);var max=Math.max.apply(null,vals);var span=Math.max(max-min,1);return vals.map(function(v,i){var x=i/Math.max(vals.length-1,1)*100;var y=100-(v-min)/span*100;return x.toFixed(2)+','+y.toFixed(2)}).join(' ')}function act(sel,el){document.querySelectorAll(sel).forEach(function(b){b.classList.remove('active')});el.classList.add('active')}document.querySelectorAll('[data-range]').forEach(function(b){b.onclick=function(){act('[data-range]',b);var r=b.getAttribute('data-range');var rows=r==='ALL'?data.history:data.history.slice(-Number(r));by('line').setAttribute('points',pts(rows));by('range-label').textContent=(rows[0]?rows[0].date:'')+' 〜 '+(rows.at(-1)?rows.at(-1).date:'')}});document.querySelectorAll('[data-filter-pos]').forEach(function(b){b.onclick=function(){act('[data-filter-pos]',b);var f=b.getAttribute('data-filter-pos');document.querySelectorAll('[data-pos]').forEach(function(row){row.style.display=f==='ALL'||row.getAttribute('data-symbol')===f?'':'none'})}});var side='ALL';function filt(){var q=(by('search').value||'').toLowerCase();document.querySelectorAll('[data-trade]').forEach(function(row){var a=side==='ALL'||row.getAttribute('data-side')===side;var b=row.textContent.toLowerCase().indexOf(q)!==-1;row.style.display=a&&b?'':'none'})}document.querySelectorAll('[data-side]').forEach(function(b){b.onclick=function(){act('[data-side]',b);side=b.getAttribute('data-side');filt()}});by('search').oninput=filt;by('openRaw').onclick=function(){by('modal').classList.remove('hidden')};by('closeRaw').onclick=function(){by('modal').classList.add('hidden')};by('copyUrl').onclick=function(){navigator.clipboard.writeText(location.href)};by('reload').onclick=function(){location.reload()};})();`}
function tg(name, body, attrs) { return LT + name + attrsToText(attrs || {}) + R + String(body || '') + LT + S + name + R; }
function void(name, attrs) { return LT + name + attrsToText(attrs || {}) + R; }
function attrsToText(attrs) { return Object.entries(attrs).map(function(e){ return ' ' + e[0] + '=' + Q + String(e[1]).replaceAll(Q,'') + Q; }).join(''); }
function trade(date,s,side,q,price,fee,pnl,fx){ return { datetime:date, symbol:s, side, quantity:q, priceUsd:price, feeUsd:fee, realizedPnlUsd:pnl, realizedPnlJpy:Math.round(pnl*fx), source:'waiwai-real-market-backtest' }; }
function chart(rows){ const vals=rows.map(function(x){return x.valueJpy||0}); const min=Math.min.apply(null,vals); const max=Math.max.apply(null,vals); const span=Math.max(max-min,1); return vals.map(function(v,i){ return (i/Math.max(vals.length-1,1)*100).toFixed(2)+','+(100-(v-min)/span*100).toFixed(2); }).join(' '); }
function metric(h,t){ const r=t.map(function(x){return Number(x.realizedPnlUsd||0)}).filter(function(x){return x!==0}); const w=r.filter(pos); const l=r.filter(neg); const gp=w.reduce(sum,0); const gl=Math.abs(l.reduce(sum,0)); return { winRate:r.length?w.length/r.length:0, totalTrades:t.length, winningTrades:w.length, losingTrades:l.length, profitFactor:gl?gp/gl:gp?99:0, maxDrawdownPct:drawdown(h) }; }
function drawdown(h){ let peak=0; let dd=0; h.forEach(function(x){ peak=Math.max(peak,x.valueJpy); if(pos(peak)) dd=Math.min(dd,(x.valueJpy-peak)/peak); }); return dd; }
function toCsv(t){ const h=['datetime','symbol','side','quantity','priceUsd','feeUsd','realizedPnlUsd','source']; return h.join(',')+'\n'+t.map(function(r){return h.map(function(k){return JSON.stringify(r[k]||'')}).join(',')}).join('\n')+'\n'; }
function toTsv(t){ const h=['datetime','symbol','side','quantity','priceUsd','feeUsd','realizedPnlUsd','source']; return h.join('\t')+'\n'+t.map(function(r){return h.map(function(k){return String(r[k]||'')}).join('\t')}).join('\n')+'\n'; }
function yen(x){return new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(x||0))} function percent(x){return new Intl.NumberFormat('ja-JP',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(x||0))} function number(x,d){return new Intl.NumberFormat('ja-JP',{maximumFractionDigits:d||2}).format(Number(x||0))} function avg(a){return a.length?a.reduce(sum,0)/a.length:0} function sum(a,b){return a+b} function ret(a,b){return pos(b)?(a-b)/b:0} function pos(x){return Math.sign(Number(x))===1} function neg(x){return Math.sign(Number(x))===-1} function msg(e){return e instanceof Error?e.message:String(e)}
