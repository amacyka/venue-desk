import { fetchText, readJson } from "./http";
import { parseLevels, type Level } from "./levels";

const BASE = "https://exchange.api.xrocket.exchange";

export const XROCKET_BOOKS = ["BTC-USDT", "ETH-USDT", "SOL-USDT", "GRAM-USDT"] as const;
export const XROCKET_FIATS = ["RUB", "TRY", "INR"] as const;

export type XrocketBook = {
  symbol: string;
  bids: Level[];
  asks: Level[];
  error: string | null;
};

export type XrocketRate = {
  fiat: (typeof XROCKET_FIATS)[number];
  asset: "USDT";
  rate: string | null;
  change24h: string | null;
  error: string | null;
};

export type XrocketSnapshot = {
  venue: "xrocket";
  fetchedAt: string;
  books: XrocketBook[];
  rates: XrocketRate[];
};

export function parseXrocketBook(symbol: string, body: unknown): XrocketBook | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  if (!Array.isArray(row.bids) || !Array.isArray(row.asks)) return null;
  return {
    symbol,
    bids: parseLevels(row.bids),
    asks: parseLevels(row.asks),
    error: null,
  };
}

export function parseXrocketRate(fiat: (typeof XROCKET_FIATS)[number], body: unknown): XrocketRate | null {
  if (!body || typeof body !== "object") return null;
  const usdt = (body as Record<string, unknown>).USDT;
  if (!usdt || typeof usdt !== "object") return null;
  const row = usdt as Record<string, unknown>;
  const rate = String(row.rate ?? "");
  if (!rate) return null;
  return {
    fiat,
    asset: "USDT",
    rate,
    change24h: String(row.rateChangePercent24h ?? ""),
    error: null,
  };
}

async function loadBook(symbol: (typeof XROCKET_BOOKS)[number]): Promise<XrocketBook> {
  const res = await fetchText(`${BASE}/api/v1/orderbook?symbol=${symbol}&depth=20`);
  if (!res.ok) {
    return { symbol, bids: [], asks: [], error: `Хрокет ${symbol}: HTTP ${res.status || "нет ответа"}` };
  }
  return (
    parseXrocketBook(symbol, readJson(res.text)) ?? {
      symbol,
      bids: [],
      asks: [],
      error: `Хрокет ${symbol}: в ответе нет стакана`,
    }
  );
}

async function loadRate(fiat: (typeof XROCKET_FIATS)[number]): Promise<XrocketRate> {
  const res = await fetchText(`${BASE}/api/v1/rates?base=${fiat}&assets=USDT`);
  if (!res.ok) {
    return {
      fiat,
      asset: "USDT",
      rate: null,
      change24h: null,
      error: `Курс ${fiat}: HTTP ${res.status || "нет ответа"}`,
    };
  }
  return (
    parseXrocketRate(fiat, readJson(res.text)) ?? {
      fiat,
      asset: "USDT",
      rate: null,
      change24h: null,
      error: `Курс ${fiat}: в ответе нет цены`,
    }
  );
}

export async function loadXrocket(): Promise<XrocketSnapshot> {
  const [books, rates] = await Promise.all([
    Promise.all(XROCKET_BOOKS.map(loadBook)),
    Promise.all(XROCKET_FIATS.map(loadRate)),
  ]);
  return { venue: "xrocket", fetchedAt: new Date().toISOString(), books, rates };
}
