# Architecture

Current production entrypoint:

```text
.github/workflows/production-pages.yml -> node scripts/prod-optimizer.mjs -> dist -> GitHub Pages
```

```mermaid
flowchart TD
  A[Production Pages workflow] --> B[prod-optimizer.mjs]
  B --> C[Coinbase Exchange daily candles]
  B --> D[Frankfurter USD JPY]
  C --> E[Generate strategy candidates]
  D --> E
  E --> F[Backtest WAIWAI candidates]
  F --> G{Any positive candidate?}
  G -->|Yes| H[Select highest score positive strategy]
  G -->|No| I[Capital preservation fallback]
  H --> J[Dashboard and data exports]
  I --> J
  J --> K[GitHub Pages]
```

The optimizer searches multiple lookback, moving-average, max-position, and rebalance-threshold settings. It selects a positive strategy when one exists in the tested real-market period. This is still a real-market simulation, not a private account statement.
