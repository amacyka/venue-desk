import { FIAT_META, VENUE_FIATS, isFiat } from "@/config/sources";
import { loadWholeBook } from "./book-pages";
import { postJson, readJson } from "./http";
import { buildFiatAnalytics, type BookSide, type P2pPage, type P2pSnapshot } from "./p2p-view";

const URL = "https://api2.bybit.com/fiat/otc/item/online";
const PAGE_SIZE = 200;

export function parseBybitP2pPage(body: unknown): P2pPage | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  if (root.ret_code !== 0) return null;
  const result = root.result;
  if (!result || typeof result !== "object") return null;
  const items = (result as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  const ads: P2pPage["ads"] = [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const price = String(item.price ?? "");
    const priceNum = Number(price);
    const quantity = Number(item.lastQuantity);
    if (!price || !Number.isFinite(quantity)) continue;
    const id = String(item.id ?? "").trim();
    const minFiat = Number(item.minAmount);
    const maxFiat = Number(item.maxAmount);
    ads.push({
      id: id || undefined,
      price,
      quantity,
      minQty: priceNum > 0 && Number.isFinite(minFiat) ? minFiat / priceNum : undefined,
      maxQty: priceNum > 0 && Number.isFinite(maxFiat) ? maxFiat / priceNum : undefined,
      activity: Number(item.recentOrderNum) || 0,
      payments: paymentCodes(item.payments),
    });
  }
  return { total: Number((result as { count?: unknown }).count) || ads.length, ads };
}

async function loadPage(fiat: string, side: "0" | "1", page: number): Promise<P2pPage | string> {
  const res = await postJson(URL, {
    tokenId: "USDT",
    currencyId: fiat,
    side,
    page: String(page),
    size: String(PAGE_SIZE),
  });
  if (!res.ok) return `Bybit P2P ${fiat}: HTTP ${res.status || "нет ответа"}`;
  const parsed = parseBybitP2pPage(readJson(res.text));
  if (!parsed) return `Bybit P2P ${fiat}: в ответе нет объявлений`;
  return { ...parsed, ads: parsed.ads.map((ad) => ({ ...ad, sheet: page })) };
}

function loadSide(fiat: string, side: "0" | "1"): Promise<P2pPage | string> {
  return loadWholeBook((page) => loadPage(fiat, side, page), PAGE_SIZE, 4);
}

function paymentCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id).trim()).filter(Boolean))];
}

export async function loadBybitBooks(fiats: readonly string[] = VENUE_FIATS.bybit): Promise<{
  fetchedAt: string;
  activityHint: string;
  error: string | null;
  books: BookSide[];
}> {
  const books = await Promise.all(
    fiats.filter(isFiat).map(async (fiat) => {
      const [buy, sell] = await Promise.all([loadSide(fiat, "0"), loadSide(fiat, "1")]);
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
      "Активность — недавние сделки только у объявлений в пределах 1% от лучшей цены. Календарных 24 часов Bybit в этом поле не обещает. Коды оплаты — не названия банков.",
    error: blocked ? "Публичный список P2P Bybit не ответил." : null,
    books,
  };
}

export async function loadBybitP2p(): Promise<P2pSnapshot> {
  const loaded = await loadBybitBooks();
  return {
    venue: "bybit",
    fetchedAt: loaded.fetchedAt,
    asset: "USDT",
    activityHint: loaded.activityHint,
    error: loaded.error,
    fiats: loaded.books.map((book) => buildFiatAnalytics(book.fiat, book.title, book.sell, book.buy, book.error)),
  };
}
