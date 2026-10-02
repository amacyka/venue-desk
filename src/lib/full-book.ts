// The whole order book, every ~15 minutes.
// The minute snapshot reads Binance only near the best price (more pages per minute get HTTP 429), so a separate,
// slow pass reads every page once in a while. Bybit and Wallet are read whole anyway; their numbers are stored
// the same way so all venues show "whole book" and its 24h average alike.

import { LIVE_VENUES } from "@/config/sources";
import { loadBinanceBooks } from "./binance-p2p";
import { loadVenueBooks } from "./p2p-feed";
import { loadWalletBooks } from "./wallet-p2p";
import { bookDepth, type BookSide } from "./p2p-view";
import { getJson, pipeline, setJson, storeReady } from "./store";

// b / s = USDT in seller / buyer ads (buyer ads capped per ad), ba / sa = number of ads
type Cell = { b: number; s: number; ba: number; sa: number };
export type Entry = { t: number; m: Record<string, Cell> };

export type FullSide = { total: number; ads: number; at: string; avg: number | null; hours: number };
export type FullBook = { buy: FullSide; sell: FullSide };

const KEY = "full:hist";
const LOCK_KEY = "full:lock";
const LAST_KEY = "full:last"; // what the last pass managed, for checking via /api/fullbook?status=1
const BINANCE_DELAY_MS = 12_000; // let the minute snapshot finish its own reads first
const LOCK_MS = 15 * 60_000;
const KEEP_MS = 26 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

function cellOf(book: BookSide): Cell | null {
  if (!book.sell || !book.buy || book.sell.truncated || book.buy.truncated) return null; // only complete books
  const buy = bookDepth(book.sell.ads, "buy");
  const sell = bookDepth(book.buy.ads, "sell");
  return { b: Math.round(buy.total), s: Math.round(sell.total), ba: buy.ads, sa: sell.ads };
}

export type FullBookResult = {
  ok: boolean;
  skipped?: string;
  markets?: number;
  incomplete?: string[];
  errors?: string[];
  seconds?: number;
  error?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const rank = (venue: string) => (venue === "bybit" ? 0 : venue === "wallet" ? 1 : 2);

export async function runFullBook(): Promise<FullBookResult> {
  if (!storeReady()) return { ok: false, error: "Хранилище не подключено" };
  const [lock] = await pipeline([["SET", LOCK_KEY, String(Date.now()), "NX", "PX", LOCK_MS]]);
  if (lock !== "OK") return { ok: true, skipped: "полный проход уже был меньше 15 минут назад" };
  const started = Date.now();
  const m: Record<string, Cell> = {};
  const incomplete: string[] = [];
  const errors: string[] = [];
  // Bybit comes from the cache the minute snapshot just filled; Wallet and Binance are read again in full,
  // after a pause, so they don't overlap the snapshot's own requests. Binance goes last.
  const order = [...LIVE_VENUES].sort((a, b) => rank(a) - rank(b));
  for (const venue of order) {
    if (venue !== "bybit") await sleep(Math.max(0, BINANCE_DELAY_MS - (Date.now() - started)));
    const loaded =
      venue === "binance"
        ? await loadBinanceBooks(undefined, true).catch(() => null)
        : venue === "wallet"
          ? await loadWalletBooks(undefined, true).catch(() => null)
          : await loadVenueBooks(venue).catch(() => null);
    if (!loaded) errors.push(`${venue}: не ответил`);
    for (const book of loaded?.books ?? []) {
      const cell = cellOf(book);
      if (cell) m[`${venue}:${book.fiat}`] = cell;
      else {
        incomplete.push(`${venue}:${book.fiat}`);
        if (book.error) errors.push(book.error);
      }
    }
  }
  const now = Date.now();
  const [stored] = await getJson<Entry[]>([KEY]);
  const kept = (stored ?? []).filter((entry) => now - entry.t <= KEEP_MS);
  if (Object.keys(m).length) kept.push({ t: now, m });
  const result: FullBookResult = {
    ok: true,
    markets: Object.keys(m).length,
    incomplete,
    errors: errors.slice(0, 10),
    seconds: Math.round((now - started) / 1000),
  };
  await setJson([
    [KEY, kept],
    [LAST_KEY, { ...result, at: new Date(now).toISOString() }],
  ]);
  cache = { at: now, value: kept };
  return result;
}

let cache: { at: number; value: Entry[] } | null = null;

export async function readFullHistory(): Promise<Entry[] | null> {
  if (!storeReady()) return null;
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const [stored] = await getJson<Entry[]>([KEY]);
  cache = { at: Date.now(), value: stored ?? [] };
  return cache.value;
}

export function summarizeFull(history: Entry[] | null, key: string, now = Date.now()): FullBook | null {
  const rows = (history ?? []).filter((entry) => entry.m[key]).sort((a, b) => a.t - b.t);
  const last = rows[rows.length - 1];
  if (!last) return null;
  const latest = last.m[key] as Cell;
  const day = rows.filter((entry) => now - entry.t <= DAY_MS);
  const hours = day.length ? Math.min(24, Math.max(1, Math.ceil((now - day[0]!.t) / 3_600_000))) : 0;
  const mean = (pick: (cell: Cell) => number) =>
    day.length ? day.reduce((sum, entry) => sum + pick(entry.m[key] as Cell), 0) / day.length : null;
  const at = new Date(last.t).toISOString();
  return {
    buy: { total: latest.b, ads: latest.ba, at, avg: mean((cell) => cell.b), hours },
    sell: { total: latest.s, ads: latest.sa, at, avg: mean((cell) => cell.s), hours },
  };
}

export async function lastFullBook(): Promise<unknown> {
  const [last] = await getJson<unknown>([LAST_KEY]);
  return last;
}
