import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isFiat, isLiveVenue } from "@/config/sources";
import type { HistoryPoint } from "./overview";

const FILE = path.join(process.cwd(), "data", "p2p-history.json");
const GAP_MS = 60_000;
const MAX_POINTS = 2000;

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

export function readHistory(): Promise<HistoryPoint[]> {
  return readAll();
}

export function recordHistory(points: HistoryPoint[]): Promise<void> {
  const job = chain.then(() => append(points));
  chain = job.catch(() => undefined);
  return job;
}
