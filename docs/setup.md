# Production Setup

## URL

```text
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/
```

## 実口座モードを有効化

GitHub repoの Settings -> Secrets and variables -> Actions で次を追加します。

```text
BINANCE_API_KEY
BINANCE_API_SECRET
```

Binance API KeyはUSER_DATAの読み取り用途だけにしてください。出金権限は付けないでください。

追加後、Actions -> Production Real Data Dashboard -> Run workflow を実行します。

## Secretsなしの場合

Binance公開市場データを使った `real-market-backtest` として公開されます。これは本物の市場価格を使ったバックテストであり、実口座の約定結果ではありません。
