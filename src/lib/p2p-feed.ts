import type { LiveVenueId } from "@/config/sources";
import { loadBinanceBooks } from "./binance-p2p";
import { loadBybitBooks } from "./bybit-p2p";
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
const cache = new Map<LiveVenueId, { at: number; value: VenueBooks }>();
const inflight = new Map<LiveVenueId, Promise<VenueBooks>>();

async function fetchVenue(id: LiveVenueId): Promise<VenueBooks> {
  try {
    const loaded = id === "binance" ? await loadBinanceBooks() : await loadBybitBooks();
    const value: VenueBooks = { id, ...loaded };
    const points = value.books
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
  if (!fresh) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value);
  }
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
