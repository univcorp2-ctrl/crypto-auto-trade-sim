# Architecture

```mermaid
flowchart LR
  A[GitHub Actions schedule / manual] --> B[generate-real-results.mjs]
  B --> C{Secrets set?}
  C -->|Yes| D[Binance USER_DATA API]
  C -->|No| E[Binance public market data]
  D --> F[public/data/live-results.json]
  E --> F
  F --> G[build-production-dashboard.mjs]
  G --> H[dist/index.html]
  H --> I[GitHub Pages]
```

## Data modes

- `binance-real-account`: Binance Spot USER_DATA APIから実口座の残高と約定履歴を取得します。
- `real-market-backtest`: Binanceの実市場価格データでワイワイ自動売買戦略をバックテストします。架空の実口座成績は出しません。

## Security

API keyとsecretはGitHub Actions Secretsからのみ読みます。生成されるWebにはAPIキーを含めません。

## Outputs

- `/` dashboard
- `/data/live-results.json`
- `/data/trades.csv`
- `/data/trades.xls`
