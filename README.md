# Crypto Auto Trade Simulator

公開Webアプリ:

```text
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/
```

BTC / ETH / SOL の仮想ポートフォリオを表示するGitHub Pages Webアプリです。`scripts/build-static-site.mjs` が `dist/index.html` を生成し、GitHub Pagesへデプロイします。

## Run

```bash
npm install
npm run generate:dashboard
npm run build
npm run dev
```

## Deploy

`.github/workflows/pages-dashboard.yml` が `main` push、手動実行、毎日09:30 JSTでGitHub Pagesにデプロイします。
