import { useEffect, useMemo, useState } from 'react';

type Position = {
  symbol: string;
  label: string;
  allocationPct: number;
  quantity: number;
  allocationJpy: number;
  entryPriceUsdt: number;
  effectiveEntryPriceUsdt: number;
  currentPriceUsdt: number;
  valueJpy: number;
  pnlJpy: number;
  returnPct: number;
};

type HistoryPoint = {
  date: string;
  valueJpy: number;
  returnPct: number;
};

type DashboardData = {
  generatedAt: string;
  timeZone: string;
  publicDashboardUrl: string;
  schedule: {
    label: string;
    cronUtc: string;
  };
  source: {
    exchange: string;
    restBaseUrl: string;
    fxProvider: string;
    quoteCurrency: string;
    baseCurrency: string;
  };
  portfolio: {
    name: string;
    startedAt: string;
    initialInvestmentJpy: number;
    entryUsdJpy: number;
    currentUsdJpy: number;
    entryFeeBps: number;
    entrySlippageBps: number;
    currentValueJpy: number;
    pnlJpy: number;
    totalReturnPct: number;
    todayReturnPct: number | null;
    previousCloseReturnPct: number | null;
    sevenDayReturnPct: number | null;
    thirtyDayReturnPct: number | null;
    positions: Position[];
    history: HistoryPoint[];
  };
};

type LoadState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: DashboardData; error: null }
  | { status: 'error'; data: null; error: string };

const dataUrl = `${import.meta.env.BASE_URL}data/performance.json`;

function formatJpy(value: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
}

function formatSignedJpy(value: number): string {
  return `${value >= 0 ? '+' : '-'}${formatJpy(Math.abs(value))}`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value >= 100 ? 2 : 6 }).format(value);
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ja-JP', { style: 'percent', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function tone(value: number | null): 'good' | 'bad' | '' {
  if (value === null || !Number.isFinite(value)) return '';
  return value >= 0 ? 'good' : 'bad';
}

function MetricCard({ label, value, accent, note }: { label: string; value: string; accent?: 'good' | 'bad' | ''; note?: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong className={accent || ''}>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}

function Sparkline({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) {
    return <div className="empty-chart">履歴データは次回更新から増えていきます。</div>;
  }

  const width = 920;
  const height = 260;
  const padding = 24;
  const values = points.map((point) => point.valueJpy);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const line = points
    .map((point, index) => {
      const x = padding + (index / (points.length - 1)) * (width - padding * 2);
      const y = height - padding - ((point.valueJpy - min) / span) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio value history">
      <defs>
        <linearGradient id="equity-gradient" x1="0" x2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={width} height={height} rx="24" />
      {[0, 1, 2, 3].map((row) => (
        <line key={row} x1="24" x2="896" y1={48 + row * 46} y2={48 + row * 46} />
      ))}
      <polyline points={line} fill="none" stroke="url(#equity-gradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <text x="28" y="36">{formatJpy(max)}</text>
      <text x="28" y={height - 14}>{formatJpy(min)}</text>
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
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <tr key={position.symbol}>
              <td>
                <strong>{position.label}</strong>
                <span className="subtle"> {position.symbol}</span>
              </td>
              <td>{formatPct(position.allocationPct)}</td>
              <td>{position.quantity >= 1 ? position.quantity.toFixed(6) : position.quantity.toFixed(8)}</td>
              <td>{formatUsd(position.entryPriceUsdt)}</td>
              <td>{formatUsd(position.currentPriceUsdt)}</td>
              <td>{formatJpy(position.valueJpy)}</td>
              <td className={tone(position.pnlJpy)}>{formatSignedJpy(position.pnlJpy)}</td>
              <td className={tone(position.returnPct)}>{formatPct(position.returnPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="app-shell center-state">
      <div className="panel state-panel">
        <p className="eyebrow">Loading</p>
        <h1>最新データを読み込んでいます</h1>
        <p>GitHub Pagesにデプロイされた日次スナップショットを取得中です。</p>
      </div>
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="app-shell center-state">
      <div className="panel state-panel">
        <p className="eyebrow">Data not ready</p>
        <h1>日次データがまだ生成されていません</h1>
        <p>{message}</p>
        <p className="muted">GitHub Actionsの `Public Performance Dashboard` が完了すると、このURLで最新状態が見られます。</p>
      </div>
    </main>
  );
}

export default function App() {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const response = await fetch(`${dataUrl}?ts=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`performance.json の取得に失敗しました: HTTP ${response.status}`);
        const data = (await response.json()) as DashboardData;
        if (!cancelled) setLoadState({ status: 'ready', data, error: null });
      } catch (error) {
        if (!cancelled) setLoadState({ status: 'error', data: null, error: error instanceof Error ? error.message : 'unknown error' });
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
  const latestHistory = useMemo(() => portfolio?.history?.slice(-30) ?? [], [portfolio]);

  if (loadState.status === 'loading') return <LoadingState />;
  if (loadState.status === 'error' || !data || !portfolio) return <ErrorState message={loadState.error ?? 'データがありません。'} />;

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Public Performance Dashboard</p>
          <h1>100万円を入れていたら、今いくらか</h1>
          <p>
            BTC / ETH / SOL に分散した仮想ポートフォリオを、毎日自動で更新します。
            このURLを開くだけで、最新の評価額・損益・リターンを確認できます。
          </p>
          <div className="url-card">
            <span>公開URL</span>
            <a href={data.publicDashboardUrl}>{data.publicDashboardUrl}</a>
          </div>
        </div>
        <div className="hero-card">
          <span>現在評価額</span>
          <strong>{formatJpy(portfolio.currentValueJpy)}</strong>
          <em className={tone(portfolio.pnlJpy)}>{formatSignedJpy(portfolio.pnlJpy)} / {formatPct(portfolio.totalReturnPct)}</em>
          <small>初期投資額 {formatJpy(portfolio.initialInvestmentJpy)}</small>
        </div>
      </section>

      <section className="status-strip">
        <div>
          <span className="live-dot" />
          <strong>自動更新</strong>
          <small>{data.schedule.label}</small>
        </div>
        <div>
          <strong>最終生成</strong>
          <small>{formatDateTime(data.generatedAt)} JST</small>
        </div>
        <div>
          <strong>データソース</strong>
          <small>{data.source.exchange}</small>
        </div>
        <div>
          <strong>USD/JPY</strong>
          <small>{portfolio.currentUsdJpy.toFixed(4)}</small>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="総リターン" value={formatPct(portfolio.totalReturnPct)} accent={tone(portfolio.totalReturnPct)} note="現在評価額 ÷ 初期投資額 - 1" />
        <MetricCard label="今日の変化" value={formatPct(portfolio.todayReturnPct)} accent={tone(portfolio.todayReturnPct)} note="現在価格 ÷ 今日の始値ベース" />
        <MetricCard label="前日終値比" value={formatPct(portfolio.previousCloseReturnPct)} accent={tone(portfolio.previousCloseReturnPct)} note="現在価格 ÷ 前日終値ベース" />
        <MetricCard label="7日リターン" value={formatPct(portfolio.sevenDayReturnPct)} accent={tone(portfolio.sevenDayReturnPct)} note="保有数量固定で評価" />
        <MetricCard label="30日リターン" value={formatPct(portfolio.thirtyDayReturnPct)} accent={tone(portfolio.thirtyDayReturnPct)} note="USDT価格 × USDJPY" />
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="panel-heading">
            <h2>評価額推移</h2>
            <span className="muted">直近{latestHistory.length}ポイント</span>
          </div>
          <Sparkline points={latestHistory} />
        </div>
        <div className="panel summary-panel">
          <h2>追跡条件</h2>
          <dl>
            <div><dt>開始日時</dt><dd>{formatDateTime(portfolio.startedAt)} JST</dd></div>
            <div><dt>初期投資額</dt><dd>{formatJpy(portfolio.initialInvestmentJpy)}</dd></div>
            <div><dt>初回USD/JPY</dt><dd>{portfolio.entryUsdJpy.toFixed(4)}</dd></div>
            <div><dt>初回コスト</dt><dd>手数料 {portfolio.entryFeeBps}bps / 滑り {portfolio.entrySlippageBps}bps</dd></div>
            <div><dt>公開データ</dt><dd>{data.source.restBaseUrl}</dd></div>
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>銘柄別パフォーマンス</h2>
          <span className="muted">BTC 34% / ETH 33% / SOL 33%</span>
        </div>
        <PositionTable positions={portfolio.positions} />
      </section>

      <section className="panel notes">
        <h2>毎日見る場所</h2>
        <p>
          このページはGitHub Actionsで毎日再生成されます。ブラウザにブックマークしておけば、毎回このURLを開くだけで最新状態を確認できます。
          GitHub Issue「Portfolio Performance Tracker」にも同じスナップショットと日次履歴コメントを残します。
        </p>
      </section>
    </main>
  );
}
