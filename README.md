# Crypto Auto Trade Simulator

暗号資産の自動売買ロジックを検証するためのWebアプリです。BTC / ETH / SOL に分散した仮想ポートフォリオをGitHub Actionsで毎日更新し、GitHub Pagesで公開します。

## 公開Webアプリ

```text
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/
```

このURLを開くと、100万円をBTC / ETH / SOLに分散していた場合の現在評価額、損益、リターン、最大ドローダウン、リスクスコア、売買シグナル、シナリオ設定を確認できます。

## 実装済みの内容

- React + Vite + TypeScript の静的Webアプリ
- GitHub Pages向けのbase path設定 `/crypto-auto-trade-sim/`
- 日次データ生成 `scripts/generate-dashboard-data.mjs`
- 外部API失敗時のフォールバックデータ生成
- ドライラン専用の売買シグナル表示
- 投資元本、許容最大DD、リバランス幅を画面で変更できるシナリオ機能
- Vitestによるポートフォリオ計算テスト
- CI workflowとGitHub Pages deploy workflow
- devcontainer
- architecture/setup docs

## 毎日の自動更新

`.github/workflows/pages-dashboard.yml` が以下を実行します。

```text
価格取得
  -> public/data/performance.json 生成
  -> test
  -> Vite build
  -> GitHub Pagesへデプロイ
```

スケジュールは毎日 09:30 JST です。

## 取引所設定

初期設定は次の通りです。

| 用途 | 設定 |
| --- | --- |
| 価格取得 | Binance Spot public market data |
| 為替取得 | Frankfurter public FX rates |
| 発注 | 無効。ドライランのみ |

本番発注は無効です。

```text
TRADING_DRY_RUN=true
ENABLE_LIVE_TRADING=false
```

## 手元で実行

```bash
npm install
npm run generate:dashboard
npm run dev
```

ビルド:

```bash
npm run build
```

テスト:

```bash
npm test
```

## ドキュメント

- `docs/architecture.md`
- `docs/setup.md`

## 注意

これは投資助言ではありません。暗号資産は価格変動が大きく、元本を失う可能性があります。このWebアプリは仮想ポートフォリオの監視・検証であり、発注は行いません。
