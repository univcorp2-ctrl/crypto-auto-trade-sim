import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPortfolioDailyKlines, fetchPortfolioPrices, fetchUsdJpyRate } from '../lib/liveMarket';
import {
  calculatePortfolioSnapshot,
  createPortfolioState,
  defaultPortfolioAssets,
  PortfolioSnapshot,
  PortfolioState
} from '../lib/portfolioPerformance';

const STORAGE_KEY = 'crypto-sim-hypothetical-portfolio-v1';

function formatJpy(value: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value >= 100 ? 2 : 6 }).format(value);
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ja-JP', { style: 'percent', maximumFractionDigits: 2 }).format(value);
}

function tone(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '';
  return value >= 0 ? 'good' : 'bad';
}

function PerfTile({ label, value, accent, note }: { label: string; value: string; accent?: 'good' | 'bad'; note?: string }) {
  return (
    <div className="portfolio-tile">
      <span>{label}</span>
      <strong className={accent ?? ''}>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function readStoredState(): PortfolioState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PortfolioState;
  } catch {
    return null;
  }
}

export default function HypotheticalPortfolioPanel() {
  const [initialInvestmentJpy, setInitialInvestmentJpy] = useState(1_000_000);
  const [state, setState] = useState<PortfolioState | null>(() => readStoredState());
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [usdJpy, setUsdJpy] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbols = useMemo(() => defaultPortfolioAssets.map((asset) => asset.symbol), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPrices, nextUsdJpy, klines] = await Promise.all([
        fetchPortfolioPrices(symbols),
        fetchUsdJpyRate(),
        fetchPortfolioDailyKlines(symbols, 35)
      ]);
      setPrices(nextPrices);
      setUsdJpy(nextUsdJpy);
      setLastUpdated(new Date());

      const currentState = readStoredState() ?? state;
      if (currentState) {
        setSnapshot(calculatePortfolioSnapshot(currentState, nextPrices, nextUsdJpy, klines));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'パフォーマンス取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [state, symbols]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  function startTracking() {
    if (!usdJpy) return;
    const nextState = createPortfolioState(defaultPortfolioAssets, prices, usdJpy, initialInvestmentJpy);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    setState(nextState);
    setSnapshot(calculatePortfolioSnapshot(nextState, prices, usdJpy));
  }

  function resetTracking() {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(null);
    setSnapshot(null);
  }

  const previewRows = defaultPortfolioAssets.map((asset) => {
    const allocationJpy = initialInvestmentJpy * asset.allocationPct;
    const price = prices[asset.symbol];
    const quantity = price && usdJpy ? allocationJpy / usdJpy / price : null;
    return { ...asset, allocationJpy, price, quantity };
  });

  return (
    <section className="panel portfolio-panel">
      <style>{`
        .portfolio-panel { position: relative; overflow: hidden; }
        .portfolio-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at top right, rgba(52, 211, 153, .13), transparent 30rem);
          pointer-events: none;
        }
        .portfolio-content { position: relative; z-index: 1; }
        .portfolio-toolbar {
          display: flex;
          gap: 16px;
          justify-content: space-between;
          align-items: end;
          margin-bottom: 18px;
        }
        .portfolio-toolbar p { margin: 6px 0 0; color: #91a0bd; line-height: 1.6; }
        .portfolio-controls { display: grid; grid-template-columns: 170px auto auto; gap: 10px; align-items: end; }
        .portfolio-controls label { display: flex; flex-direction: column; gap: 7px; color: #98a8c8; font-size: .82rem; }
        .portfolio-controls input {
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(8, 17, 31, 0.86);
          color: #f8fafc;
          border-radius: 14px;
          padding: 10px 12px;
          outline: none;
        }
        .portfolio-button {
          height: 42px;
          border: 0;
          border-radius: 14px;
          padding: 0 16px;
          color: #06202a;
          background: linear-gradient(135deg, #67e8f9, #34d399);
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 12px 28px rgba(45, 212, 191, .18);
        }
        .portfolio-button.secondary { color: #e2e8f0; background: rgba(15, 23, 42, .88); border: 1px solid rgba(148, 163, 184, .22); }
        .portfolio-button:disabled { opacity: .62; cursor: wait; }
        .portfolio-hero { display: grid; grid-template-columns: .9fr 1.1fr; gap: 16px; }
        .portfolio-main-card, .portfolio-tile {
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(8, 17, 31, 0.58);
          border-radius: 24px;
          padding: 18px;
        }
        .portfolio-main-card span, .portfolio-tile span { color: #98a8c8; font-size: .88rem; }
        .portfolio-main-card strong { display: block; margin-top: 8px; font-size: clamp(2rem, 5vw, 3.6rem); letter-spacing: -.06em; }
        .portfolio-meta { display: grid; gap: 8px; margin-top: 18px; color: #91a0bd; font-size: .92rem; }
        .portfolio-tile-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .portfolio-tile strong { display: block; margin-top: 8px; font-size: 1.55rem; letter-spacing: -.04em; }
        .portfolio-tile small { display: block; margin-top: 6px; color: #7483a3; line-height: 1.4; }
        .portfolio-table-title { margin: 18px 0 10px; color: #cbd5e1; font-weight: 800; }
        .portfolio-error { margin: 14px 0 0; color: #fecdd3; background: rgba(244, 63, 94, .11); border: 1px solid rgba(251, 113, 133, .24); border-radius: 16px; padding: 12px 14px; }
        @media (max-width: 1050px) {
          .portfolio-toolbar { align-items: flex-start; flex-direction: column; }
          .portfolio-controls { grid-template-columns: 1fr 1fr; width: 100%; }
          .portfolio-hero { grid-template-columns: 1fr; }
          .portfolio-tile-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 620px) { .portfolio-controls { grid-template-columns: 1fr; } }
      `}</style>
      <div className="portfolio-content">
        <div className="portfolio-toolbar">
          <div>
            <h2>100万円 仮想ポートフォリオ</h2>
            <p>BTC / ETH / SOLに分散投資していた場合の現在評価額、損益、今日の変化を見える化します。</p>
          </div>
          <div className="portfolio-controls">
            <label>
              初期投資額 JPY
              <input
                type="number"
                min="10000"
                step="10000"
                value={initialInvestmentJpy}
                onChange={(event) => setInitialInvestmentJpy(Math.max(10_000, Number(event.target.value) || 1_000_000))}
                disabled={Boolean(state)}
              />
            </label>
            {!state ? (
              <button className="portfolio-button" type="button" onClick={startTracking} disabled={loading || !usdJpy || Object.keys(prices).length === 0}>
                追跡開始
              </button>
            ) : (
              <button className="portfolio-button secondary" type="button" onClick={resetTracking}>リセット</button>
            )}
            <button className="portfolio-button secondary" type="button" onClick={() => void load()} disabled={loading}>
              {loading ? '更新中' : '価格更新'}
            </button>
          </div>
        </div>

        <div className="portfolio-hero">
          <div className="portfolio-main-card">
            <span>現在評価額</span>
            <strong>{snapshot ? formatJpy(snapshot.totalValueJpy) : '未開始'}</strong>
            <div className="portfolio-meta">
              <div>総損益: <span className={snapshot ? tone(snapshot.totalPnlJpy) : ''}>{snapshot ? `${snapshot.totalPnlJpy >= 0 ? '+' : ''}${formatJpy(snapshot.totalPnlJpy)}` : '—'}</span></div>
              <div>開始: {state ? new Date(state.startedAt).toLocaleString('ja-JP') : 'この端末では未開始'}</div>
              <div>最終更新: {lastUpdated ? lastUpdated.toLocaleString('ja-JP') : '未取得'} / USDJPY: {usdJpy ? usdJpy.toFixed(4) : '—'}</div>
            </div>
          </div>

          <div>
            <div className="portfolio-tile-grid">
              <PerfTile label="総リターン" value={snapshot ? formatPct(snapshot.totalReturnPct) : '—'} accent={snapshot && snapshot.totalReturnPct >= 0 ? 'good' : 'bad'} note="現在評価額 ÷ 初期投資額 - 1" />
              <PerfTile label="今日の変化" value={snapshot ? formatPct(snapshot.todayReturnPct) : '—'} accent={snapshot && (snapshot.todayReturnPct ?? 0) >= 0 ? 'good' : 'bad'} note="現在価格 ÷ 今日の始値ベース" />
              <PerfTile label="構成" value="BTC / ETH / SOL" note="34% / 33% / 33%" />
            </div>
            {error ? <p className="portfolio-error">{error}</p> : null}
          </div>
        </div>

        <h3 className="portfolio-table-title">保有数量と評価</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Allocation</th>
                <th>Quantity</th>
                <th>Entry / Preview</th>
                <th>Current</th>
                <th>Value</th>
                <th>P/L</th>
              </tr>
            </thead>
            <tbody>
              {snapshot ? snapshot.rows.map((row) => (
                <tr key={row.symbol}>
                  <td>{row.label} <span className="muted">{row.symbol}</span></td>
                  <td>{formatPct(row.allocationPct)}</td>
                  <td>{row.quantity.toFixed(row.quantity >= 1 ? 5 : 8)}</td>
                  <td>{formatUsd(row.entryPriceUsdt)}</td>
                  <td>{formatUsd(row.currentPriceUsdt)}</td>
                  <td>{formatJpy(row.valueJpy)}</td>
                  <td className={tone(row.pnlJpy)}>{row.pnlJpy >= 0 ? '+' : ''}{formatJpy(row.pnlJpy)}</td>
                </tr>
              )) : previewRows.map((row) => (
                <tr key={row.symbol}>
                  <td>{row.label} <span className="muted">{row.symbol}</span></td>
                  <td>{formatPct(row.allocationPct)}</td>
                  <td>{row.quantity ? row.quantity.toFixed(row.quantity >= 1 ? 5 : 8) : '—'}</td>
                  <td>追跡開始時の価格</td>
                  <td>{row.price ? formatUsd(row.price) : '—'}</td>
                  <td>{formatJpy(row.allocationJpy)}</td>
                  <td>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
