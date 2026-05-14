export const defaultPortfolioSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;

export type PortfolioSymbol = (typeof defaultPortfolioSymbols)[number] | string;

export type PriceMap = Record<string, number>;

export type DailyKline = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type BinanceTickerResponse = {
  symbol: string;
  price: string;
};

type BinanceKlineRaw = [number, string, string, string, string, string, number, string, number, string, string, string];

type FrankfurterResponse = {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
};

const BINANCE_REST_BASE = 'https://api.binance.com';
const FRANKFURTER_RATES_URL = 'https://api.frankfurter.dev/v2/rates';

export async function fetchPortfolioPrices(symbols: string[], fetcher: typeof fetch = fetch): Promise<PriceMap> {
  const entries = await Promise.all(symbols.map(async (symbol) => {
    const url = new URL('/api/v3/ticker/price', BINANCE_REST_BASE);
    url.searchParams.set('symbol', symbol.toUpperCase());
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`price fetch failed for ${symbol}: ${response.status}`);
    const payload = (await response.json()) as BinanceTickerResponse;
    const price = Number(payload.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`invalid price for ${symbol}`);
    return [symbol.toUpperCase(), price] as const;
  }));
  return Object.fromEntries(entries);
}

export async function fetchPortfolioDailyKlines(
  symbols: string[],
  limit = 35,
  fetcher: typeof fetch = fetch
): Promise<Record<string, DailyKline[]>> {
  const entries = await Promise.all(symbols.map(async (symbol) => {
    const url = new URL('/api/v3/klines', BINANCE_REST_BASE);
    url.searchParams.set('symbol', symbol.toUpperCase());
    url.searchParams.set('interval', '1d');
    url.searchParams.set('limit', String(limit));
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`kline fetch failed for ${symbol}: ${response.status}`);
    const payload = (await response.json()) as BinanceKlineRaw[];
    const rows = payload.map((row) => ({
      openTime: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      closeTime: Number(row[6])
    })).filter((row) => row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0 && row.high >= row.low);
    return [symbol.toUpperCase(), rows] as const;
  }));
  return Object.fromEntries(entries);
}

export async function fetchUsdJpyRate(fetcher: typeof fetch = fetch): Promise<number> {
  const url = new URL(FRANKFURTER_RATES_URL);
  url.searchParams.set('base', 'USD');
  url.searchParams.set('quotes', 'JPY');
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`USD/JPY fetch failed: ${response.status}`);
  const payload = (await response.json()) as FrankfurterResponse;
  const rate = Number(payload.rates?.JPY);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('invalid USD/JPY rate');
  return rate;
}
