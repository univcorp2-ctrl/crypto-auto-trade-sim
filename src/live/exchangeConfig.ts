export type ExchangeProfileId = 'binance-spot' | 'binance-spot-testnet';

export type ExchangeProfile = {
  exchangeId: 'binance';
  name: string;
  mode: 'live-capable' | 'testnet';
  spotOnly: true;
  testnet: boolean;
  restBaseUrl: string;
  webSocketBaseUrl: string;
  defaultSymbols: string[];
};

export type ExecutionDefaults = {
  dryRun: boolean;
  enableLiveTrading: boolean;
  orderType: 'market' | 'limit';
  quoteAsset: 'USDT';
  maxOrderUsd: number;
  maxPositionUsd: number;
  maxDailyLossPct: number;
  maxConsecutiveLosses: number;
  maxApiFailures: number;
  allowedSymbols: string[];
};

export const exchangeProfiles: Record<ExchangeProfileId, ExchangeProfile> = {
  'binance-spot': {
    exchangeId: 'binance',
    name: 'Binance Spot',
    mode: 'live-capable',
    spotOnly: true,
    testnet: false,
    restBaseUrl: 'https://api.binance.com',
    webSocketBaseUrl: 'wss://stream.binance.com:9443',
    defaultSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
  },
  'binance-spot-testnet': {
    exchangeId: 'binance',
    name: 'Binance Spot Testnet',
    mode: 'testnet',
    spotOnly: true,
    testnet: true,
    restBaseUrl: 'https://testnet.binance.vision',
    webSocketBaseUrl: 'wss://stream.testnet.binance.vision:9443',
    defaultSymbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']
  }
};

export const defaultExecutionProfile: ExchangeProfileId = 'binance-spot-testnet';
export const defaultMarketDataProfile: ExchangeProfileId = 'binance-spot';

export const executionDefaults: ExecutionDefaults = {
  dryRun: true,
  enableLiveTrading: false,
  orderType: 'market',
  quoteAsset: 'USDT',
  maxOrderUsd: 25,
  maxPositionUsd: 100,
  maxDailyLossPct: 0.02,
  maxConsecutiveLosses: 3,
  maxApiFailures: 5,
  allowedSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
};

export function resolveExchangeProfile(profileId?: string): ExchangeProfile {
  const selected = profileId && profileId in exchangeProfiles ? (profileId as ExchangeProfileId) : defaultExecutionProfile;
  return exchangeProfiles[selected];
}

export function assertLiveTradingAllowed(profile: ExchangeProfile, defaults = executionDefaults): void {
  if (defaults.dryRun) {
    throw new Error('dryRun=true. Live trading is intentionally disabled.');
  }
  if (!defaults.enableLiveTrading) {
    throw new Error('enableLiveTrading=false. Explicit approval is required before live trading.');
  }
  if (profile.testnet) {
    throw new Error('selected profile is testnet. Switch to binance-spot only after approval.');
  }
}
