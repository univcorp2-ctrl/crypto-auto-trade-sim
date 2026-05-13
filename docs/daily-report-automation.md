# Daily report automation

毎日、リアルタイム価格と日足データを取得し、日次リターンをGitHub Issueへ投稿する自動レポートです。

## いつ実行されるか

`.github/workflows/daily-report.yml` は毎日 **09:10 JST** に実行されます。

GitHub ActionsのcronはUTC基準なので、設定は次の通りです。

```yaml
- cron: "10 0 * * *"
```

## どこに結果が出るか

実行後、GitHub Issueに以下のタイトルでレポートが作成または更新されます。

```text
Daily Crypto Return Report
```

また、同じIssueに当日のコメントも投稿されるため、履歴を追いやすくなります。

## 初期対象銘柄

```text
BTCUSDT,ETHUSDT,SOLUSDT
```

変更する場合は、GitHubリポジトリのVariablesに `DAILY_REPORT_SYMBOLS` を追加してください。

例:

```text
BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT
```

## 手動実行

GitHubのActionsタブから `Daily Crypto Return Report` を選び、`Run workflow` を押すと手動実行できます。

## Slack / Discord通知

GitHub Actions Secretに以下を追加すると、レポートをWebhookにも送信します。

```text
DAILY_REPORT_WEBHOOK_URL
```

Slack Incoming WebhookまたはDiscord WebhookのURLを入れてください。

## データソース

初期設定は Binance Spot の公開マーケットデータです。

```text
EXCHANGE_PROFILE=binance-spot
EXCHANGE_REST_BASE=https://api.binance.com
```

APIキーは不要です。発注は行いません。

## レポート項目

- Current Price
- Today Return
- vs Previous Close
- 7D Return
- 30D Return
- Today Open

## 実運用監視へ拡張する場合

この日次レポートは発注を行わない安全な監視機能です。実運用に近づける場合は、次の順序にしてください。

1. バックテスト
2. 日次レポートで相場監視
3. ペーパートレード
4. Binance Spot Testnet
5. 小額本番
6. 増額判断

発注処理を入れる場合でも、`TRADING_DRY_RUN=true` と `ENABLE_LIVE_TRADING=false` を初期値から変えないでください。
