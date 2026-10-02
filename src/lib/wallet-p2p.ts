import { FIAT_META, VENUE_FIATS, isFiat } from "@/config/sources";
import { mapPool, mergeBook } from "./book-pages";
import { fetchText, readJson } from "./http";
import { buildFiatAnalytics, type BookSide, type P2pPage, type P2pSnapshot } from "./p2p-view";

// Official Wallet (Telegram @wallet) P2P API: https://docs.wallet.tg/p2p
// The key lives only on the server, in the WALLET_P2P_API_KEY environment variable.
const URL = "https://p2p.walletbot.me/p2p/integration-api/v1/item/online";
const PAGE_SIZE = 50; // API maximum
const MAX_PAGES = 10; // up to 500 ads per side
const BATCH = 3; // pages requested at once, to stay under the rate limit

type Side = "BUY" | "SELL";

export function walletKey(): string {
  return (process.env.WALLET_P2P_API_KEY ?? "").trim();
}

export function parseWalletP2pPage(body: unknown): P2pPage | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  if (root.status !== "SUCCESS" || !Array.isArray(root.data)) return null;
  const ads: P2pPage["ads"] = [];
  for (const row of root.data) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const price = String(item.price ?? "");
    const priceNum = Number(price);
    const quantity = Number(item.lastQuantity);
    if (!price || !Number.isFinite(priceNum) || !Number.isFinite(quantity)) continue;
    const minFiat = Number(item.minAmount);
    const maxFiat = Number(item.maxAmount);
    const id = String(item.id ?? item.number ?? "").trim();
    ads.push({
      id: id || undefined,
      price,
      quantity,
      minQty: priceNum > 0 && Number.isFinite(minFiat) ? minFiat / priceNum : undefined,
      maxQty: priceNum > 0 && Number.isFinite(maxFiat) ? maxFiat / priceNum : undefined,
      activity: Number(item.orderNum) || 0,
      payments: Array.isArray(item.payments)
        ? [...new Set(item.payments.map((p) => String(p).trim()).filter(Boolean))]
        : [],
    });
  }
  return { total: ads.length, ads };
}

function failure(fiat: string, status: number, text: string): string {
  if (status === 401) return "Wallet P2P: ключ API не принят (401).";
  if (status === 403) return "Wallet P2P: доступ запрещён (403).";
  if (status === 429) return `Wallet P2P ${fiat}: слишком много запросов, повтор позже.`;
  const json = readJson(text) as { message?: unknown; error?: unknown } | null;
  const detail = json && (json.message || json.error) ? `: ${String(json.message ?? json.error)}` : "";
  return `Wallet P2P ${fiat}: HTTP ${status || "нет ответа"}${detail}`;
}

async function loadPage(key: string, fiat: string, side: Side, page: number): Promise<P2pPage | string> {
  const res = await fetchText(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-API-Key": key },
    body: JSON.stringify({ cryptoCurrency: "USDT", fiatCurrency: fiat, side, page, pageSize: PAGE_SIZE }),
  });
  if (!res.ok) return failure(fiat, res.status, res.text);
  const parsed = parseWalletP2pPage(readJson(res.text));
  if (!parsed) return `Wallet P2P ${fiat}: в ответе нет объявлений`;
  // No `sheet` tag: the "skip first page" rule in bookAverage is a Bybit-only quirk.
  return parsed;
}

// The API does not report a total, so pages are read in small batches until one comes back short.
async function loadSide(key: string, fiat: string, side: Side, maxPages = MAX_PAGES): Promise<P2pPage | string> {
  const pages: P2pPage[] = [];
  let next = 1;
  let done = false;
  let failed = false;
  while (!done && next <= maxPages) {
    const batch = Array.from({ length: Math.min(BATCH, maxPages - next + 1) }, (_, i) => next + i);
    next += batch.length;
    const results = await mapPool(batch, BATCH, (page) => loadPage(key, fiat, side, page));
    for (const result of results) {
      if (typeof result === "string") {
        if (!pages.length) return result;
        failed = true;
        done = true;
        break;
      }
      pages.push(result);
      if (result.ads.length < PAGE_SIZE) {
        done = true;
        break;
      }
    }
  }
  const total = pages.reduce((sum, page) => sum + page.ads.length, 0);
  return mergeBook(pages, total, done && !failed);
}

// `full` (the 15-minute whole-book pass) lifts the usual 10-page limit.
export async function loadWalletBooks(fiats: readonly string[] = VENUE_FIATS.wallet, full = false): Promise<{
  fetchedAt: string;
  activityHint: string;
  error: string | null;
  books: BookSide[];
}> {
  const key = walletKey();
  const activityHint =
    "Активность — число сделок мерчанта из ответа Wallet, только у объявлений в пределах 1% от лучшей цены. Данные Wallet обновляются раз в 30 секунд.";
  if (!key) {
    return {
      fetchedAt: new Date().toISOString(),
      activityHint,
      error: "Ключ Wallet P2P не задан: добавьте WALLET_P2P_API_KEY в настройках сервера.",
      books: [],
    };
  }
  const books = await Promise.all(
    fiats.filter(isFiat).map(async (fiat) => {
      // SELL ads = makers selling USDT (you buy); BUY ads = makers buying USDT (you sell).
      const pages = full ? 60 : MAX_PAGES;
      const [sell, buy] = await Promise.all([loadSide(key, fiat, "SELL", pages), loadSide(key, fiat, "BUY", pages)]);
      const errors = [sell, buy].filter((side): side is string => typeof side === "string");
      return {
        fiat,
        title: FIAT_META[fiat].title,
        error: errors.length ? [...new Set(errors)].join(" ") : null,
        sell: typeof sell === "string" ? null : sell,
        buy: typeof buy === "string" ? null : buy,
      } satisfies BookSide;
    }),
  );
  const blocked = books.every((book) => book.error && !book.sell && !book.buy);
  return {
    fetchedAt: new Date().toISOString(),
    activityHint,
    error: blocked ? books[0]?.error ?? "Wallet P2P не ответил." : null,
    books,
  };
}

export async function loadWalletP2p(): Promise<P2pSnapshot> {
  const loaded = await loadWalletBooks();
  return {
    venue: "wallet",
    fetchedAt: loaded.fetchedAt,
    asset: "USDT",
    activityHint: loaded.activityHint,
    error: loaded.error,
    fiats: loaded.books.map((book) => buildFiatAnalytics(book.fiat, book.title, book.sell, book.buy, book.error)),
  };
}
