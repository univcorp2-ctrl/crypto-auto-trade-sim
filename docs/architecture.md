# Architecture

Current production entrypoint:

```text
.github/workflows/production-pages.yml -> node scripts/prod-final.mjs -> dist -> GitHub Pages
```

```mermaid
flowchart TD
  A[Production Pages workflow] --> B[prod-final.mjs]
  B --> C[Coinbase Exchange daily candles]
  B --> D[Frankfurter USD JPY]
  C --> E[WAIWAI daily rebalance simulation]
  D --> E
  E --> F[Today / month-to-date / cumulative performance]
  E --> G[Historical BUY and SELL trades]
  F --> H[dist/index.html]
  G --> I[dist/data/live-results.json]
  G --> J[dist/data/trades.csv]
  G --> K[dist/data/trades.xls]
  H --> L[GitHub Pages]
```

The public dashboard is real-market simulation mode. It uses real market candles, but it is not a private exchange account statement unless private account credentials are integrated separately.

The page includes user controls for chart range, asset filter, buy/sell filter, trade search, raw JSON, URL copy, reload, and data export.
