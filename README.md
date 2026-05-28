# Crypto Auto Trade Simulator

公開Webアプリ:

```text
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/
```

BTC / ETH / SOL の仮想ポートフォリオを表示するGitHub Pages Webアプリです。発注は行わず、ドライランの評価額、損益、リターン、最大ドローダウン、リスクスコア、売買シグナルを表示します。

## Run

```bash
npm install
npm run generate:dashboard
npm run dev
```

## Build / Test

```bash
npm run lint
npm test
npm run build
```

## Deploy

`.github/workflows/pages-dashboard.yml` が `main` push、手動実行、毎日09:30 JSTでGitHub Pagesにデプロイします。
