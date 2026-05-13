# Exchange setup

## 採用する取引所設定

このプロジェクトでは、初期設定を次のようにします。

| 用途 | 設定 |
|---|---|
| 毎日の価格・リターン取得 | Binance Spot public market data |
| 実運用前の発注検証 | Binance Spot Testnet |
| 本番候補 | Binance Spot |

## なぜBinance系を初期候補にするか

- Spot REST APIとWebSocketの公式ドキュメントが整っている
- 公開マーケットデータはAPIキーなしで取得できる
- Spot Testnetで本番前に発注テストができる
- `exchangeInfo` で銘柄ごとの注文制約を確認できる
- API制限や注文制限が明文化されている

ただし、居住地、本人確認、利用規約、対象銘柄、API権限はユーザーの口座状態によって変わります。実運用前に必ず自分のアカウントで使えるサービスを確認してください。

## 初期プロファイル

`config/exchange.json` と `src/live/exchangeConfig.ts` に以下を設定済みです。

```text
市場データ: binance-spot
発注検証: binance-spot-testnet
本番候補: binance-spot
```

## 安全な初期値

```text
TRADING_DRY_RUN=true
ENABLE_LIVE_TRADING=false
EXECUTION_PROFILE=binance-spot-testnet
MAX_ORDER_USD=25
MAX_POSITION_USD=100
MAX_DAILY_LOSS_PCT=0.02
MAX_CONSECUTIVE_LOSSES=3
MAX_API_FAILURES=5
```

この状態では、本番発注はできない設計です。

## APIキー

APIキーはフロントエンドに置かないでください。必ずサーバー側またはGitHub Actions Secret、クラウドのSecret Managerに保存します。

```text
BINANCE_API_KEY
BINANCE_API_SECRET
```

APIキーでは、最初は出金権限を無効化し、可能ならIP制限を有効化してください。

## 本番切替の条件

以下を満たすまで `ENABLE_LIVE_TRADING=true` にしないでください。

- バックテストで手数料・スリッページ込みで期待値がプラス
- レンジ相場、急落相場、上昇相場で破綻していない
- ペーパートレードで30〜90日確認済み
- Testnetで発注、取消、残高取得、注文失敗、再試行が確認済み
- `exchangeInfo` の最小注文数量、tickSize、stepSize、notional制約を注文前に検証済み
- 1日損失、連敗数、API失敗回数で強制停止できる
- すべての注文意図、発注結果、約定、エラーが監査ログに残る

## 代替候補

将来、地域や口座条件によってBinanceが使いにくい場合は、同じインターフェースで以下へ差し替える想定です。

- Coinbase Advanced Trade
- Kraken
- bitFlyer
- GMOコイン

ただし、注文仕様、対応銘柄、API制限、手数料、税務データの取りやすさが違うため、交換所ごとにAdapterを分けます。
