# Architecture

The production dashboard is built by `.github/workflows/production-pages.yml` and `scripts/prod-verified.mjs`.

```mermaid
flowchart TD
  A[Push or scheduled workflow] --> B[Node prod-verified.mjs]
  B --> C[Coinbase Exchange daily candles]
  B --> D[Frankfurter USD JPY rate]
  C --> E[WAIWAI strategy calculation]
  D --> E
  E --> F[dist/data/live-results.json]
  E --> G[dist/data/trades.csv and trades.xls]
  E --> H[dist/index.html]
  H --> I[GitHub Pages]
```

## Data proof

The dashboard and JSON include `dataProvenance`. It shows source, product, candle row count, first date, last date, and last close for BTC, ETH, and SOL.

## User controls

The page supports chart range buttons, asset filter buttons, trade search, buy or sell filtering, raw JSON modal, URL copy, reload, and JSON CSV Excel downloads.
