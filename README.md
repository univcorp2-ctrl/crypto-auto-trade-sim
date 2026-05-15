# Crypto Auto Trade Simulator

暗号資産の自動売買ロジックを検証するためのWebダッシュボードです。

## 公開ダッシュボード

URL:

```text
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/
```

このURLを開くと、100万円をBTC / ETH / SOLに分散していた場合の現在評価額、損益、リターンを確認できます。

## 毎日の自動更新

GitHub Actionsで毎日 **09:30 JST** に以下を自動実行します。

```text
価格取得
  -> 100万円仮想ポートフォリオ評価
  -> public/data/performance.json 生成
  -> Vite build
  -> GitHub Pagesへデプロイ
  -> GitHub Issueへ履歴保存
```

GitHub Issueにも同じ内容を残します。

```text
Portfolio Performance Tracker
```

## 初期ポートフォリオ

| Asset | Symbol | Allocation |
|---|---:|---:|
| Bitcoin | BTCUSDT | 34% |
| Ethereum | ETHUSDT | 33% |
| Solana | SOLUSDT | 33% |

初期投資額:

```text
1,000,000 JPY
```

## 画面で見えるもの

- 現在評価額
- 総損益
- 総リターン
- 今日の変化
- 前日終値比
- 7日リターン
- 30日リターン
- 評価額推移チャート
- 銘柄別の保有数量
- 銘柄別の評価額、損益、リターン
- 最終更新日時
- データソース

## 取引所設定

初期設定は次の通りです。

| 用途 | 設定 |
|---|---|
| 価格取得 | Binance Spot public market data |
| 発注検証 | Binance Spot Testnet |
| 本番候補 | Binance Spot |

本番発注はまだ無効です。

```text
TRADING_DRY_RUN=true
ENABLE_LIVE_TRADING=false
EXECUTION_PROFILE=binance-spot-testnet
```

## 通知

SlackまたはDiscordに同じサマリを送りたい場合は、GitHub Actions Secretに以下を設定してください。

```text
PERFORMANCE_WEBHOOK_URL
```

## 手元で実行

```bash
npm install
npm run generate:dashboard
npm run dev
```

ビルド:

```bash
npm run build
```

テスト:

```bash
npm test
```

## ドキュメント

- `docs/public-dashboard.md`
- `docs/production-readiness-playbook.md`

## 注意

これは投資助言ではありません。暗号資産は価格変動が大きく、元本を失う可能性があります。このダッシュボードは仮想ポートフォリオの監視であり、発注は行いません。
