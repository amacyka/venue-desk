import { FIAT_META, VENUE_FIATS, isFiat, supportsFiat } from "@/config/sources";
import { loadWholeBook } from "./book-pages";
import { postJson, readJson } from "./http";
import { buildFiatAnalytics, type BookSide, type P2pPage, type P2pSnapshot } from "./p2p-view";

const URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const PAGE_ROWS = 20;
// Binance answers HTTP 429 when asked too often. The site reads the book every minute, so it takes only the
// best-priced pages (sorted by price, they hold everything near the market) and asks two pages at a time.
const MAX_PAGES = 6;
const CONCURRENCY = 2;
// The rare full pass (every 15 minutes) reads every page, slowly, to get the whole book.
const FULL_PAUSE_MS = 100;
const FULL_CONCURRENCY = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseBinanceP2pPage(body: unknown): P2pPage | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  if (root.code !== "000000" || !Array.isArray(root.data)) return null;
  const ads: P2pPage["ads"] = [];
  for (const row of root.data) {
    if (!row || typeof row !== "object") continue;
    const adv = (row as { adv?: unknown }).adv;
    const user = (row as { advertiser?: unknown }).advertiser;
    if (!adv || typeof adv !== "object") continue;
    const ad = adv as Record<string, unknown>;
    const merchant = user && typeof user === "object" ? (user as Record<string, unknown>) : {};
    const price = String(ad.price ?? "");
    const quantity = Number(ad.tradableQuantity ?? ad.surplusAmount);
    if (!price || !Number.isFinite(quantity)) continue;
    const id = String(ad.advNo ?? "").trim();
    const minQty = Number(ad.minSingleTransQuantity);
    const maxQty = Number(ad.maxSingleTransQuantity);
    ads.push({
      id: id || undefined,
      price,
      quantity,
      minQty: Number.isFinite(minQty) ? minQty : undefined,
      maxQty: Number.isFinite(maxQty) ? maxQty : undefined,
      activity: Number(merchant.monthOrderCount) || 0,
      payments: paymentNames(ad.tradeMethods),
    });
  }
  return { total: Number(root.total) || ads.length, ads };
}

async function loadPage(fiat: string, tradeType: "BUY" | "SELL", page: number, full = false): Promise<P2pPage | string> {
  if (full && page > 1) await sleep(FULL_PAUSE_MS);
  const res = await postJson(URL, {
    asset: "USDT",
    fiat,
    tradeType,
    page,
    rows: PAGE_ROWS,
    payTypes: [],
  });
  if (!res.ok) return `Binance P2P ${fiat}: HTTP ${res.status || "нет ответа"}`;
  return parseBinanceP2pPage(readJson(res.text)) ?? `Binance P2P ${fiat}: в ответе нет объявлений`;
}

function loadSide(fiat: string, tradeType: "BUY" | "SELL", full = false): Promise<P2pPage | string> {
  return loadWholeBook((page) => loadPage(fiat, tradeType, page, full), PAGE_ROWS, full ? FULL_CONCURRENCY : CONCURRENCY, full ? 260 : MAX_PAGES);
}

function paymentNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const method of value) {
    if (!method || typeof method !== "object") continue;
    const name = (method as { tradeMethodName?: unknown }).tradeMethodName;
    if (typeof name === "string" && name.trim()) names.push(name.trim());
  }
  return [...new Set(names)];
}

export async function loadBinanceBooks(fiats: readonly string[] = VENUE_FIATS.binance, full = false): Promise<{
  fetchedAt: string;
  activityHint: string;
  error: string | null;
  books: BookSide[];
}> {
  const books = await Promise.all(
    fiats.filter(isFiat).filter((fiat) => supportsFiat("binance", fiat)).map(async (fiat) => {
      // The full pass reads one side at a time to stay gentle.
      let sell: P2pPage | string;
      let buy: P2pPage | string;
      if (full) {
        sell = await loadSide(fiat, "BUY", true);
        buy = await loadSide(fiat, "SELL", true);
      } else {
        [sell, buy] = await Promise.all([loadSide(fiat, "BUY"), loadSide(fiat, "SELL")]);
      }
      const errors = [sell, buy].filter((side): side is string => typeof side === "string");
      return {
        fiat,
        title: FIAT_META[fiat].title,
        error: errors.length ? errors.join(" ") : null,
        sell: typeof sell === "string" ? null : sell,
        buy: typeof buy === "string" ? null : buy,
      } satisfies BookSide;
    }),
  );
  const blocked = books.every((book) => book.error && !book.sell && !book.buy);
  return {
    fetchedAt: new Date().toISOString(),
    activityHint:
      "Активность — заказы мерчантов за 30 дней только у объявлений в пределах 1% от лучшей цены. Календарного оборота сделок этот список не отдаёт.",
    error: blocked ? "Публичный список P2P Binance не ответил." : null,
    books,
  };
}

export async function loadBinanceP2p(): Promise<P2pSnapshot> {
  const loaded = await loadBinanceBooks();
  return {
    venue: "binance",
    fetchedAt: loaded.fetchedAt,
    asset: "USDT",
    activityHint: loaded.activityHint,
    error: loaded.error,
    fiats: loaded.books.map((book) => buildFiatAnalytics(book.fiat, book.title, book.sell, book.buy, book.error)),
  };
}
