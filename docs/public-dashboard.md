# Public performance dashboard

このプロジェクトは、GitHub Pagesで公開される1画面ダッシュボードを持ちます。

## 公開URL

```text
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/
```

## 何が見えるか

- 100万円を投資していた場合の現在評価額
- 総損益
- 総リターン
- 今日の変化
- 前日終値比
- 7日リターン
- 30日リターン
- BTC / ETH / SOL の保有数量
- 銘柄別の評価額、損益、リターン
- 評価額推移チャート
- 最終更新日時
- データソース

## 自動更新

`.github/workflows/pages-dashboard.yml` が毎日 **09:30 JST** に実行されます。

処理の流れ:

```text
GitHub Actions schedule
  -> Binance Spot public market dataから価格取得
  -> FrankfurterからUSD/JPY取得
  -> 100万円ポートフォリオを評価
  -> public/data/performance.json を生成
  -> Viteで静的サイトをビルド
  -> GitHub Pagesへデプロイ
  -> Portfolio Performance Tracker Issueへ同内容を投稿
```

## データファイル

画面は次のJSONを読み込みます。

```text
/data/performance.json
```

ビルド時に `scripts/generate-dashboard-data.mjs` が生成します。

## 初期ポートフォリオ

`config/portfolio.json` で管理します。

| Asset | Symbol | Allocation |
|---|---:|---:|
| Bitcoin | BTCUSDT | 34% |
| Ethereum | ETHUSDT | 33% |
| Solana | SOLUSDT | 33% |

初期投資額は `1,000,000 JPY` です。

## 追跡リセット

GitHub Actionsの `Public Performance Dashboard` を手動実行し、`reset_state=true` を指定すると、その時点の価格で新しい仮想ポートフォリオを開始します。

## 通知

GitHub Actions Secretに `PERFORMANCE_WEBHOOK_URL` を設定すると、SlackまたはDiscord Webhookに同じサマリを送ります。

## 注意

これは仮想ポートフォリオです。発注は行いません。本番売買に進む場合は、ペーパートレード、Testnet、リスク制限、監査ログを先に実装してください。
