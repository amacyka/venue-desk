import { FIAT_META, isFiat, periodById, type FiatId, type LiveVenueId, type PeriodId } from "@/config/sources";
import { buildFiatAnalytics, filterPage, headline, type BookSide, type P2pFiatAnalytics } from "./p2p-view";

export type HistoryPoint = {
  at: string;
  venue: LiveVenueId;
  fiat: FiatId;
  method: "book";
  averageBuy: number | null;
  averageSell: number | null;
  liquidityUsdt: number;
  liquiditySellUsdt: number;
  trafficAds: number;
  slippageBuy?: number | null;
  slippageSell?: number | null;
};

export type MarketPayload = {
  fiat: FiatId;
  title: string;
  name: string;
  payments: string[];
  view: P2pFiatAnalytics;
};

export type VenuePayload = {
  id: LiveVenueId;
  name: string;
  connected: true;
  status: "live" | "empty" | "error";
  error: string | null;
  activityHint: string;
  fetchedAt: string;
  markets: MarketPayload[];
};

export type OverviewResponse = {
  ok: true;
  fetchedAt: string;
  asset: "USDT";
  payment: string;
  history: HistoryPoint[];
  venues: VenuePayload[];
  notes: string[];
};

export function paymentLabel(id: string): string {
  return /^\d+$/.test(id) ? `код ${id}` : id;
}

export function presentBook(book: BookSide, payment: string): MarketPayload | null {
  if (!isFiat(book.fiat)) return null;
  const fiat: FiatId = book.fiat;
  const selected = payment.trim();
  const sell = filterPage(book.sell, selected);
  const buy = filterPage(book.buy, selected);
  const payments = [
    ...new Set([...(book.sell?.ads ?? []), ...(book.buy?.ads ?? [])].flatMap((ad) => ad.payments ?? [])),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  return {
    fiat,
    title: FIAT_META[fiat].title,
    name: FIAT_META[fiat].name,
    payments,
    view: buildFiatAnalytics(fiat, FIAT_META[fiat].title, sell, buy, book.error, Boolean(selected)),
  };
}

export function venueStatus(markets: MarketPayload[], error: string | null): VenuePayload["status"] {
  const live = markets.some((market) => {
    const view = market.view;
    return view.averageBuy !== null || view.averageSell !== null || view.sampleSize > 0 || view.trafficAds > 0;
  });
  if (live) return "live";
  if (error || markets.some((market) => market.view.error)) return "error";
  return "empty";
}

export function toHistoryPoint(venue: LiveVenueId, book: BookSide, at: string): HistoryPoint | null {
  if (!isFiat(book.fiat)) return null;
  const view = buildFiatAnalytics(book.fiat, book.title, book.sell, book.buy, book.error, false);
  if (view.averageBuy === null && view.averageSell === null && view.liquidityUsdt === 0 && view.liquiditySellUsdt === 0) {
    return null;
  }
  const fiat: FiatId = book.fiat;
  return {
    at,
    venue,
    fiat,
    method: "book",
    averageBuy: view.averageBuy,
    averageSell: view.averageSell,
    liquidityUsdt: view.liquidityUsdt,
    liquiditySellUsdt: view.liquiditySellUsdt,
    trafficAds: view.trafficAds,
    slippageBuy: headline(view.buyBook)?.slippagePct ?? null,
    slippageSell: headline(view.sellBook)?.slippagePct ?? null,
  };
}

export function sideSlippage(view: P2pFiatAnalytics, side: "buy" | "sell"): number | null {
  return headline(side === "buy" ? view.buyBook : view.sellBook)?.slippagePct ?? null;
}

export function baseline(values: Array<number | null>, current: number | null): number | null {
  const nums = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (current === null || nums.length < 2) return null;
  return nums[0] ?? null;
}

export function changePct(current: number | null, past: number | null): number | null {
  if (current === null || past === null || past === 0) return null;
  return ((current - past) / Math.abs(past)) * 100;
}

export function withinPeriod(points: HistoryPoint[], period: PeriodId, now = Date.now()): HistoryPoint[] {
  const windowMs = periodById(period).ms;
  return points.filter((point) => {
    const time = new Date(point.at).getTime();
    return point.method === "book" && Number.isFinite(time) && now - time <= windowMs;
  });
}

export function marketFailed(view: P2pFiatAnalytics): boolean {
  return Boolean(view.error) && view.averageBuy === null && view.averageSell === null && view.sampleSize === 0;
}

export function sidePrice(view: P2pFiatAnalytics, side: "buy" | "sell"): number | null {
  return side === "buy" ? view.averageBuy : view.averageSell;
}

export function sideBest(view: P2pFiatAnalytics, side: "buy" | "sell"): number | null {
  return side === "buy" ? view.minBuy : view.maxSell;
}

export function sideLiquidity(view: P2pFiatAnalytics, side: "buy" | "sell"): number {
  return side === "buy" ? view.liquidityUsdt : view.liquiditySellUsdt;
}

export function sideAds(view: P2pFiatAnalytics, side: "buy" | "sell"): number {
  return side === "buy" ? view.sellAds : view.buyAds;
}
