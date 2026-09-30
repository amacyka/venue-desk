// Estimated traded volume from order-book snapshots.
// Exchanges don't publish completed P2P volume, so — like p2p.army / openrate — we photograph every ad's remaining
// USDT about once a minute. When an ad's remainder drops, that difference was sold (or bought) through it.
// A drop that comes back within 30 minutes is treated as a cancelled order and taken out again.

import { LIVE_VENUES, type LiveVenueId } from "@/config/sources";
import type { P2pPage } from "./p2p-view";
import { getJson, pipeline, setJson, storeReady } from "./store";

// Seller ads (the viewer buys USDT) = "buy"; buyer ads (the viewer sells USDT) = "sell".
export type VolumeSide = "buy" | "sell";

// [remaining USDT, price] or, right after a drop, [remaining, price, dropped USDT, minute of the drop]
type AdState = [number, number] | [number, number, number, number];
type MarketSnap = Record<string, AdState>;
export type Snapshot = { t: number; m: Record<string, MarketSnap> };
// market -> hour index -> [USDT, fiat, fills, changes]
export type Aggregate = Record<string, Record<string, [number, number, number, number]>>;

export type VolumeSummary = {
  usdt: number;
  fiat: number;
  fills: number;
  changes: number;
  hours: number; // hours of the last 24 that have data
  since: string | null;
};

const SNAP_KEY = "vol:snap";
const AGG_KEY = "vol:agg";
const LOCK_KEY = "vol:lock";
const MIN_GAP_MS = 45_000; // at most one snapshot per ~minute
const MAX_GAP_MS = 15 * 60_000; // after a longer pause the old picture is too stale to diff against
const CANCEL_WINDOW_MIN = 30;
const KEEP_HOURS = 48;
const EPS = 0.5; // ignore sub-0.5 USDT noise

export function marketKey(venue: LiveVenueId, fiat: string, side: VolumeSide): string {
  return `${venue}:${fiat}:${side}`;
}

const hourOf = (ms: number) => Math.floor(ms / 3_600_000);
const round2 = (value: number) => Math.round(value * 100) / 100;
// Ad ids are long numbers; the tail is unique enough inside one market and keeps the snapshot small.
const shortId = (id: string) => id.slice(-10);

export function pageState(page: P2pPage | null): MarketSnap | null {
  if (!page) return null;
  const out: MarketSnap = {};
  for (const ad of page.ads) {
    const price = Number(ad.price);
    if (!ad.id || !Number.isFinite(price) || price <= 0 || !Number.isFinite(ad.quantity)) continue;
    out[shortId(ad.id)] = [round2(ad.quantity), price];
  }
  return out;
}

function bump(agg: Aggregate, key: string, hour: number, usdt: number, fiat: number, fills: number, changes: number) {
  const market = (agg[key] ??= {});
  const cell = (market[String(hour)] ??= [0, 0, 0, 0]);
  cell[0] = round2(cell[0] + usdt);
  cell[1] = round2(cell[1] + fiat);
  cell[2] += fills;
  cell[3] += changes;
}

// Compares the new picture with the previous one and books the differences into hourly buckets.
export function diffSnapshots(prev: Snapshot | null, next: Snapshot, agg: Aggregate): void {
  const nowMin = Math.floor(next.t / 60_000);
  const fresh = prev !== null && next.t - prev.t <= MAX_GAP_MS;
  for (const [key, market] of Object.entries(next.m)) {
    const before = fresh && prev ? prev.m[key] : undefined;
    if (!before) continue; // first sight of this market: nothing to compare yet
    for (const [id, state] of Object.entries(market)) {
      const old = before[id];
      if (!old) continue; // a new ad
      const [qty, price] = state;
      const diff = old[0] - qty;
      let drop: [number, number] | null = old.length === 4 && nowMin - old[3] <= CANCEL_WINDOW_MIN ? [old[2], old[3]] : null;
      if (diff > EPS) {
        bump(agg, key, hourOf(next.t), diff, diff * price, 1, 1);
        drop = [round2(diff), nowMin];
      } else if (diff < -EPS) {
        const back = -diff;
        if (drop && Math.abs(back - drop[0]) <= Math.max(1, drop[0] * 0.02)) {
          // the same amount came back: an order was opened and cancelled
          bump(agg, key, Math.floor((drop[1] * 60_000) / 3_600_000), -drop[0], -drop[0] * price, -1, 0);
          drop = null;
        } else {
          bump(agg, key, hourOf(next.t), 0, 0, 0, 1); // merchant topped the ad up
        }
      }
      market[id] = drop ? [qty, price, drop[0], drop[1]] : [qty, price];
    }
  }
  const oldest = hourOf(next.t) - KEEP_HOURS;
  for (const market of Object.values(agg)) {
    for (const hour of Object.keys(market)) if (Number(hour) < oldest) delete market[hour];
  }
}

export function summarize(agg: Aggregate | null, key: string, now = Date.now()): VolumeSummary | null {
  const market = agg?.[key];
  if (!market) return null;
  const from = hourOf(now) - 23;
  const out: VolumeSummary = { usdt: 0, fiat: 0, fills: 0, changes: 0, hours: 0, since: null };
  let first: number | null = null;
  for (const [hour, [usdt, fiat, fills, changes]] of Object.entries(market)) {
    const h = Number(hour);
    if (h < from) continue;
    out.usdt += usdt;
    out.fiat += fiat;
    out.fills += fills;
    out.changes += changes;
    out.hours += 1;
    if (first === null || h < first) first = h;
  }
  if (!out.hours) return null;
  out.usdt = Math.max(0, round2(out.usdt));
  out.fiat = Math.max(0, round2(out.fiat));
  out.fills = Math.max(0, out.fills);
  out.since = first === null ? null : new Date(first * 3_600_000).toISOString();
  return out;
}

let aggCache: { at: number; value: Aggregate | null } | null = null;

export async function readAggregate(): Promise<Aggregate | null> {
  if (!storeReady()) return null;
  if (aggCache && Date.now() - aggCache.at < 30_000) return aggCache.value;
  const [agg] = await getJson<Aggregate>([AGG_KEY]);
  aggCache = { at: Date.now(), value: agg };
  return agg;
}

export type SnapshotResult = { ok: boolean; skipped?: string; markets?: number; ads?: number; error?: string };

// One snapshot run. Safe to call often: a short lock keeps it to about one run per minute.
export async function runSnapshot(
  load: (venue: LiveVenueId) => Promise<{ books: Array<{ fiat: string; sell: P2pPage | null; buy: P2pPage | null }> }>,
): Promise<SnapshotResult> {
  if (!storeReady()) return { ok: false, error: "Хранилище не подключено" };
  const [lock] = await pipeline([["SET", LOCK_KEY, String(Date.now()), "NX", "PX", MIN_GAP_MS]]);
  if (lock !== "OK") return { ok: true, skipped: "уже был снимок меньше минуты назад" };
  const loaded = await Promise.all(LIVE_VENUES.map(async (venue) => ({ venue, value: await load(venue).catch(() => null) })));
  const next: Snapshot = { t: Date.now(), m: {} };
  let ads = 0;
  for (const { venue, value } of loaded) {
    for (const book of value?.books ?? []) {
      const buy = pageState(book.sell);
      const sell = pageState(book.buy);
      if (buy) next.m[marketKey(venue, book.fiat, "buy")] = buy;
      if (sell) next.m[marketKey(venue, book.fiat, "sell")] = sell;
      ads += Object.keys(buy ?? {}).length + Object.keys(sell ?? {}).length;
    }
  }
  const [prev, agg] = await getJson<Snapshot | Aggregate>([SNAP_KEY, AGG_KEY]);
  const aggregate = (agg as Aggregate | null) ?? {};
  const previous = prev as Snapshot | null;
  // Markets that failed to load this time keep their old picture, so one bad request doesn't reset them.
  if (previous && next.t - previous.t <= MAX_GAP_MS) {
    for (const [key, market] of Object.entries(previous.m)) if (!next.m[key]) next.m[key] = market;
  }
  diffSnapshots(previous, next, aggregate);
  await setJson([
    [SNAP_KEY, next],
    [AGG_KEY, aggregate],
  ]);
  aggCache = { at: Date.now(), value: aggregate };
  return { ok: true, markets: Object.keys(next.m).length, ads };
}
