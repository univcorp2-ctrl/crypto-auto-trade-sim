# Crypto Auto Trade Simulator

本番URL:

```text
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/
```

`Crypto Auto Trade Simulator` は、ワイワイ自動売買の結果をWebで確認するための本番ダッシュボードです。

## 表示モード

1. `binance-real-account`
   - GitHub Actions Secrets に `BINANCE_API_KEY` と `BINANCE_API_SECRET` が設定されている場合
   - Binance Spot の実口座残高と約定履歴を USER_DATA API で取得
   - APIキーはGitHub Actions内だけで使い、Webには出しません

2. `real-market-backtest`
   - Secrets未設定または実口座APIが失敗した場合
   - Binanceの実市場価格データを使い、ワイワイ自動売買戦略をバックテスト
   - 架空の口座成績は表示しません

## 本番データURL

```text
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/data/live-results.json
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/data/trades.csv
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/data/trades.xls
```

## Secrets

実口座結果を表示するには、GitHub repository secrets に次を設定します。

| Secret | Purpose |
| --- | --- |
| `BINANCE_API_KEY` | Binance API key。USER_DATA権限のみ推奨 |
| `BINANCE_API_SECRET` | Binance API secret |

推奨設定:

- 読み取り専用またはUSER_DATAのみ
- 出金権限は絶対に付けない
- 可能ならIP制限
- 不審な挙動があれば即時APIキー失効

## Local

```bash
npm install
npm run generate:real
npm test
npm run build
npm run dev
```

## Deploy

`.github/workflows/pages-dashboard.yml` が以下で動きます。

- main push
- 手動実行
- 30分ごとのschedule

## 注意

これは投資助言ではありません。実口座モードは取引結果の可視化であり、自動発注は行いません。
