import { useEffect, useMemo, useState } from 'react';
import { fallbackDashboardData } from './fallbackData';
import type { DashboardData, HistoryPoint, Position, TradeSignal } from './types';

const dataUrl = `${import.meta.env.BASE_URL}data/performance.json`;

type LoadState =
  | { status: 'loading'; data: null; error: null; fallback: false }
  | { status: 'ready'; data: DashboardData; error: null; fallback: false }
  | { status: 'fallback'; data: DashboardData; error: string; fallback: true };

function formatJpy(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0
  }).format(value);
}

function formatSignedJpy(value: number): string {
  return `${value >= 0 ? '+' : '-'}${formatJpy(Math.abs(value))}`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 2 : 6
  }).format(value);
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ja-JP', {
    style: 'percent',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function tone(value: number | null): 'good' | 'bad' | '' {
  if (value === null || !Number.isFinite(value) || value === 0) return '';
  return value > 0 ? 'good' : 'bad';
}

function signalClass(signal: TradeSignal): string {
  return signal === 'BUY' ? 'signal-buy' : signal === 'REDUCE' ? 'signal-reduce' : 'signal-hold';
}

function MetricCard({ label, value, accent, note }: { label: string; value: string; accent?: 'good' | 'bad' | ''; note?: string }) {
  return (
    <section className="metric-card">
      <span>{label}</span>
      <strong className={accent}>{value}</strong>
      {note ? <small>{note}</small> : null}
    </section>
  );
}

function Sparkline({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) {
    return <div className="empty-chart">履歴データは次回更新から増えていきます。</div>;
  }

  const width = 920;
  const height = 300;
  const padding = 30;
  const values = points.map((point) => point.valueJpy);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const line = points
    .map((point, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point.valueJpy - min) / span) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio value history chart">
      <defs>
        <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(34, 211, 238, 0.38)" />
          <stop offset="100%" stopColor="rgba(34, 211, 238, 0.02)" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((row) => {
        const y = padding + row * ((height - padding * 2) / 3);
        return <line key={row} x1={padding} x2={width - padding} y1={y} y2={y} />;
      })}
      <polyline
        points={`${padding},${height - padding} ${line} ${width - padding},${height - padding}`}
        fill="url(#area)"
        stroke="none"
      />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <text x={padding} y={24}>{formatJpy(max)}</text>
      <text x={padding} y={height - 8}>{formatJpy(min)}</text>
    </svg>
  );
}

function PositionTable({ positions }: { positions: Position[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Allocation</th>
            <th>Quantity</th>
            <th>Entry</th>
            <th>Current</th>
            <th>Value</th>
            <th>P/L</th>
            <th>Return</th>
            <th>Signal</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <tr key={position.symbol}>
              <td>
                <strong>{position.label}</strong>
                <small>{position.symbol}</small>
              </td>
              <td>{formatPct(position.allocationPct)}</td>
              <td>{position.quantity >= 1 ? position.quantity.toFixed(6) : position.quantity.toFixed(8)}</td>
              <td>{formatUsd(position.entryPriceUsdt)}</td>
              <td>{formatUsd(position.currentPriceUsdt)}</td>
              <td>{formatJpy(position.valueJpy)}</td>
              <td className={tone(position.pnlJpy)}>{formatSignedJpy(position.pnlJpy)}</td>
              <td className={tone(position.returnPct)}>{formatPct(position.returnPct)}</td>
              <td>
                <span className={`signal ${signalClass(position.signal)}`}>{position.signal}</span>
                <small>{position.signalReason}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="center-state">
      <section className="state-panel">
        <p className="eyebrow">Loading</p>
        <h1>最新データを読み込んでいます</h1>
        <p>GitHub Pagesにデプロイされた日次スナップショットを取得中です。</p>
      </section>
    </main>
  );
}

function App() {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading', data: null, error: null, fallback: false });
  const [capital, setCapital] = useState(1_000_000);
  const [riskLimit, setRiskLimit] = useState(12);
  const [rebalanceBand, setRebalanceBand] = useState(5);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const response = await fetch(`${dataUrl}?ts=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`performance.json の取得に失敗しました: HTTP ${response.status}`);
        }
        const data = (await response.json()) as DashboardData;
        if (!cancelled) setLoadState({ status: 'ready', data, error: null, fallback: false });
      } catch (error) {
        if (!cancelled) {
          setLoadState({
            status: 'fallback',
            data: fallbackDashboardData,
            error: error instanceof Error ? error.message : 'unknown error',
            fallback: true
          });
        }
      }
    }

    void loadData();
    const timer = window.setInterval(loadData, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const data = loadState.data;
  const portfolio = data?.portfolio;
  const latestHistory = useMemo(() => portfolio?.history?.slice(-45) ?? [], [portfolio]);
  const scaledValue = portfolio ? (capital / portfolio.initialInvestmentJpy) * portfolio.currentValueJpy : 0;
  const scaledPnl = scaledValue - capital;
  const shouldReduceRisk = portfolio ? Math.abs(portfolio.maxDrawdownPct) * 100 >= riskLimit : false;
  const largestDrift = portfolio
    ? Math.max(
        ...portfolio.positions.map((position) =>
          Math.abs((position.valueJpy / Math.max(portfolio.currentValueJpy, 1) - position.allocationPct) * 100)
        )
      )
    : 0;

  if (loadState.status === 'loading') return <LoadingState />;
  if (!data || !portfolio) return null;

  return (
    <main className="app-shell">
      {loadState.fallback ? (
        <aside className="warning-banner">
          公開データの取得に失敗したため、フォールバックデータで起動しています。詳細: {loadState.error}
        </aside>
      ) : null}

      <section className="hero">
        <div>
          <p className="eyebrow">Crypto Auto Trade Simulator</p>
          <h1>暗号資産の自動売買を、URLひとつで毎日チェック。</h1>
          <p>
            BTC / ETH / SOL に分散した仮想ポートフォリオをGitHub Actionsで更新し、GitHub Pagesに公開します。
            発注は常にドライランで、売買シグナル・損益・リスクを確認するためのWebアプリです。
          </p>
          <div className="url-card">
            <span>公開URL</span>
            <a href={data.publicDashboardUrl}>{data.publicDashboardUrl}</a>
          </div>
        </div>
        <aside className="hero-card">
          <span>現在評価額</span>
          <strong>{formatJpy(portfolio.currentValueJpy)}</strong>
          <em className={tone(portfolio.pnlJpy)}>{formatSignedJpy(portfolio.pnlJpy)} / {formatPct(portfolio.totalReturnPct)}</em>
          <small>初期投資額 {formatJpy(portfolio.initialInvestmentJpy)}</small>
        </aside>
      </section>

      <section className="status-strip" aria-label="Automation status">
        <div><small>Status</small><strong><span className="live-dot" />GitHub Pages Ready</strong></div>
        <div><small>更新</small><strong>{data.automation.scheduleLabel}</strong></div>
        <div><small>最終生成</small><strong>{formatDateTime(data.generatedAt)}</strong></div>
        <div><small>Mode</small><strong>{data.automation.liveTradingEnabled ? 'Live' : 'Dry-run only'}</strong></div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="今日の変化" value={formatPct(portfolio.todayReturnPct)} accent={tone(portfolio.todayReturnPct)} />
        <MetricCard label="7日リターン" value={formatPct(portfolio.sevenDayReturnPct)} accent={tone(portfolio.sevenDayReturnPct)} />
        <MetricCard label="30日リターン" value={formatPct(portfolio.thirtyDayReturnPct)} accent={tone(portfolio.thirtyDayReturnPct)} />
        <MetricCard label="最大DD" value={formatPct(portfolio.maxDrawdownPct)} accent="bad" note="履歴期間ベース" />
        <MetricCard label="Risk Score" value={`${portfolio.riskScore}/100`} note="高いほど安定" />
      </section>

      <section className="grid two">
        <article className="panel">
          <div className="panel-heading">
            <h2>評価額推移</h2>
            <span className="muted">直近{latestHistory.length}ポイント</span>
          </div>
          <Sparkline points={latestHistory} />
        </article>

        <article className="panel simulator-panel">
          <h2>シナリオ設定</h2>
          <label>
            <span>投資元本</span>
            <input type="number" min="10000" step="10000" value={capital} onChange={(event) => setCapital(Number(event.target.value))} />
          </label>
          <label>
            <span>許容最大DD</span>
            <input type="range" min="3" max="35" value={riskLimit} onChange={(event) => setRiskLimit(Number(event.target.value))} />
            <strong>{riskLimit}%</strong>
          </label>
          <label>
            <span>リバランス幅</span>
            <input type="range" min="1" max="15" value={rebalanceBand} onChange={(event) => setRebalanceBand(Number(event.target.value))} />
            <strong>{rebalanceBand}%</strong>
          </label>
          <div className="scenario-result">
            <span>この元本での想定評価額</span>
            <strong>{formatJpy(scaledValue)}</strong>
            <em className={tone(scaledPnl)}>{formatSignedJpy(scaledPnl)}</em>
          </div>
          <p className={shouldReduceRisk ? 'bad' : 'good'}>
            {shouldReduceRisk ? 'リスク上限超過: 追加購入は停止し、縮小シグナルを優先。' : 'リスク上限内: ドライランでシグナル監視を継続。'}
          </p>
          <p className={largestDrift >= rebalanceBand ? 'bad' : 'muted'}>
            現在の最大乖離は {largestDrift.toFixed(2)}%。{largestDrift >= rebalanceBand ? 'リバランス候補です。' : '許容範囲内です。'}
          </p>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>銘柄別パフォーマンスと売買シグナル</h2>
          <span className="muted">BTC / ETH / SOL</span>
        </div>
        <PositionTable positions={portfolio.positions} />
      </section>

      <section className="grid two">
        <article className="panel summary-panel">
          <h2>追跡条件</h2>
          <dl>
            <div><dt>開始日時</dt><dd>{formatDateTime(portfolio.startedAt)}</dd></div>
            <div><dt>USD/JPY</dt><dd>{portfolio.currentUsdJpy.toFixed(4)}</dd></div>
            <div><dt>初回コスト</dt><dd>手数料 {portfolio.entryFeeBps}bps / 滑り {portfolio.entrySlippageBps}bps</dd></div>
            <div><dt>データソース</dt><dd>{data.source.exchange} / {data.source.fxProvider}</dd></div>
          </dl>
        </article>

        <article className="panel notes">
          <h2>運用ルール</h2>
          <ul>
            <li>本番発注は無効。`ENABLE_LIVE_TRADING=false` のドライランWebアプリです。</li>
            <li>GitHub Actionsが日次で価格取得、JSON生成、テスト、Viteビルド、Pages公開を実行します。</li>
            <li>外部APIに失敗した場合もフォールバックデータでWebアプリをビルドできます。</li>
          </ul>
        </article>
      </section>
    </main>
  );
}

export default App;
