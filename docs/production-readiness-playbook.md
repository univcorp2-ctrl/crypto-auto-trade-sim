# Production readiness playbook

本番実装へ進むための準備工程を、サブエージェント別に整理します。

## 現在の到達点

```text
公開ダッシュボード + 毎日自動更新 + 100万円仮想ポートフォリオ監視
```

本番発注はまだ無効です。

```text
TRADING_DRY_RUN=true
ENABLE_LIVE_TRADING=false
EXECUTION_PROFILE=binance-spot-testnet
```

## Agent 1: Performance Dashboard Agent

目的: 毎日、指示なしでパフォーマンスを見える化する。

実装済み:

- GitHub Pages公開URL
- 毎日09:30 JSTに自動更新
- 100万円仮想ポートフォリオ
- BTC 34% / ETH 33% / SOL 33%
- 現在評価額、損益、総リターン、今日、前日比、7日、30日
- `Portfolio Performance Tracker` Issueへの履歴保存
- Slack / Discord Webhook任意通知

ユーザー準備:

- GitHub PagesがActionsデプロイで使える状態にする
- 必要なら `PERFORMANCE_WEBHOOK_URL` をSecretに設定する
- 初期投資額や配分を変える場合は `config/portfolio.json` を編集する

## Agent 2: Strategy Validation Agent

目的: 売買ロジックに期待値があるか検証する。

タスク:

- 複数年のOHLCVを取得する
- 上昇、下落、レンジでバックテストする
- 手数料とスリッページを保守的に入れる
- パラメータ過剰最適化を避ける
- walk-forward analysisを行う
- 期間を変えても崩れないか確認する

合格条件:

- Profit Factorが1.2以上
- 最大ドローダウンが許容内
- 取引回数が十分
- 1銘柄・1期間だけに依存しない

## Agent 3: Exchange Integration Agent

目的: 取引所APIに安全に接続する。

初期採用:

| 用途 | 取引所 |
|---|---|
| 価格取得 | Binance Spot public market data |
| 発注検証 | Binance Spot Testnet |
| 本番候補 | Binance Spot |

ユーザー準備:

- Binance口座を作成する
- 本人確認を済ませる
- Spot Testnetを使えるようにする
- APIキーを作成する
- 出金権限はOFF
- 可能ならIP制限をON
- APIキーはGitHub Secretまたはサーバー側Secret Managerへ保存する

## Agent 4: Risk Management Agent

目的: 損失を限定し、異常時に止める。

必須制限:

- 1注文の最大金額
- 1銘柄の最大建玉
- 1日の最大損失
- 最大ドローダウン
- 連敗数上限
- API失敗回数上限
- 手動kill switch
- 急変時の新規注文停止

初期値案:

```text
MAX_ORDER_USD=25
MAX_POSITION_USD=100
MAX_DAILY_LOSS_PCT=0.02
MAX_CONSECUTIVE_LOSSES=3
MAX_API_FAILURES=5
```

## Agent 5: Operations Agent

目的: 障害対応、監視、ログ管理を整える。

必須ログ:

- シグナル生成時刻
- 発注意図
- リスクチェック結果
- 注文ID
- 約定価格
- 約定数量
- 手数料
- エラー
- kill switch発動理由

アラート:

- 日次損失が上限の50%に到達
- API失敗が連続発生
- WebSocket切断
- 注文が未約定のまま一定時間経過
- 実ポジションと内部状態が不一致

## Agent 6: User Preparation Agent

ユーザー側で準備するもの:

- GitHubリポジトリ管理権限
- GitHub Actions有効化
- Binanceアカウント
- Spot Testnet利用準備
- SlackまたはDiscord Webhook URL 任意
- 運用資金の上限
- 許容最大損失額
- 税務記録の保存方針

決めること:

- 最初の仮想投資額
- 対象銘柄
- 銘柄配分
- 運用時間軸
- 最大ドローダウン許容値
- 停止条件
- 増額条件

## 本番化ロードマップ

### Phase 0: Dashboard Monitoring

- 公開ダッシュボードで毎日見る
- 30日以上、値動きと損益を確認する

### Phase 1: Paper Trading

- 実価格でシグナルだけ生成
- 発注はしない
- 仮想注文と仮想約定を記録する

### Phase 2: Testnet Trading

- Binance Spot Testnetへ接続
- 発注、取消、残高取得、注文拒否を確認する

### Phase 3: Small Live Trading

- 本番APIキーを設定
- 出金権限OFF
- 小額のみ
- `ENABLE_LIVE_TRADING=true` は手動承認後

### Phase 4: Scale Decision

- 100トレード以上の実績
- 最大DDが許容内
- バックテストと実績の乖離が小さい
- 障害時の停止と復旧が確認済み

## Go / No-Go checklist

- [ ] 30日以上ダッシュボードで監視した
- [ ] 30〜90日以上のペーパートレード結果がある
- [ ] Testnetで発注・取消・失敗処理を確認した
- [ ] APIキーの出金権限がOFF
- [ ] APIキーがブラウザに露出していない
- [ ] 日次損失停止がある
- [ ] 連敗停止がある
- [ ] 手動kill switchがある
- [ ] 監査ログが残る
- [ ] 税務用の取引履歴が保存される
