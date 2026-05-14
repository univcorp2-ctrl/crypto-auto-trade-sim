# Crypto Auto Trade Simulator

暗号資産の自動売買ロジックを検証するための Web シミュレーターです。

実運用を急がず、次の順番で進めることを前提に設計しています。

1. **バックテスト**: 手元のOHLCVまたはサンプルデータでロジック検証
2. **100万円仮想ポートフォリオ監視**: 毎日、実際に投資していたらどうなったかを確認
3. **ペーパートレード**: 取引所テストネットまたは発注なしのリアルタイム検証
4. **小額実運用**: 最大損失、注文サイズ、停止条件を固定して運用
5. **増額判断**: 十分な期間・十分な約定数で統計的に確認してから増額

> 注意: これは投資助言ではありません。暗号資産は価格変動が大きく、元本を失う可能性があります。実運用前に必ずご自身で検証してください。

## 100万円 仮想ポートフォリオ監視

毎日 **09:20 JST** にGitHub Actionsが実行され、以下のIssueへパフォーマンスを投稿します。

```text
Portfolio Performance Tracker
```

初期設定:

| Asset | Symbol | Allocation |
|---|---:|---:|
| Bitcoin | BTCUSDT | 34% |
| Ethereum | ETHUSDT | 33% |
| Solana | SOLUSDT | 33% |

初期投資額:

```text
1,000,000 JPY
```

レポート内容:

- 現在評価額
- 総損益
- 総リターン
- 今日の変化
- 前日終値比
- 7日リターン
- 30日リターン
- 銘柄別の保有数量、評価額、損益

Slack / Discordへ通知したい場合は、GitHub Actions Secretに以下を設定してください。

```text
PERFORMANCE_WEBHOOK_URL
```

詳細は `docs/performance-dashboard.md` を参照してください。

## 取引所設定

初期設定は次の通りです。

| 用途 | 設定 |
|---|---|
| 毎日の価格・リターン取得 | Binance Spot public market data |
| 実運用前の発注検証 | Binance Spot Testnet |
| 本番候補 | Binance Spot |

安全のため、発注関連の初期値は以下にします。

```text
TRADING_DRY_RUN=true
ENABLE_LIVE_TRADING=false
EXECUTION_PROFILE=binance-spot-testnet
```

## 売買ロジック

初期実装は **トレンド追随 + ボラティリティ調整型リスク管理** です。

### エントリー

ロングのみです。

- 短期EMAが長期EMAを上回る
- 終値が短期EMAより上
- RSIが過熱しすぎていない
- EMA差が一定以上あり、横ばい相場の騙しを減らす
- 最大ドローダウン停止にかかっていない

### イグジット

- ATRベースの初期ストップ
- ATRベースのトレーリングストップ
- ATRベースの利確ライン
- 長期EMA割れ
- 最大ドローダウン超過時は新規停止

### 資金管理

1トレードあたりのリスクを口座残高の一定割合に制限します。

```text
リスク許容額 = 口座残高 × riskPerTrade
ストップ幅 = ATR × atrStopMultiplier
リスク基準数量 = リスク許容額 ÷ ストップ幅
最大建玉数量 = 口座残高 × maxPositionPct ÷ 価格
実際の数量 = min(リスク基準数量, 最大建玉数量)
```

## 実運用に載せる前の合格基準例

最低限、以下を満たすまで本番発注はしない想定です。

- バックテスト対象期間が上昇相場・下落相場・レンジ相場を含む
- 手数料とスリッページを保守的に入れてもプラス
- 最大ドローダウンが許容範囲内
- 取引回数が十分にある
- ペーパートレードで 30〜90日程度、バックテストと極端に乖離しない
- API障害、注文失敗、通信断、急変時の停止条件を実装済み

本番実装の準備工程は `docs/production-readiness-playbook.md` にまとめています。

## セットアップ

```bash
npm install
npm run dev
```

テスト:

```bash
npm test
```

100万円仮想ポートフォリオレポートを手元で実行:

```bash
npm run portfolio:report
```

ビルド:

```bash
npm run build
```

## CSV入力形式

`timestamp,open,high,low,close,volume` の6列です。ヘッダーあり・なし両方に対応します。

```csv
2025-01-01T00:00:00Z,95000,96000,94000,95500,1234
2025-01-02T00:00:00Z,95500,97000,95000,96500,1500
```

## 実運用移行アーキテクチャ

`src/live` に、実取引へ拡張するためのインターフェースを置いています。

```text
MarketDataProvider
  ↓ OHLCV / ticker
StrategyEngine
  ↓ target position / order intent
RiskManager
  ↓ approved order or reject
ExecutionAdapter
  ↓ exchange testnet / live
PositionStore + AuditLog
```

実運用では以下を必須にします。

- APIキーは環境変数またはシークレット管理に保存し、ブラウザへ渡さない
- 注文処理は必ずサーバー側で実行する
- 取引所テストネットで先に検証する
- `DRY_RUN=true` をデフォルトにする
- 1日損失、連敗数、最大建玉、最大注文額、API失敗回数で強制停止
- 発注前に価格乖離・流動性・最小注文数量をチェックする
- すべてのシグナル、注文、約定、エラーを監査ログに保存する

## 今後の拡張候補

- 複数取引所Adapter
- walk-forward analysis
- パラメータ最適化と過学習チェック
- 複数銘柄ポートフォリオ
- ショート対応
- Slack/Discord通知
- Docker化
- サーバーサイド発注API
