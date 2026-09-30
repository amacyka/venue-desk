import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LIVE_VENUES, VENUE_FIATS, isFiat, isLiveVenue, type LiveVenueId } from "@/config/sources";
import type { HistoryPoint } from "./overview";
import { getJson, setJson, storeReady } from "./store";

// Without a store (local runs) history lives in a file. On Vercel only /tmp is writable and it is wiped
// whenever the server sleeps, so with Upstash connected history is kept there instead: one key per market.
const FILE = process.env.VERCEL
  ? path.join("/tmp", "data", "p2p-history.json")
  : path.join(process.cwd(), "data", "p2p-history.json");
const GAP_MS = 60_000;
const MAX_POINTS = 2000;
const STORE_GAP_MS = 10 * 60_000; // one stored point per market every 10 minutes
const STORE_KEEP_MS = 31 * 24 * 3_600_000; // enough for the 30-day period

let chain: Promise<unknown> = Promise.resolve();

export function nextHistory(existing: HistoryPoint[], incoming: HistoryPoint[], now = Date.now(), gap = GAP_MS): HistoryPoint[] {
  const out = existing.filter(isPoint);
  for (const point of incoming) {
    if (!isPoint(point)) continue;
    const stamped = new Date(point.at).getTime();
    const at = Number.isFinite(stamped) ? stamped : now;
    const previous = [...out].reverse().find((item) => item.venue === point.venue && item.fiat === point.fiat);
    if (previous && at - new Date(previous.at).getTime() < gap) continue;
    out.push(point);
  }
  return out.slice(-MAX_POINTS);
}

function isPoint(value: HistoryPoint): boolean {
  return Boolean(value && isLiveVenue(value.venue) && isFiat(value.fiat));
}

/* ---------- file fallback ---------- */

async function readAll(): Promise<HistoryPoint[]> {
  try {
    const text = await readFile(FILE, "utf8");
    const data = JSON.parse(text) as unknown;
    return Array.isArray(data) ? data.filter(isPoint) : [];
  } catch {
    return [];
  }
}

async function append(incoming: HistoryPoint[]): Promise<void> {
  if (!incoming.length) return;
  const next = nextHistory(await readAll(), incoming);
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(next));
}

/* ---------- store ---------- */

const keyOf = (venue: string, fiat: string) => `hist:${venue}:${fiat}`;
const lastWrite = new Map<string, number>();
let readCache: { at: number; key: string; value: HistoryPoint[] } | null = null;

async function storeAppend(points: HistoryPoint[]): Promise<void> {
  const now = Date.now();
  const due = points.filter((point) => isPoint(point) && now - (lastWrite.get(keyOf(point.venue, point.fiat)) ?? 0) >= STORE_GAP_MS);
  if (!due.length) return;
  const keys = due.map((point) => keyOf(point.venue, point.fiat));
  const stored = await getJson<HistoryPoint[]>(keys);
  const writes: Array<[string, unknown]> = [];
  due.forEach((point, index) => {
    const key = keys[index] as string;
    const list = (stored[index] ?? []).filter(isPoint);
    const last = list[list.length - 1];
    lastWrite.set(key, now);
    if (last && new Date(point.at).getTime() - new Date(last.at).getTime() < STORE_GAP_MS) return;
    const kept = list.filter((item) => now - new Date(item.at).getTime() <= STORE_KEEP_MS);
    kept.push(point);
    writes.push([key, kept]);
  });
  if (writes.length) {
    await setJson(writes);
    readCache = null;
  }
}

async function storeRead(venues: readonly LiveVenueId[]): Promise<HistoryPoint[]> {
  const keys = venues.flatMap((venue) => (VENUE_FIATS[venue] as readonly string[]).map((fiat) => keyOf(venue, fiat)));
  const cacheKey = keys.join(",");
  if (readCache && readCache.key === cacheKey && Date.now() - readCache.at < 60_000) return readCache.value;
  const lists = await getJson<HistoryPoint[]>(keys);
  const value = lists
    .flatMap((list) => list ?? [])
    .filter(isPoint)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  readCache = { at: Date.now(), key: cacheKey, value };
  return value;
}

/* ---------- public ---------- */

export function readHistory(venues: readonly LiveVenueId[] = LIVE_VENUES): Promise<HistoryPoint[]> {
  return storeReady() ? storeRead(venues) : readAll();
}

export function recordHistory(points: HistoryPoint[]): Promise<void> {
  // Saving history must never break the live prices.
  const job = chain.then(() => (storeReady() ? storeAppend(points) : append(points))).catch(() => undefined);
  chain = job.catch(() => undefined);
  return job;
}
