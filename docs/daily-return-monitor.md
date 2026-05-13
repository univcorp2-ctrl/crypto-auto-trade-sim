# Daily Return Monitor

この機能は、ブラウザから公開マーケットデータを読み込み、現在価格と日足ベースのリターンを確認するための監視画面です。

## 画面で見られるもの

- 現在価格
- 今日の始値からのリターン
- 前日終値比
- 7日リターン
- 30日リターン
- 直近日足のOpen / Close / High / Low / Return
- 自動更新ON/OFF
- 更新間隔の変更

## データ取得

初期実装では Binance Spot の公開REST APIを使います。

- `GET /api/v3/ticker/price`
- `GET /api/v3/klines?interval=1d`

APIキーは不要です。これは価格確認用のマーケットデータ取得であり、発注機能ではありません。

## 注意点

ブラウザだけで動く実装なので、画面を開いている間だけ自動更新されます。毎日決まった時刻に記録を残したい場合は、バックエンドまたは定期ジョブが必要です。

推奨構成:

```text
cron / scheduler
  -> MarketDataProvider
  -> DailyReturnCalculator
  -> Database or object storage
  -> Dashboard API
  -> Web UI
```

## 実運用に近づける場合

1. 価格データ取得をサーバー側へ移す
2. 毎日UTC/JSTのどちらを基準にするか固定する
3. DBに日次スナップショットを保存する
4. 取得失敗時の再試行とアラートを入れる
5. 取引ロジックのシグナル、ポジション、損益と紐づける
6. 発注処理は別モジュールに分離し、`DRY_RUN=true` をデフォルトにする

## 将来の拡張

- WebSocketによるティック更新
- 複数銘柄の一覧監視
- 自分の売買シグナルと現在リターンの比較
- Slack/Discord通知
- GitHub Actions schedule またはCloudflare Workers Cronによる日次保存
