# Performance dashboard

このドキュメントは、毎日「パフォーマンスがどうなっているか」を見える化するための仕様です。

## 目的

単なる価格リターンではなく、以下を毎日確認できるようにします。

- もし **1,000,000円** を投資していたら現在いくらか
- 損益はいくらか
- 総リターンは何%か
- 今日、前日終値比、7日、30日の変化はどうか
- 銘柄ごとの保有数量、評価額、損益はどうか

## 初期ポートフォリオ

`config/portfolio.json` に設定しています。

| Asset | Symbol | Allocation |
|---|---:|---:|
| Bitcoin | BTCUSDT | 34% |
| Ethereum | ETHUSDT | 33% |
| Solana | SOLUSDT | 33% |

初期投資額:

```text
1,000,000 JPY
```

初期費用想定:

```text
entryFeeBps=10
entrySlippageBps=5
```

## 毎日どこに表示されるか

GitHub Actionsが毎日 **09:20 JST** に実行され、GitHub Issueへ結果を投稿します。

```text
Portfolio Performance Tracker
```

Issue本文は最新スナップショットに更新され、コメントに日次履歴が残ります。

## Slack / Discord通知

GitHub Actions Secretに次を設定すると、同じ内容をWebhookへ送信します。

```text
PERFORMANCE_WEBHOOK_URL
```

## 手動実行

GitHub Actions画面で `Portfolio Performance Tracker` を選び、`Run workflow` から実行できます。

### 追跡をリセットする場合

`reset_state=true` を指定すると、その時点の価格で新しい100万円ポートフォリオを作り直します。

## 計算方法

初回実行時に、以下を計算してIssue本文へ埋め込みます。

```text
投資額JPY × 配分比率 = 銘柄別投資額JPY
銘柄別投資額JPY ÷ USDJPY = 銘柄別投資額USDT
実効購入価格 = 現在価格 × (1 + feeBps + slippageBps)
保有数量 = 銘柄別投資額USDT ÷ 実効購入価格
```

以後は、その保有数量を固定して評価します。

```text
現在評価額JPY = 保有数量 × 現在価格USDT × USDJPY
損益JPY = 現在評価額JPY - 初期投資額JPY
総リターン = 現在評価額JPY ÷ 初期投資額JPY - 1
```

## 注意点

- これは仮想ポートフォリオです。発注は行いません。
- USDT建て価格をUSD相当としてJPY換算します。
- FXはFrankfurterのUSD/JPYを使い、取得失敗時は `config/portfolio.json` のfallback値を使います。
- 実際の取引では、取引所手数料、スプレッド、約定拒否、最小注文数量、税金、出金手数料が影響します。

## 画面表示

Webアプリには `100万円 仮想ポートフォリオ` パネルを追加しています。

表示項目:

- 現在評価額
- 総損益
- 総リターン
- 今日の変化
- USDJPY
- 最終更新時刻
- 保有数量と銘柄別損益

ブラウザ側はlocalStorageで追跡状態を保存します。毎日確実に履歴を残す用途はGitHub Actions側を使います。
