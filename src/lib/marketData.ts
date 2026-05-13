export const supportedSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT'] as const;

export type BinanceSymbol = (typeof supportedSymbols)[number];

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type BinanceTickerPriceResponse = {
  symbol: string;
  price: string;
};

type BinanceKlineRaw = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

export type DailyKline = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type DailyReturnRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  returnPct: number;
  isCurrentDay: boolean;
};

export type DailyReturnStats = {
  todayOpen: number;
  todayReturn: number | null;
  previousCloseReturn: number | null;
  sevenDayReturn: number | null;
  thirtyDayReturn: number | null;
  dailyRows: DailyReturnRow[];
};

const BINANCE_API_BASE = 'https://api.binance.com';

export async function fetchTickerPrice(symbol: BinanceSymbol | string, fetcher: Fetcher = fetch): Promise<number> {
  const url = new URL('/api/v3/ticker/price', BINANCE_API_BASE);
  url.searchParams.set('symbol', symbol.toUpperCase());

  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`ticker price request failed: ${response.status}`);
  }

  const payload = (await response.json()) as BinanceTickerPriceResponse;
  const price = Number(payload.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('ticker price response is invalid');
  }
  return price;
}

export async function fetchDailyKlines(
  symbol: BinanceSymbol | string,
  limit = 40,
  fetcher: Fetcher = fetch
): Promise<DailyKline[]> {
  const url = new URL('/api/v3/klines', BINANCE_API_BASE);
  url.searchParams.set('symbol', symbol.toUpperCase());
  url.searchParams.set('interval', '1d');
  url.searchParams.set('limit', String(Math.max(2, Math.min(1000, Math.floor(limit)))));

  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`daily kline request failed: ${response.status}`);
  }

  const payload = (await response.json()) as BinanceKlineRaw[];
  return payload.map(parseBinanceKline).filter(isValidDailyKline);
}

export function parseBinanceKline(row: BinanceKlineRaw): DailyKline {
  return {
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: Number(row[6])
  };
}

export function calculateDailyReturnStats(currentPrice: number, klines: DailyKline[]): DailyReturnStats {
  const sorted = [...klines].filter(isValidDailyKline).sort((a, b) => a.openTime - b.openTime);
  const latest = sorted.at(-1);

  if (!latest || currentPrice <= 0) {
    return {
      todayOpen: 0,
      todayReturn: null,
      previousCloseReturn: null,
      sevenDayReturn: null,
      thirtyDayReturn: null,
      dailyRows: []
    };
  }

  const closeDaysAgo = (daysAgo: number): number | null => {
    const index = sorted.length - 1 - daysAgo;
    return index >= 0 ? sorted[index].close : null;
  };

  const fromReference = (reference: number | null): number | null => {
    if (reference === null || reference <= 0) return null;
    return currentPrice / reference - 1;
  };

  const recentRows = sorted.slice(-31);
  const dailyRows = recentRows.map((row, index) => {
    const isCurrentDay = index === recentRows.length - 1;
    const close = isCurrentDay ? currentPrice : row.close;
    return {
      date: new Date(row.openTime).toISOString().slice(0, 10),
      open: row.open,
      high: Math.max(row.high, close),
      low: Math.min(row.low, close),
      close,
      returnPct: row.open > 0 ? close / row.open - 1 : 0,
      isCurrentDay
    };
  });

  return {
    todayOpen: latest.open,
    todayReturn: latest.open > 0 ? currentPrice / latest.open - 1 : null,
    previousCloseReturn: fromReference(closeDaysAgo(1)),
    sevenDayReturn: fromReference(closeDaysAgo(7)),
    thirtyDayReturn: fromReference(closeDaysAgo(30)),
    dailyRows
  };
}

function isValidDailyKline(kline: DailyKline): boolean {
  return (
    Number.isFinite(kline.openTime) &&
    Number.isFinite(kline.closeTime) &&
    kline.open > 0 &&
    kline.high > 0 &&
    kline.low > 0 &&
    kline.close > 0 &&
    kline.high >= kline.low
  );
}
