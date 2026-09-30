import type { LiveVenueId } from "@/config/sources";

export const QUOTE_USDT = 100;
export const PRICE_BAND = 0.01;
// Liquidity = USDT really available close to the best price. Buyer ads aren't backed by a deposit,
// so (like p2p.army) each one counts for at most this much.
export const LIQUIDITY_BAND = 0.02;
export const BUYER_AD_CAP = 10_000;
export const DEPTH_STEPS = [0.01, 0.02, 0.05] as const;
export const DEPTH_ANCHOR_USDT = 1_000;

export type Depth = {
  within1: number;
  within2: number;
  within5: number;
  total: number;
  ads: number;
};

export type P2pAd = {
  id?: string;
  price: string;
  quantity: number;
  minQty?: number;
  maxQty?: number;
  activity: number;
  payments?: string[];
  sheet?: number;
};

export type P2pPage = {
  total: number;
  ads: P2pAd[];
  truncated?: boolean;
};

export type BookSide = {
  fiat: string;
  title: string;
  error: string | null;
  sell: P2pPage | null;
  buy: P2pPage | null;
};

export type P2pFiatAnalytics = {
  fiat: string;
  title: string;
  error: string | null;
  liquidityUsdt: number;
  sampleSize: number;
  trafficAds: number;
  sellAds: number;
  buyAds: number;
  averageBuy: number | null;
  averageSell: number | null;
  minBuy: number | null;
  maxBuy: number | null;
  minSell: number | null;
  maxSell: number | null;
  liquiditySellUsdt: number;
  activity: number;
  activitySell: number;
  filledBuy: number;
  filledSell: number;
  payments: string[];
  trafficScope: "market" | "sample";
  bookScope: "full" | "partial";
  buyBook: SideBook;
  sellBook: SideBook;
  depthBuy: Depth; // seller ads: what you can buy
  depthSell: Depth; // buyer ads: what you can sell (capped per ad)
};

export const LADDER_USDT = [50, 100, 500, 1000] as const;
export const DEPTH_BANDS = [0.005, 0.01, 0.02] as const;

export type QuoteStep = {
  size: number;
  average: number | null;
  filled: number;
  marginal: number | null;
  slippagePct: number | null;
  deals: number;
};

export type DepthStep = {
  band: number;
  usdt: number;
  deals: number;
  lockedUsdt: number;
  lockedDeals: number;
};

export type PaySlice = {
  id: string;
  usdt: number;
};

export type SideBook = {
  best: number | null;
  activity: number;
  steps: QuoteStep[];
  bands: DepthStep[];
  payments: PaySlice[];
};

export type P2pSnapshot = {
  venue: LiveVenueId;
  fetchedAt: string;
  asset: "USDT";
  activityHint: string;
  error: string | null;
  fiats: P2pFiatAnalytics[];
};

type Level = {
  price: number;
  minQty: number;
  maxQty: number;
  maxQtyRaw: number; // whole remaining USDT of the ad
  activity: number;
  payments: string[];
};

function levels(ads: P2pAd[]): Level[] {
  const out: Level[] = [];
  for (const ad of ads) {
    const price = Number(ad.price);
    const inventory = Math.max(0, ad.quantity);
    if (!Number.isFinite(price) || price <= 0 || inventory <= 0) continue;
    const cap = ad.maxQty === undefined ? inventory : Math.min(inventory, Math.max(0, ad.maxQty));
    const minQty = Math.max(0, ad.minQty ?? 0);
    if (cap <= 0 || cap + 1e-9 < minQty) continue;
    out.push({
      price,
      minQty,
      maxQty: cap,
      maxQtyRaw: inventory,
      activity: Math.max(0, ad.activity),
      payments: ad.payments ?? [],
    });
  }
  return out;
}

function ordered(ads: P2pAd[], side: "buy" | "sell"): Level[] {
  return levels(ads).sort((left, right) => (side === "buy" ? left.price - right.price : right.price - left.price));
}

function inBand(level: Level, best: number, side: "buy" | "sell", band: number): boolean {
  const ratio = side === "buy" ? level.price / best : best / level.price;
  return ratio <= 1 + band + 1e-6;
}

function fill(book: Level[], size: number, trackPayments: boolean): QuoteStep & { payments: PaySlice[] } {
  let need = size;
  let notional = 0;
  let filled = 0;
  let marginal: number | null = null;
  let deals = 0;
  const pays = new Map<string, number>();
  for (const level of book) {
    if (need <= 1e-8) break;
    if (level.minQty > need + 1e-8) continue;
    const take = Math.min(level.maxQty, need);
    if (take + 1e-8 < level.minQty) continue;
    notional += take * level.price;
    filled += take;
    need -= take;
    marginal = level.price;
    deals += 1;
    if (trackPayments) {
      for (const id of level.payments) pays.set(id, (pays.get(id) ?? 0) + take);
    }
  }
  const best = book[0]?.price ?? null;
  const average = filled > 0 ? notional / filled : null;
  const slippagePct =
    average === null || best === null || best === 0 ? null : Math.round(sideGap(best, average, book) * 100 * 10000) / 10000;
  return {
    size,
    average,
    filled,
    marginal,
    slippagePct,
    deals,
    payments: [...pays.entries()]
      .map(([id, usdt]) => ({ id, usdt }))
      .sort((left, right) => right.usdt - left.usdt)
      .slice(0, 4),
  };
}

function sideGap(best: number, average: number, book: Level[]): number {
  const buy = book.length < 2 || book[0]!.price <= book[book.length - 1]!.price;
  return buy ? (average - best) / best : (best - average) / best;
}

export function emptySideBook(): SideBook {
  return {
    best: null,
    activity: 0,
    steps: LADDER_USDT.map((size) => ({ size, average: null, filled: 0, marginal: null, slippagePct: null, deals: 0 })),
    bands: DEPTH_BANDS.map((band) => ({ band, usdt: 0, deals: 0, lockedUsdt: 0, lockedDeals: 0 })),
    payments: [],
  };
}

export function readSide(ads: P2pAd[], side: "buy" | "sell"): SideBook {
  const book = ordered(ads, side);
  const best = book[0]?.price ?? null;
  if (best === null) return emptySideBook();
  const headline = fill(book, QUOTE_USDT, true);
  const steps = LADDER_USDT.map((size) => {
    if (size === QUOTE_USDT) {
      const { payments: _payments, ...step } = headline;
      return step;
    }
    const { payments: _payments, ...step } = fill(book, size, false);
    return step;
  });
  const bands = DEPTH_BANDS.map((band) => {
    const near = book.filter((level) => inBand(level, best, side, band));
    const open = near.filter((level) => level.minQty <= QUOTE_USDT + 1e-8);
    const locked = near.filter((level) => level.minQty > QUOTE_USDT + 1e-8);
    return {
      band,
      usdt: open.reduce((sum, level) => sum + Math.min(level.maxQty, QUOTE_USDT), 0),
      deals: open.length,
      lockedUsdt: locked.reduce((sum, level) => sum + level.maxQty, 0),
      lockedDeals: locked.length,
    };
  });
  const touch = book.filter((level) => inBand(level, best, side, PRICE_BAND) && level.minQty <= QUOTE_USDT + 1e-8);
  return {
    best,
    activity: touch.reduce((sum, level) => sum + level.activity, 0),
    steps,
    bands,
    payments: headline.payments,
  };
}

// Full available USDT near the best price, not limited to one small order.
export function bookDepth(ads: P2pAd[], side: "buy" | "sell"): Depth {
  const cap = side === "sell" ? BUYER_AD_CAP : Infinity;
  const book = levels(ads).map((level) => ({ price: level.price, qty: Math.min(level.maxQtyRaw, cap) }));
  const out: Depth = { within1: 0, within2: 0, within5: 0, total: 0, ads: book.length };
  if (!book.length) return out;
  // The band starts at the first price with real volume behind it, so one tiny ad at an odd price
  // (a few USDT far below the market) doesn't make the rest of the book look out of range.
  book.sort((a, b) => (side === "buy" ? a.price - b.price : b.price - a.price));
  let best = book[book.length - 1]!.price;
  let running = 0;
  for (const level of book) {
    running += level.qty;
    if (running >= DEPTH_ANCHOR_USDT) {
      best = level.price;
      break;
    }
  }
  for (const level of book) {
    const gap = side === "buy" ? level.price / best - 1 : best / level.price - 1;
    out.total += level.qty;
    if (gap <= DEPTH_STEPS[0] + 1e-6) out.within1 += level.qty;
    if (gap <= DEPTH_STEPS[1] + 1e-6) out.within2 += level.qty;
    if (gap <= DEPTH_STEPS[2] + 1e-6) out.within5 += level.qty;
  }
  return out;
}

export function executableQuote(ads: P2pAd[], side: "buy" | "sell", size = QUOTE_USDT) {
  const book = ordered(ads, side);
  const best = book[0]?.price ?? null;
  if (best === null) return { best: null, average: null, marginal: null, filled: 0, depth: 0, activity: 0 };
  const walked = fill(book, size, false);
  const near = book.filter((level) => inBand(level, best, side, PRICE_BAND));
  return {
    best,
    average: walked.average,
    marginal: walked.marginal,
    filled: walked.filled,
    depth: near.reduce((sum, level) => sum + level.maxQty, 0),
    activity: near.reduce((sum, level) => sum + level.activity, 0),
  };
}

export function headline(book: SideBook): QuoteStep | null {
  return book.steps.find((step) => step.size === QUOTE_USDT) ?? null;
}

export function bookAverage(ads: P2pAd[]): number | null {
  const laterSheet = ads.some((ad) => (ad.sheet ?? 0) > 1);
  let notional = 0;
  let quantity = 0;
  for (const ad of ads) {
    if (laterSheet && ad.sheet === 1) continue;
    const price = Number(ad.price);
    if (!Number.isFinite(price) || price <= 0 || ad.quantity <= 0) continue;
    notional += price * ad.quantity;
    quantity += ad.quantity;
  }
  if (quantity <= 0) return null;
  return notional / quantity;
}

export function averageBuyPrice(ads: P2pAd[]): number | null {
  return bookAverage(ads);
}

export function filterPage(page: P2pPage | null, payment: string): P2pPage | null {
  if (!page || !payment) return page;
  const ads = page.ads.filter((ad) => (ad.payments ?? []).includes(payment));
  return { total: ads.length, ads, truncated: page.truncated };
}

export function buildFiatAnalytics(
  fiat: string,
  title: string,
  sell: P2pPage | null,
  buy: P2pPage | null,
  error: string | null,
  sampleOnly = false,
): P2pFiatAnalytics {
  const sellAds = sell?.ads ?? [];
  const buyAds = buy?.ads ?? [];
  const buyBook = sell ? readSide(sellAds, "buy") : emptySideBook();
  const sellBook = buy ? readSide(buyAds, "sell") : emptySideBook();
  const buyStep = headline(buyBook);
  const sellStep = headline(sellBook);
  const depthBuy = bookDepth(sellAds, "buy");
  const depthSell = bookDepth(buyAds, "sell");
  const payments = [...new Set([...sellAds, ...buyAds].flatMap((ad) => ad.payments ?? []))].sort();
  return {
    fiat,
    title,
    error,
    liquidityUsdt: depthBuy.within2,
    liquiditySellUsdt: depthSell.within2,
    sampleSize: sellAds.length,
    trafficAds: sampleOnly ? sellAds.length + buyAds.length : (sell?.total ?? 0) + (buy?.total ?? 0),
    sellAds: sampleOnly ? sellAds.length : (sell?.total ?? 0),
    buyAds: sampleOnly ? buyAds.length : (buy?.total ?? 0),
    averageBuy: sell ? bookAverage(sellAds) : null,
    averageSell: buy ? bookAverage(buyAds) : null,
    minBuy: buyBook.best,
    maxBuy: buyStep?.marginal ?? null,
    minSell: sellStep?.marginal ?? null,
    maxSell: sellBook.best,
    activity: buyBook.activity,
    activitySell: sellBook.activity,
    filledBuy: buyStep?.filled ?? 0,
    filledSell: sellStep?.filled ?? 0,
    payments,
    trafficScope: sampleOnly ? "sample" : "market",
    bookScope: sell?.truncated || buy?.truncated ? "partial" : "full",
    buyBook,
    sellBook,
    depthBuy,
    depthSell,
  };
}
