import { useMemo, useState } from 'react';
import { runBacktest } from './lib/backtest';
import { defaultParams, StrategyParams } from './lib/strategy';
import { generateScenario, parseCandlesCsv, ScenarioName } from './lib/sampleData';
import { formatCurrency, formatPercent, formatNumber } from './lib/format';
import { Candle, EquityPoint, Trade } from './lib/types';

const scenarioLabels: Record<ScenarioName, string> = {
  trend: 'BTC風トレンド相場',
  range: 'レンジ相場',
  crashRecovery: '急落→回復相場'
};

const parameterHelp: Record<keyof StrategyParams, string> = {
  initialCapital: '初期資金。バックテストの開始残高です。',
  fastEma: '短期トレンドを見るEMA期間。小さいほど反応が速くなります。',
  slowEma: '長期トレンドを見るEMA期間。大きいほど騙しを減らします。',
  rsiPeriod: 'RSIの計算期間。',
  rsiEntryMin: 'エントリー時のRSI下限。弱すぎる反発を避けます。',
  rsiEntryMax: 'エントリー時のRSI上限。買われすぎの飛び乗りを避けます。',
  atrPeriod: 'ATRの計算期間。ストップ幅と利確幅に使います。',
  atrStopMultiplier: '初期ストップ幅。ATRにこの倍率を掛けます。',
  takeProfitAtr: '利確ライン。エントリー価格からATR倍率分だけ上に置きます。',
  trailingAtr: 'トレーリングストップ幅。高値更新時に切り上げます。',
  riskPerTrade: '1トレードで失ってよい最大割合。例: 0.01 = 1%。',
  maxPositionPct: '口座残高に対する最大建玉割合。例: 0.35 = 35%。',
  minTrendPct: 'EMA差の最低条件。横ばいの騙しを減らします。',
  feeBps: '往復ではなく片道の手数料bps。10bps = 0.1%。',
  slippageBps: '成行・急変時の保守的な滑りbps。',
  maxDrawdownStop: 'このドローダウンを超えたら新規エントリーを止めます。'
};

function updateNumberParam(params: StrategyParams, key: keyof StrategyParams, value: string): StrategyParams {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return params;
  return { ...params, [key]: parsed };
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: 'good' | 'bad' }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong className={accent === 'good' ? 'good' : accent === 'bad' ? 'bad' : ''}>{value}</strong>
    </div>
  );
}

function EquityChart({ points }: { points: EquityPoint[] }) {
  if (points.length < 2) return <div className="empty-chart">十分なデータがありません。</div>;

  const width = 920;
  const height = 280;
  const padding = 24;
  const values = points.map((p) => p.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);

  const line = points
    .map((p, index) => {
      const x = padding + (index / (points.length - 1)) * (width - padding * 2);
      const y = height - padding - ((p.equity - min) / span) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Equity curve">
      <rect x="0" y="0" width={width} height={height} rx="20" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="3" />
      <text x="24" y="36">{formatCurrency(max)}</text>
      <text x="24" y={height - 16}>{formatCurrency(min)}</text>
    </svg>
  );
}

function TradeTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return <p className="muted">まだトレードは発生していません。</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>理由</th>
            <th>数量</th>
            <th>損益</th>
            <th>損益率</th>
          </tr>
        </thead>
        <tbody>
          {trades.slice(-20).reverse().map((trade, index) => (
            <tr key={`${trade.entryTime}-${trade.exitTime}-${index}`}>
              <td>{trades.length - index}</td>
              <td>{new Date(trade.entryTime).toLocaleDateString()}</td>
              <td>{new Date(trade.exitTime).toLocaleDateString()}</td>
              <td><span className="pill">{trade.exitReason}</span></td>
              <td>{formatNumber(trade.quantity, 5)}</td>
              <td className={trade.pnl >= 0 ? 'good' : 'bad'}>{formatCurrency(trade.pnl)}</td>
              <td className={trade.pnlPct >= 0 ? 'good' : 'bad'}>{formatPercent(trade.pnlPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParameterInput({
  label,
  name,
  value,
  step,
  params,
  setParams
}: {
  label: string;
  name: keyof StrategyParams;
  value: number;
  step: string;
  params: StrategyParams;
  setParams: (params: StrategyParams) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        title={parameterHelp[name]}
        onChange={(event) => setParams(updateNumberParam(params, name, event.target.value))}
      />
      <small>{parameterHelp[name]}</small>
    </label>
  );
}

export default function App() {
  const [params, setParams] = useState<StrategyParams>(defaultParams);
  const [scenario, setScenario] = useState<ScenarioName>('trend');
  const [csv, setCsv] = useState('');
  const [useCsv, setUseCsv] = useState(false);

  const candles: Candle[] = useMemo(() => {
    if (useCsv && csv.trim()) {
      return parseCandlesCsv(csv);
    }
    return generateScenario(scenario, 420);
  }, [csv, scenario, useCsv]);

  const result = useMemo(() => runBacktest(candles, params), [candles, params]);
  const metrics = result.metrics;

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Crypto Auto Trade Simulator</p>
          <h1>実運用前に、売買ロジックの癖とリスクを見える化する</h1>
          <p>
            EMA・RSI・ATRを組み合わせたトレンド追随戦略を、手数料・スリッページ・資金管理込みで検証します。
            成績が良くても、まずはテストネットとペーパートレードに進む設計です。
          </p>
        </div>
        <div className="hero-card">
          <span>最終残高</span>
          <strong>{formatCurrency(metrics.finalEquity)}</strong>
          <em className={metrics.totalReturn >= 0 ? 'good' : 'bad'}>{formatPercent(metrics.totalReturn)}</em>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="panel-heading">
            <h2>データ</h2>
            <label className="switch">
              <input type="checkbox" checked={useCsv} onChange={(event) => setUseCsv(event.target.checked)} />
              <span>CSVを使う</span>
            </label>
          </div>

          {!useCsv ? (
            <label className="field">
              <span>シナリオ</span>
              <select value={scenario} onChange={(event) => setScenario(event.target.value as ScenarioName)}>
                {Object.entries(scenarioLabels).map(([key, label]) => (
                  <option value={key} key={key}>{label}</option>
                ))}
              </select>
              <small>まずは相場環境ごとの挙動を確認します。</small>
            </label>
          ) : (
            <label className="field">
              <span>OHLCV CSV</span>
              <textarea
                rows={10}
                placeholder="timestamp,open,high,low,close,volume"
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
              />
              <small>timestamp, open, high, low, close, volume の順に入力してください。</small>
            </label>
          )}
        </div>

        <div className="panel">
          <h2>リスク制御</h2>
          <div className="param-grid">
            <ParameterInput label="初期資金" name="initialCapital" value={params.initialCapital} step="100" params={params} setParams={setParams} />
            <ParameterInput label="1回リスク" name="riskPerTrade" value={params.riskPerTrade} step="0.001" params={params} setParams={setParams} />
            <ParameterInput label="最大建玉" name="maxPositionPct" value={params.maxPositionPct} step="0.01" params={params} setParams={setParams} />
            <ParameterInput label="DD停止" name="maxDrawdownStop" value={params.maxDrawdownStop} step="0.01" params={params} setParams={setParams} />
            <ParameterInput label="手数料bps" name="feeBps" value={params.feeBps} step="1" params={params} setParams={setParams} />
            <ParameterInput label="滑りbps" name="slippageBps" value={params.slippageBps} step="1" params={params} setParams={setParams} />
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>戦略パラメータ</h2>
        <div className="param-grid wide">
          <ParameterInput label="短期EMA" name="fastEma" value={params.fastEma} step="1" params={params} setParams={setParams} />
          <ParameterInput label="長期EMA" name="slowEma" value={params.slowEma} step="1" params={params} setParams={setParams} />
          <ParameterInput label="RSI期間" name="rsiPeriod" value={params.rsiPeriod} step="1" params={params} setParams={setParams} />
          <ParameterInput label="RSI下限" name="rsiEntryMin" value={params.rsiEntryMin} step="1" params={params} setParams={setParams} />
          <ParameterInput label="RSI上限" name="rsiEntryMax" value={params.rsiEntryMax} step="1" params={params} setParams={setParams} />
          <ParameterInput label="ATR期間" name="atrPeriod" value={params.atrPeriod} step="1" params={params} setParams={setParams} />
          <ParameterInput label="ATRストップ" name="atrStopMultiplier" value={params.atrStopMultiplier} step="0.1" params={params} setParams={setParams} />
          <ParameterInput label="ATR利確" name="takeProfitAtr" value={params.takeProfitAtr} step="0.1" params={params} setParams={setParams} />
          <ParameterInput label="ATRトレール" name="trailingAtr" value={params.trailingAtr} step="0.1" params={params} setParams={setParams} />
          <ParameterInput label="最小EMA差" name="minTrendPct" value={params.minTrendPct} step="0.001" params={params} setParams={setParams} />
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="総リターン" value={formatPercent(metrics.totalReturn)} accent={metrics.totalReturn >= 0 ? 'good' : 'bad'} />
        <MetricCard label="最大DD" value={formatPercent(metrics.maxDrawdown)} accent="bad" />
        <MetricCard label="勝率" value={formatPercent(metrics.winRate)} />
        <MetricCard label="Profit Factor" value={Number.isFinite(metrics.profitFactor) ? formatNumber(metrics.profitFactor, 2) : '∞'} />
        <MetricCard label="取引数" value={`${metrics.tradeCount}`} />
        <MetricCard label="Sharpe概算" value={formatNumber(metrics.sharpe, 2)} />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Equity Curve</h2>
          <span className="muted">データ本数: {candles.length}</span>
        </div>
        <EquityChart points={result.equityCurve} />
      </section>

      <section className="panel">
        <h2>直近トレード</h2>
        <TradeTable trades={result.trades} />
      </section>

      <section className="panel notes">
        <h2>実運用へ進める時のチェック</h2>
        <p>
          成績が良い場合でも、すぐ本番発注には進めません。まず同じロジックをペーパートレードで走らせ、
          約定ずれ、APIエラー、スリッページ、連敗時の停止が想定通りかを確認してください。
        </p>
        <ul>
          <li>APIキーはサーバー側だけに置く</li>
          <li>デフォルトは必ず DRY_RUN=true</li>
          <li>1日損失・連敗・API失敗回数で自動停止</li>
          <li>注文前に最小注文数量、板厚、価格乖離を確認</li>
          <li>全シグナルと注文を監査ログに残す</li>
        </ul>
      </section>
    </main>
  );
}
