import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BinanceSymbol,
  calculateDailyReturnStats,
  fetchDailyKlines,
  fetchTickerPrice,
  supportedSymbols
} from '../lib/marketData';
import { formatCurrency, formatPercent } from '../lib/format';

function percentTone(value: number | null): string {
  if (value === null) return '';
  return value >= 0 ? 'good' : 'bad';
}

function percentLabel(value: number | null): string {
  return value === null ? '—' : formatPercent(value);
}

function ReturnTile({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <div className="live-return-tile">
      <span>{label}</span>
      <strong className={percentTone(value)}>{percentLabel(value)}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

export default function LiveReturnMonitor() {
  const [symbol, setSymbol] = useState<BinanceSymbol>('BTCUSDT');
  const [price, setPrice] = useState<number | null>(null);
  const [klines, setKlines] = useState<Awaited<ReturnType<typeof fetchDailyKlines>>>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshSec, setRefreshSec] = useState(60);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (price === null || klines.length === 0) return null;
    return calculateDailyReturnStats(price, klines);
  }, [price, klines]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [latestPrice, dailyKlines] = await Promise.all([
        fetchTickerPrice(symbol),
        fetchDailyKlines(symbol, 40)
      ]);
      setPrice(latestPrice);
      setKlines(dailyKlines);
      setLastUpdated(new Date());
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '価格データの取得に失敗しました。';
      setError(`${message} ネットワーク、CORS、地域制限、API制限を確認してください。`);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      void loadData();
    }, refreshSec * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadData, refreshSec]);

  const rows = stats?.dailyRows.slice(-10).reverse() ?? [];

  return (
    <section className="panel live-monitor-panel">
      <style>{`
        .live-monitor-panel { overflow: hidden; position: relative; }
        .live-monitor-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at top right, rgba(34, 211, 238, .12), transparent 28rem);
        }
        .live-monitor-content { position: relative; z-index: 1; }
        .live-toolbar {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
        }
        .live-title-block h2 { margin-bottom: 6px; }
        .live-title-block p { margin: 0; color: #91a0bd; line-height: 1.6; }
        .live-controls {
          display: grid;
          grid-template-columns: 150px 120px auto auto;
          gap: 10px;
          align-items: end;
        }
        .live-control label { display: flex; flex-direction: column; gap: 7px; color: #98a8c8; font-size: .82rem; }
        .live-control select, .live-control input {
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(8, 17, 31, 0.86);
          color: #f8fafc;
          border-radius: 14px;
          padding: 10px 12px;
          outline: none;
        }
        .live-check {
          height: 42px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #b6c1d8;
          white-space: nowrap;
        }
        .live-button {
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
        .live-button:disabled { opacity: .62; cursor: wait; }
        .live-grid {
          display: grid;
          grid-template-columns: minmax(280px, .8fr) minmax(0, 1.2fr);
          gap: 18px;
        }
        .live-price-card, .live-return-tile {
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(8, 17, 31, 0.58);
          border-radius: 24px;
          padding: 18px;
        }
        .live-price-card span, .live-return-tile span { color: #98a8c8; font-size: .88rem; }
        .live-price-card strong {
          display: block;
          margin-top: 8px;
          font-size: clamp(2rem, 5vw, 3.6rem);
          letter-spacing: -.06em;
        }
        .live-meta { display: grid; gap: 8px; margin-top: 18px; color: #91a0bd; font-size: .92rem; }
        .live-dot { display: inline-block; width: 9px; height: 9px; margin-right: 7px; border-radius: 999px; background: #22c55e; box-shadow: 0 0 18px rgba(34, 197, 94, .9); }
        .live-return-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .live-return-tile strong { display: block; margin-top: 8px; font-size: 1.65rem; letter-spacing: -.04em; }
        .live-return-tile small { display: block; margin-top: 6px; color: #7483a3; line-height: 1.4; }
        .live-error { margin: 14px 0 0; color: #fecdd3; background: rgba(244, 63, 94, .11); border: 1px solid rgba(251, 113, 133, .24); border-radius: 16px; padding: 12px 14px; }
        .live-table-title { margin: 18px 0 10px; color: #cbd5e1; font-weight: 800; }
        @media (max-width: 1050px) {
          .live-toolbar { align-items: flex-start; flex-direction: column; }
          .live-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
          .live-grid { grid-template-columns: 1fr; }
          .live-return-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 620px) {
          .live-controls, .live-return-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div className="live-monitor-content">
        <div className="live-toolbar">
          <div className="live-title-block">
            <h2>Daily Return Monitor</h2>
            <p>公開マーケットデータから現在価格と日足を読み込み、今日・7日・30日のリターンを確認します。</p>
          </div>
          <div className="live-controls">
            <div className="live-control">
              <label>
                銘柄
                <select value={symbol} onChange={(event) => setSymbol(event.target.value as BinanceSymbol)}>
                  {supportedSymbols.map((item) => (
                    <option value={item} key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="live-control">
              <label>
                更新秒
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={refreshSec}
                  onChange={(event) => setRefreshSec(Math.max(15, Number(event.target.value) || 60))}
                />
              </label>
            </div>
            <label className="live-check">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
              自動更新
            </label>
            <button className="live-button" type="button" onClick={() => void loadData()} disabled={loading}>
              {loading ? '取得中' : '今すぐ更新'}
            </button>
          </div>
        </div>

        <div className="live-grid">
          <div className="live-price-card">
            <span>現在価格</span>
            <strong>{price === null ? '—' : formatCurrency(price)}</strong>
            <div className="live-meta">
              <div><span className="live-dot" />{autoRefresh ? 'Auto refresh ON' : 'Manual refresh'}</div>
              <div>最終更新: {lastUpdated ? lastUpdated.toLocaleString('ja-JP') : '未取得'}</div>
              <div>今日の始値: {stats ? formatCurrency(stats.todayOpen) : '—'}</div>
            </div>
          </div>

          <div>
            <div className="live-return-grid">
              <ReturnTile label="今日のリターン" value={stats?.todayReturn ?? null} note="現在価格 ÷ 今日の始値 - 1" />
              <ReturnTile label="前日終値比" value={stats?.previousCloseReturn ?? null} note="現在価格 ÷ 前日終値 - 1" />
              <ReturnTile label="7日リターン" value={stats?.sevenDayReturn ?? null} note="現在価格 ÷ 7日前終値 - 1" />
              <ReturnTile label="30日リターン" value={stats?.thirtyDayReturn ?? null} note="現在価格 ÷ 30日前終値 - 1" />
            </div>

            {error ? <p className="live-error">{error}</p> : null}

            <h3 className="live-table-title">直近日足リターン</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>Open</th>
                    <th>Close / Current</th>
                    <th>High</th>
                    <th>Low</th>
                    <th>Return</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={6} className="muted">データ取得後に表示されます。</td></tr>
                  ) : rows.map((row) => (
                    <tr key={row.date}>
                      <td>{row.date}</td>
                      <td>{formatCurrency(row.open)}</td>
                      <td>{formatCurrency(row.close)}</td>
                      <td>{formatCurrency(row.high)}</td>
                      <td>{formatCurrency(row.low)}</td>
                      <td className={percentTone(row.returnPct)}>{formatPercent(row.returnPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
