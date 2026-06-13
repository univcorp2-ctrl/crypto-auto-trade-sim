# SETUP_CHECKLIST - crypto-auto-trade-sim

AI調査日: 2026-06-14

## 概要
BTC/ETH/SOL自動売買シミュレーター。現在Phase 0（ダッシュボード監視のみ）。

## AI確認済み
- ワークフロー解析完了（外部Secretsは現在不要）
- GitHub Pages用デプロイworkflow確認済み

## Hiro対応（必須・5分）

### Step 1: GitHub Pages有効化
Settings → Pages → Source: GitHub Actions → Save

### Step 2: GitHub Actions有効化
Settings → Actions → General → Allow all actions → Save

### Step 3: 初回デプロイ確認
Actions → Production Real Data Dashboard → Run workflow
URL: https://univcorp2-ctrl.github.io/crypto-auto-trade-sim/

### Step 4（任意）: Webhook通知設定
PERFORMANCE_WEBHOOK_URL = Slack or Discord Webhook URL
Settings → Secrets → New repository secret

## 本番化ロードマップ
Phase 0: ダッシュボード監視（Pages有効化のみ）
Phase 1: ペーパートレード（方針決定後）
Phase 2: テストネット（Binance Testnet APIキー発行後）
Phase 3: 少額実取引（Binance本番APIキー発行後）

## Secrets一覧
- PERFORMANCE_WEBHOOK_URL: 任意
- BINANCE_TESTNET_API_KEY: Phase2で必要
- BINANCE_TESTNET_SECRET_KEY: Phase2で必要
