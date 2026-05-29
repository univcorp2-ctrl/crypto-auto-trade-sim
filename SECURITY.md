# Security Policy

- `BINANCE_API_KEY` と `BINANCE_API_SECRET` はGitHub Actions Secretsにのみ保存します。
- Webフロントエンドや `public/data` にはAPIキーを出力しません。
- Binance API keyには出金権限を付けないでください。
- 可能であればIP制限を有効化してください。
- 不審な挙動があればAPI keyを即時失効してください。
