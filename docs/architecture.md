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
  C --> E[WAIWAI market simulation]
  D --> E
  E --> F[dist/index.html]
  E --> G[dist/data/live-results.json]
  E --> H[dist/data/trades.csv]
  E --> I[dist/data/trades.xls]
  F --> J[GitHub Pages]
```

The public dashboard is real market simulation mode. It uses real market candles, but it is not a private exchange account statement unless private account credentials are integrated separately.

The page includes user controls for chart range, asset filter, trade search, raw JSON, URL copy, reload, and data export.
