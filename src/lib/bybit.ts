import { fetchText, readJson } from "./http";
import { parseLevels, type Level } from "./levels";

const HOSTS = ["https://api.bybit.com", "https://api.bytick.com"];

export type BybitTicker = {
  symbol: string;
  bid: string;
  ask: string;
  bidSize: string;
  askSize: string;
};

export type BybitBook = {
  symbol: string;
  bids: Level[];
  asks: Level[];
};

export type BybitSnapshot = {
  venue: "bybit";
  fetchedAt: string;
  reachable: boolean;
  host: string | null;
  httpStatus: number | null;
  message: string;
  tickers: BybitTicker[];
  book: BybitBook | null;
};

export function parseBybitTicker(body: unknown): BybitTicker | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  if (root.retCode !== 0) return null;
  const list = (root.result as { list?: unknown } | undefined)?.list;
  if (!Array.isArray(list) || list.length === 0) return null;
  const row = list[0] as Record<string, unknown>;
  const symbol = String(row.symbol ?? "");
  const bid = String(row.bid1Price ?? "");
  const ask = String(row.ask1Price ?? "");
  if (!symbol || !bid || !ask) return null;
  return {
    symbol,
    bid,
    ask,
    bidSize: String(row.bid1Size ?? ""),
    askSize: String(row.ask1Size ?? ""),
  };
}

export function parseBybitBook(symbol: string, body: unknown): BybitBook | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  if (root.retCode !== 0) return null;
  const result = root.result as Record<string, unknown> | undefined;
  if (!result) return null;
  return {
    symbol,
    bids: parseLevels(result.b),
    asks: parseLevels(result.a),
  };
}

export function bybitFailureMessage(status: number, text: string): string {
  const json = readJson(text);
  if (json && typeof json === "object" && "retMsg" in json) {
    return `Bybit: ${String((json as { retMsg: unknown }).retMsg)}`;
  }
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed) return trimmed.slice(0, 280);
  if (status === 0) return "Bybit не ответил";
  return `Bybit ответил HTTP ${status}`;
}

async function firstHost(): Promise<{ host: string; status: number; text: string } | null> {
  let last: { host: string; status: number; text: string } | null = null;
  for (const host of HOSTS) {
    const res = await fetchText(`${host}/v5/market/tickers?category=spot&symbol=BTCUSDT`);
    last = { host, status: res.status, text: res.text };
    if (res.ok && parseBybitTicker(readJson(res.text))) return last;
    if (res.status !== 403 && res.status !== 0) return last;
  }
  return last;
}

export async function loadBybit(): Promise<BybitSnapshot> {
  const fetchedAt = new Date().toISOString();
  const probe = await firstHost();
  if (!probe) {
    return {
      venue: "bybit",
      fetchedAt,
      reachable: false,
      host: null,
      httpStatus: null,
      message: "Bybit не ответил",
      tickers: [],
      book: null,
    };
  }

  const btc = parseBybitTicker(readJson(probe.text));
  if (!btc) {
    return {
      venue: "bybit",
      fetchedAt,
      reachable: false,
      host: probe.host,
      httpStatus: probe.status,
      message: bybitFailureMessage(probe.status, probe.text),
      tickers: [],
      book: null,
    };
  }

  const [tryRes, bookRes] = await Promise.all([
    fetchText(`${probe.host}/v5/market/tickers?category=spot&symbol=USDTTRY`),
    fetchText(`${probe.host}/v5/market/orderbook?category=spot&symbol=BTCUSDT&limit=10`),
  ]);
  const tryTicker = parseBybitTicker(readJson(tryRes.text));
  const tickers = tryTicker ? [btc, tryTicker] : [btc];
  const book = bookRes.ok ? parseBybitBook("BTCUSDT", readJson(bookRes.text)) : null;

  return {
    venue: "bybit",
    fetchedAt,
    reachable: true,
    host: probe.host,
    httpStatus: probe.status,
    message: tryTicker ? "Спот Bybit" : "USDTTRY на споте Bybit не пришёл. BTCUSDT прочитан отдельно.",
    tickers,
    book,
  };
}
