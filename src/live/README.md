# Live trading design

このディレクトリは、将来の実運用に向けた型と安全装置の雛形です。

## 重要方針

ブラウザアプリから直接APIキーを使って発注してはいけません。本番発注は必ずサーバー側で行い、APIキーは環境変数またはシークレット管理に保存します。

## 推奨構成

```text
scheduler / worker
  -> market data provider
  -> strategy engine
  -> risk manager
  -> execution adapter
  -> audit logger
```

## dry run first

`ExecutionAdapter.dryRun` を必ず用意し、初期値は `true` にしてください。

## 実装時に必要な停止条件

- 1日損失率
- 連敗数
- 最大建玉
- 最大注文額
- 許可銘柄リスト
- APIエラー回数
- 価格乖離
- 最小注文数量
- 約定遅延
- 取引所メンテナンス

## 本番移行の流れ

1. 過去データのバックテスト
2. walk-forward analysis
3. 取引所テストネット
4. 本番環境で発注なしの監視
5. 小額・低頻度の本番発注
6. 異常停止と復旧手順の確認
7. 増額判断
