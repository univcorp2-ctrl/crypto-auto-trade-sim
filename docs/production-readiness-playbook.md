# Production readiness playbook

この文書は、本番実装に進む前の準備工程をサブエージェント別に整理したものです。

## 前提

現時点のプロジェクトは以下の段階です。

```text
バックテスト + 仮想ポートフォリオ監視 + 日次レポート
```

本番発注はまだ有効化しません。

```text
TRADING_DRY_RUN=true
ENABLE_LIVE_TRADING=false
EXECUTION_PROFILE=binance-spot-testnet
```

## Agent 1: Strategy Validation Agent

目的: 売買ロジックに本当に期待値があるか確認する。

### タスク

- 複数年のOHLCVを取得する
- 上昇相場、下落相場、レンジ相場でバックテストする
- 手数料とスリッページを保守的に入れる
- パラメータ最適化をやりすぎない
- walk-forward analysisを行う
- 直近だけ勝っていないか確認する

### 合格条件

- 手数料込みでProfit Factorが1.2以上
- 最大ドローダウンが許容範囲内
- 取引回数が十分にある
- 1銘柄・1期間だけに依存していない

## Agent 2: Performance Monitoring Agent

目的: 100万円を入れていた場合の評価額を毎日確認する。

### 実装済み

- GitHub Actionsで毎日09:20 JSTに実行
- `Portfolio Performance Tracker` Issueへ投稿
- 初期投資額1,000,000円
- BTC/ETH/SOLの分散ポートフォリオ
- JPY評価額、損益、リターンを表示
- Slack/Discord Webhook通知に対応

### ユーザー準備

- PRをmainへマージする
- GitHub Actionsが有効になっていることを確認する
- 必要なら `PERFORMANCE_WEBHOOK_URL` をSecretに登録する
- 初期投資額や銘柄配分を変える場合は `config/portfolio.json` を編集する

## Agent 3: Exchange Integration Agent

目的: 取引所APIと安全に接続する。

### 初期採用

| 用途 | 取引所 |
|---|---|
| 価格取得 | Binance Spot public market data |
| 発注検証 | Binance Spot Testnet |
| 本番候補 | Binance Spot |

### ユーザー準備

- Binance口座を作成する
- 本人確認を済ませる
- APIキーを作成する
- 出金権限は必ずOFFにする
- 可能ならIP制限を設定する
- 最初はTestnet APIキーを使う
- APIキーはGitHub Secretまたはサーバー側Secret Managerへ保存する

### 必須確認

- `exchangeInfo` で最小注文数量を確認
- `stepSize`, `tickSize`, `minNotional` を注文前に検証
- 残高不足、注文拒否、通信断、API制限時の挙動を確認
- WebSocket切断時の再接続を実装

## Agent 4: Risk Management Agent

目的: 損失を限定し、異常時に止める。

### 必須リスク制限

- 1注文の最大金額
- 1銘柄の最大建玉
- 1日の最大損失
- 連敗数上限
- API失敗回数上限
- 最大ドローダウン停止
- 急変時の新規注文停止
- 手動kill switch

### 初期値案

```text
MAX_ORDER_USD=25
MAX_POSITION_USD=100
MAX_DAILY_LOSS_PCT=0.02
MAX_CONSECUTIVE_LOSSES=3
MAX_API_FAILURES=5
```

## Agent 5: Operations Agent

目的: 運用中の監視、障害対応、ログ管理を整える。

### 必須ログ

- シグナル生成時刻
- 発注意図
- リスクチェック結果
- 注文ID
- 約定価格
- 約定数量
- 手数料
- エラー
- kill switch発動理由

### アラート

- 日次損失が上限の50%に到達
- API失敗が連続発生
- WebSocketが切断された
- 注文が未約定のまま一定時間経過
- 実ポジションと内部状態が不一致

## Agent 6: User Preparation Agent

目的: ユーザー側で事前に準備するものを明確にする。

### 必要なもの

- GitHubリポジトリの管理権限
- GitHub Actions有効化
- Binanceアカウント
- Binance Spot Testnet利用準備
- SlackまたはDiscord Webhook URL 任意
- 運用する資金の上限
- 許容できる最大損失額
- 税務記録の保存方針

### 決めること

- 最初の仮想投資額
- 対象銘柄
- 銘柄配分
- 運用時間軸
- 最大ドローダウン許容値
- いつ停止するか
- いつ増額するか

## 本番化ロードマップ

### Phase 0: 現在

- バックテスト
- 日次価格レポート
- 100万円仮想ポートフォリオ監視

### Phase 1: Paper Trading

- 実価格でシグナルだけ生成
- 発注はしない
- 仮想注文と仮想約定を記録
- 30〜90日確認

### Phase 2: Testnet Trading

- Binance Spot Testnetに接続
- APIキーはTestnet用
- 発注、取消、残高取得、注文拒否を確認
- 監査ログを確認

### Phase 3: Small Live Trading

- 本番APIキーを設定
- 出金権限OFF
- 小額のみ
- `ENABLE_LIVE_TRADING=true` は手動承認後
- kill switchを有効化

### Phase 4: Scale Decision

- 100トレード以上の実績
- 最大DDが許容内
- バックテストと実績の乖離が小さい
- 障害時の停止と復旧が確認済み

## Go / No-Go checklist

本番化する前に、以下がすべてYESである必要があります。

- [ ] 30〜90日以上のペーパートレード結果がある
- [ ] Testnetで発注・取消・失敗処理を確認した
- [ ] APIキーの出金権限がOFF
- [ ] APIキーがブラウザに露出していない
- [ ] 日次損失停止がある
- [ ] 連敗停止がある
- [ ] 手動kill switchがある
- [ ] 監査ログが残る
- [ ] 税務用の取引履歴が保存される
- [ ] 最初の投入額が失っても許容できる金額である

## 結論

次に進むべき作業は、PRをmainへマージし、GitHub Actionsで毎日100万円仮想ポートフォリオの成績を見える化することです。その後、最低でも30日分のレポートを見て、シグナルの有効性と価格変動への耐性を確認してからペーパートレードへ進みます。
