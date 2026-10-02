import type { HistoryPoint } from "./overview";

// Liquidity over the last 24 hours, built from the stored history (one point per market every ~10 minutes).
export type LiquidityStats = {
  avg: number;
  min: number;
  minAt: string;
  max: number;
  maxAt: string;
  dayAgo: number | null; // the reading closest to exactly 24 hours ago, if there is one
  points: number;
  hours: number; // how many hours of the last 24 the data covers
};

const DAY_MS = 24 * 3_600_000;
const DAY_AGO_SLACK_MS = 40 * 60_000;

export function liquidityStats(
  history: HistoryPoint[],
  key: "liquidityUsdt" | "liquiditySellUsdt",
  now = Date.now(),
): LiquidityStats | null {
  const from = now - DAY_MS;
  const rows = history
    .map((point) => ({ at: new Date(point.at).getTime(), value: point[key] }))
    .filter((row) => Number.isFinite(row.at) && Number.isFinite(row.value));
  const inDay = rows.filter((row) => row.at >= from && row.at <= now).sort((a, b) => a.at - b.at);
  if (!inDay.length) return null;
  let sum = 0;
  let min = inDay[0]!;
  let max = inDay[0]!;
  for (const row of inDay) {
    sum += row.value;
    if (row.value < min.value) min = row;
    if (row.value > max.value) max = row;
  }
  let dayAgo: number | null = null;
  let best = Infinity;
  for (const row of rows) {
    const gap = Math.abs(row.at - from);
    if (gap <= DAY_AGO_SLACK_MS && gap < best) {
      best = gap;
      dayAgo = row.value;
    }
  }
  return {
    avg: sum / inDay.length,
    min: min.value,
    minAt: new Date(min.at).toISOString(),
    max: max.value,
    maxAt: new Date(max.at).toISOString(),
    dayAgo,
    points: inDay.length,
    hours: Math.min(24, Math.max(1, Math.ceil((now - inDay[0]!.at) / 3_600_000))),
  };
}
