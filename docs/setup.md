# Setup Guide

## Public URL

公開URLは次です。

```text
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/
```

GitHub Pages workflowは `.github/workflows/pages-dashboard.yml` です。push、手動実行、日次scheduleで `dist` をGitHub Pagesへ公開します。

## Local Development

```bash
npm install
npm run generate:dashboard
npm run dev
```

ブラウザで `http://localhost:5173/` を開きます。

## Test and Build

```bash
npm run lint
npm test
npm run build
```

## Portfolio Config

`config/portfolio.json` で初期投資額、銘柄、配分、API URL、手数料、スケジュール表示を変更できます。

## GitHub Pages Settings

このrepoではPages用workflowを同梱しています。Actionsの `Deploy Web App to GitHub Pages` が成功すると、次のURLが公開されます。

```text
https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/
```

GitHubのPages設定でSourceを選ぶ必要がある場合は、`GitHub Actions` を選択します。

## Optional Secrets

必須Secretはありません。通知だけ任意です。

| Secret | Purpose |
| --- | --- |
| `PERFORMANCE_WEBHOOK_URL` | Slack/Discord等へ日次サマリを送るWebhook URL |

GitHub Tokenや取引所APIキーはChatGPT側には入れません。将来、Testnet注文検証を追加する場合もGitHub Actions Secretsで管理します。
