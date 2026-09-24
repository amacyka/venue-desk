import { fetchText, readJson } from "./http";
import { parseLevels, type Level } from "./levels";

const BASE = "https://data-api.binance.vision";

export const BINANCE_TRY_TICKERS = ["USDTTRY", "BTCTRY", "ETHTRY", "SOLTRY", "BNBTRY", "TRXTRY"] as const;

export type BinanceTicker = {
  symbol: string;
  bid: string;
  ask: string;
  bidQty: string;
  askQty: string;
};

export type BinanceBook = {
  symbol: "USDTTRY";
  bids: Level[];
  asks: Level[];
};

export type BinanceInr = {
  listed: boolean;
  status: string | null;
  bid: string | null;
  ask: string | null;
};

export type BinanceSnapshot = {
  venue: "binance";
  fetchedAt: string;
  book: BinanceBook | null;
  bookError: string | null;
  tickers: BinanceTicker[];
  tickersError: string | null;
  inr: BinanceInr;
};

export function parseBinanceBook(body: unknown): BinanceBook | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  if (!Array.isArray(row.bids) || !Array.isArray(row.asks)) return null;
  return {
    symbol: "USDTTRY",
    bids: parseLevels(row.bids),
    asks: parseLevels(row.asks),
  };
}

export function parseBinanceTickers(body: unknown): BinanceTicker[] {
  const rows = Array.isArray(body) ? body : body && typeof body === "object" ? [body] : [];
  const out: BinanceTicker[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const symbol = String(item.symbol ?? "");
    const bid = String(item.bidPrice ?? "");
    const ask = String(item.askPrice ?? "");
    if (!symbol || !bid || !ask) continue;
    out.push({
      symbol,
      bid,
      ask,
      bidQty: String(item.bidQty ?? ""),
      askQty: String(item.askQty ?? ""),
    });
  }
  return out;
}

export function parseBinanceInr(status: number, body: unknown): BinanceInr {
  if (status === 400) return { listed: false, status: null, bid: null, ask: null };
  if (!body || typeof body !== "object") return { listed: false, status: null, bid: null, ask: null };
  const symbols = (body as { symbols?: unknown }).symbols;
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return { listed: false, status: null, bid: null, ask: null };
  }
  const first = symbols[0] as Record<string, unknown>;
  return {
    listed: true,
    status: typeof first.status === "string" ? first.status : null,
    bid: null,
    ask: null,
  };
}

function errorText(status: number, text: string): string {
  if (status === 0) return text || "Binance не ответил";
  return `Binance ответил HTTP ${status}`;
}

export async function loadBinance(): Promise<BinanceSnapshot> {
  const symbols = encodeURIComponent(JSON.stringify([...BINANCE_TRY_TICKERS]));
  const [depth, tickers, inr] = await Promise.all([
    fetchText(`${BASE}/api/v3/depth?symbol=USDTTRY&limit=20`),
    fetchText(`${BASE}/api/v3/ticker/bookTicker?symbols=${symbols}`),
    fetchText(`${BASE}/api/v3/exchangeInfo?symbol=USDTINR`),
  ]);

  const inrInfo = parseBinanceInr(inr.status, readJson(inr.text));
  if (inrInfo.listed && inrInfo.status === "TRADING") {
    const quote = await fetchText(`${BASE}/api/v3/ticker/bookTicker?symbol=USDTINR`);
    const parsed = parseBinanceTickers(readJson(quote.text))[0];
    if (parsed) {
      inrInfo.bid = parsed.bid;
      inrInfo.ask = parsed.ask;
    }
  }

  return {
    venue: "binance",
    fetchedAt: new Date().toISOString(),
    book: depth.ok ? parseBinanceBook(readJson(depth.text)) : null,
    bookError: depth.ok ? null : errorText(depth.status, depth.text),
    tickers: tickers.ok ? parseBinanceTickers(readJson(tickers.text)) : [],
    tickersError: tickers.ok ? null : errorText(tickers.status, tickers.text),
    inr: inrInfo,
  };
}
