import type { LiveVenueId } from "@/config/sources";
import { loadBinanceBooks } from "./binance-p2p";
import { loadBybitBooks } from "./bybit-p2p";
import { loadWalletBooks } from "./wallet-p2p";
import { toHistoryPoint, type HistoryPoint } from "./overview";
import type { BookSide } from "./p2p-view";
import { recordHistory } from "./p2p-history";

export type VenueBooks = {
  id: LiveVenueId;
  fetchedAt: string;
  activityHint: string;
  error: string | null;
  books: BookSide[];
};

const TTL_MS = 20_000;
const COOLDOWN_MS = 2 * 60_000; // after "too many requests" the venue is left alone for a while
const STALE_OK_MS = 10 * 60_000; // a failed market shows its last good book if it is this fresh
const cache = new Map<LiveVenueId, { at: number; value: VenueBooks }>();
const inflight = new Map<LiveVenueId, Promise<VenueBooks>>();
const cooldownUntil = new Map<LiveVenueId, number>();
const lastGood = new Map<string, { at: number; book: BookSide }>();

const limited = (value: VenueBooks) =>
  /HTTP 429|HTTP 418|HTTP 403/.test([value.error ?? "", ...value.books.map((book) => book.error ?? "")].join(" "));

// Keeps a market on screen through a short outage: a side that failed now is taken from the last good load.
function patchWithLastGood(value: VenueBooks): VenueBooks {
  const now = Date.now();
  let patched = false;
  const books = value.books.map((book) => {
    const key = `${value.id}:${book.fiat}`;
    const good = lastGood.get(key);
    if (book.sell && book.buy) {
      lastGood.set(key, { at: now, book });
      return book;
    }
    if (!good || now - good.at > STALE_OK_MS) return book;
    patched = true;
    const sell = book.sell ?? good.book.sell;
    const buy = book.buy ?? good.book.buy;
    return { ...book, sell, buy, error: sell && buy ? null : book.error };
  });
  if (!patched) return value;
  const anyData = books.some((book) => book.sell || book.buy);
  return { ...value, books, error: anyData ? null : value.error };
}

async function fetchVenue(id: LiveVenueId): Promise<VenueBooks> {
  try {
    const loaded =
      id === "binance" ? await loadBinanceBooks() : id === "bybit" ? await loadBybitBooks() : await loadWalletBooks();
    const raw: VenueBooks = { id, ...loaded };
    if (limited(raw)) cooldownUntil.set(id, Date.now() + COOLDOWN_MS);
    const value = patchWithLastGood(raw);
    // History and volume only get markets that really loaded now.
    const points = raw.books
      .map((book) => toHistoryPoint(id, book, value.fetchedAt))
      .filter((point): point is HistoryPoint => point !== null);
    await recordHistory(points);
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Источник не ответил";
    return {
      id,
      fetchedAt: new Date().toISOString(),
      activityHint: "",
      error: message,
      books: [],
    };
  }
}

export function loadVenueBooks(id: LiveVenueId, fresh = false): Promise<VenueBooks> {
  const hit = cache.get(id);
  // While a venue is rate-limiting us, don't ask it again — show what we have.
  if (hit && Date.now() < (cooldownUntil.get(id) ?? 0)) return Promise.resolve(hit.value);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value);
  const pending = inflight.get(id);
  if (pending) return pending;
  const job = fetchVenue(id)
    .then((value) => {
      cache.set(id, { at: Date.now(), value });
      inflight.delete(id);
      return value;
    })
    .catch((error) => {
      inflight.delete(id);
      throw error;
    });
  inflight.set(id, job);
  return job;
}
