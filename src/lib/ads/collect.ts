import { supportsFiat, type FiatId, type LiveVenueId } from "@/config/sources";
import { mapPool } from "../book-pages";
import { fetchText, postJson, readJson } from "../http";
import { walletKey } from "../wallet-p2p";
import { analyzeAd, canonicalBank, type AdAnalysis } from "./analyze";

// "buy" = the viewer buys USDT (seller ads); "sell" = the viewer sells USDT (buyer ads).
export type AdSide = "buy" | "sell";

export type SearchAd = {
  venue: LiveVenueId;
  id: string;
  side: AdSide;
  fiat: FiatId;
  price: number;
  availableUsdt: number;
  minFiat: number | null;
  maxFiat: number | null;
  payments: string[]; // banks, one name across exchanges
  methods: string[]; // exchange payment categories that are not a bank ("Bank Transfer", "Cash in Person")
  nick: string;
  orders: number | null;
  completion: number | null; // 0..100
  online: boolean | null;
  merchant: boolean;
  remarks: string;
  remarksLoaded: boolean;
  requirements: string[]; // counterparty limits the exchange itself reports
  link: string | null;
  amountConflict: boolean; // amounts named in the terms fall outside the ad's own limits
  analysis: AdAnalysis;
};

export type AdSearchResult = {
  venue: LiveVenueId;
  fiat: FiatId;
  side: AdSide;
  fetchedAt: string;
  error: string | null;
  notes: string[];
  ads: SearchAd[];
};

const HEADERS = { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Mozilla/5.0" };
const num = (value: unknown): number | null => {
  const n = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(n) ? n : null;
};
const str = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));

function finish(partial: Omit<SearchAd, "analysis" | "amountConflict" | "methods" | "payments"> & { labels: string[] }): SearchAd {
  const { labels, ...rest } = partial;
  const payments: string[] = [];
  const methods: string[] = [];
  for (const label of labels) {
    const bank = canonicalBank(label);
    if (bank) {
      if (!payments.includes(bank)) payments.push(bank);
    } else if (!methods.includes(label)) methods.push(label);
  }
  const analysis = analyzeAd(rest.remarks, rest.nick);
  const fixed = analysis.amounts.fixed;
  const inLimits = (value: number) =>
    (rest.minFiat === null || value >= rest.minFiat - 0.5) && (rest.maxFiat === null || value <= rest.maxFiat + 0.5);
  const amountConflict = fixed.length > 0 && !fixed.some(inLimits);
  return { ...rest, payments, methods, amountConflict, analysis };
}

/* ---------------- Binance ---------------- */

const BINANCE_LIST = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const BINANCE_DETAIL = "https://p2p.binance.com/bapi/c2c/v2/public/c2c/adv/detail?advNo=";
const BINANCE_PAGES = 8; // 20 ads per page
const remarkCache = new Map<string, { at: number; text: string }>();
const REMARK_TTL = 15 * 60_000;

async function binanceRemarks(advNos: string[]): Promise<{ map: Map<string, string>; limited: boolean }> {
  const map = new Map<string, string>();
  let limited = false;
  const todo: string[] = [];
  for (const no of advNos) {
    const hit = remarkCache.get(no);
    if (hit && Date.now() - hit.at < REMARK_TTL) map.set(no, hit.text);
    else todo.push(no);
  }
  await mapPool(todo, 5, async (no) => {
    if (limited) return;
    const res = await fetchText(BINANCE_DETAIL + encodeURIComponent(no), { headers: HEADERS }, 8000);
    if (res.status === 429) {
      limited = true;
      return;
    }
    const data = (readJson(res.text) as { data?: { remarks?: unknown; autoReplyMsg?: unknown } } | null)?.data;
    if (!res.ok || !data) return;
    const text = [str(data.remarks), str(data.autoReplyMsg)].filter(Boolean).join("\n");
    remarkCache.set(no, { at: Date.now(), text });
    map.set(no, text);
  });
  return { map, limited };
}

async function collectBinance(fiat: FiatId, side: AdSide): Promise<Omit<AdSearchResult, "venue" | "fiat" | "side" | "fetchedAt">> {
  const tradeType = side === "buy" ? "BUY" : "SELL";
  const rows: Record<string, unknown>[] = [];
  let error: string | null = null;
  const loadPage = async (page: number) => {
    const res = await postJson(BINANCE_LIST, { asset: "USDT", fiat, tradeType, page, rows: 20, payTypes: [] });
    const body = readJson(res.text) as { data?: unknown; total?: unknown } | null;
    return { res, list: Array.isArray(body?.data) ? (body.data as Record<string, unknown>[]) : null, total: num(body?.total) };
  };
  // First page tells how many ads exist; the rest are fetched a few at a time.
  const first = await loadPage(1);
  if (!first.res.ok || !first.list) {
    error = `Binance ответил HTTP ${first.res.status || "нет ответа"}`;
  } else {
    rows.push(...first.list);
    const pages = Math.min(BINANCE_PAGES, Math.ceil((first.total ?? first.list.length) / 20));
    const rest = await mapPool(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2), 3, loadPage);
    for (const page of rest) if (page.list) rows.push(...page.list);
  }
  const advNos = rows.map((row) => str((row.adv as Record<string, unknown> | undefined)?.advNo)).filter(Boolean);
  const { map, limited } = await binanceRemarks(advNos);
  const ads = rows.flatMap((row) => {
    const adv = (row.adv ?? {}) as Record<string, unknown>;
    const user = (row.advertiser ?? {}) as Record<string, unknown>;
    const id = str(adv.advNo);
    const price = num(adv.price);
    if (!id || price === null) return [];
    const methods = Array.isArray(adv.tradeMethods) ? (adv.tradeMethods as Record<string, unknown>[]) : [];
    const finishRate = num(user.monthFinishRate);
    const requirements: string[] = [];
    const regDays = num(adv.buyerRegDaysLimit);
    if (regDays) requirements.push(`Аккаунт старше ${regDays} дн.`);
    const minTrades = num(adv.userAllTradeCountMin) ?? num(adv.userTradeCompleteCountMin);
    if (minTrades) requirements.push(`От ${minTrades} сделок`);
    if (num(adv.takerAdditionalKycRequired)) requirements.push("Доп. верификация покупателя");
    return [
      finish({
        venue: "binance",
        id,
        side,
        fiat,
        price,
        availableUsdt: num(adv.tradableQuantity) ?? num(adv.surplusAmount) ?? 0,
        minFiat: num(adv.minSingleTransAmount),
        maxFiat: num(adv.dynamicMaxSingleTransAmount) ?? num(adv.maxSingleTransAmount),
        labels: [...new Set(methods.map((m) => str(m.tradeMethodName)).filter(Boolean))],
        nick: str(user.nickName),
        orders: num(user.monthOrderCount),
        completion: finishRate === null ? null : Math.round(finishRate * 1000) / 10,
        online: null,
        merchant: str(user.userType) === "merchant",
        remarks: map.get(id) ?? "",
        remarksLoaded: map.has(id),
        requirements,
        link: str(user.userNo) ? `https://p2p.binance.com/ru/advertiserDetail?advertiserNo=${str(user.userNo)}` : null,
      }),
    ];
  });
  const notes = ["Binance: заказы и процент выполнения — за 30 дней."];
  if (limited) notes.push("Binance ограничил частоту запросов: у части объявлений условия ещё не загружены. Обновите через минуту.");
  return { error, notes, ads };
}

/* ---------------- Bybit ---------------- */

const BYBIT_LIST = "https://api2.bybit.com/fiat/otc/item/online";
const BYBIT_PAYMENTS = "https://api2.bybit.com/fiat/otc/configuration/queryAllPaymentList";
const BYBIT_PAGES = 10; // 100 ads per page
let bybitNames: { at: number; map: Map<string, string> } | null = null;

// Only codes whose names are confirmed; anything else is shown as its raw code rather than guessed.
const BYBIT_FALLBACK: Record<string, string> = {
  "14": "Bank Transfer",
};

async function bybitPaymentNames(): Promise<Map<string, string>> {
  if (bybitNames && Date.now() - bybitNames.at < 6 * 3600_000) return bybitNames.map;
  const map = new Map<string, string>(Object.entries(BYBIT_FALLBACK));
  const res = await fetchText(BYBIT_PAYMENTS, { method: "POST", headers: HEADERS, body: "{}" });
  const list = (readJson(res.text) as { result?: { paymentConfigVo?: unknown[] } } | null)?.result?.paymentConfigVo;
  if (Array.isArray(list)) {
    for (const item of list as Record<string, unknown>[]) {
      const name = str(item.paymentName) || str(item.paymentAlias);
      if (name) map.set(str(item.paymentType), name);
    }
  }
  bybitNames = { at: Date.now(), map };
  return map;
}

async function collectBybit(fiat: FiatId, side: AdSide): Promise<Omit<AdSearchResult, "venue" | "fiat" | "side" | "fetchedAt">> {
  const names = await bybitPaymentNames();
  const items: Record<string, unknown>[] = [];
  let error: string | null = null;
  const loadPage = async (page: number) => {
    const res = await postJson(BYBIT_LIST, {
      tokenId: "USDT",
      currencyId: fiat,
      side: side === "buy" ? "1" : "0",
      page: String(page),
      size: "100",
    });
    const body = readJson(res.text) as { ret_code?: number; result?: { items?: unknown; count?: unknown } } | null;
    const list = body?.ret_code === 0 && Array.isArray(body.result?.items) ? (body.result.items as Record<string, unknown>[]) : null;
    return { res, list, total: num(body?.result?.count) };
  };
  const first = await loadPage(1);
  if (!first.res.ok || !first.list) {
    error = `Bybit ответил HTTP ${first.res.status || "нет ответа"}`;
  } else {
    items.push(...first.list);
    const pages = Math.min(BYBIT_PAGES, Math.ceil((first.total ?? first.list.length) / 100));
    const rest = await mapPool(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2), 4, loadPage);
    for (const page of rest) if (page.list) items.push(...page.list);
  }
  const ads = items.flatMap((item) => {
    const id = str(item.id);
    const price = num(item.price);
    if (!id || price === null) return [];
    const pref = (item.tradingPreferenceSet ?? {}) as Record<string, unknown>;
    const requirements: string[] = [];
    if (num(pref.isKyc)) requirements.push("Нужен KYC");
    if (num(pref.hasRegisterTime) && num(pref.registerTimeThreshold)) requirements.push(`Аккаунт старше ${num(pref.registerTimeThreshold)} дн.`);
    if (num(pref.hasOrderFinishNumberDay30) && num(pref.orderFinishNumberDay30)) requirements.push(`От ${num(pref.orderFinishNumberDay30)} сделок за 30 дн.`);
    if (num(pref.hasCompleteRateDay30) && num(pref.completeRateDay30)) requirements.push(`Выполнение от ${num(pref.completeRateDay30)}% за 30 дн.`);
    const codes = Array.isArray(item.payments) ? (item.payments as unknown[]).map(str) : [];
    const mask = str(item.userMaskId);
    return [
      finish({
        venue: "bybit",
        id,
        side,
        fiat,
        price,
        availableUsdt: num(item.lastQuantity) ?? 0,
        minFiat: num(item.minAmount),
        maxFiat: num(item.maxAmount),
        labels: [...new Set(codes.map((code) => names.get(code) ?? `Bybit код ${code}`))],
        nick: str(item.nickName),
        orders: num(item.recentOrderNum),
        completion: num(item.recentExecuteRate),
        online: typeof item.isOnline === "boolean" ? item.isOnline : null,
        merchant: Array.isArray(item.authTag) && (item.authTag as unknown[]).some((tag) => ["BA", "VA", "GA"].includes(str(tag))),
        remarks: str(item.remark),
        remarksLoaded: true,
        requirements,
        link: mask ? `https://www.bybit.com/fiat/trade/otc/profile/${mask}/USDT/${fiat}/item` : null,
      }),
    ];
  });
  return { error, notes: ["Bybit: заказы и процент выполнения — недавние, как их считает Bybit."], ads };
}

/* ---------------- Wallet ---------------- */

const WALLET_LIST = "https://p2p.walletbot.me/p2p/integration-api/v1/item/online";

async function collectWallet(fiat: FiatId, side: AdSide): Promise<Omit<AdSearchResult, "venue" | "fiat" | "side" | "fetchedAt">> {
  const key = walletKey();
  if (!key) return { error: "Ключ Wallet P2P не задан.", notes: [], ads: [] };
  const rows: Record<string, unknown>[] = [];
  let error: string | null = null;
  const loadPage = async (page: number) => {
    const res = await fetchText(WALLET_LIST, {
      method: "POST",
      headers: { ...HEADERS, "X-API-Key": key },
      body: JSON.stringify({ cryptoCurrency: "USDT", fiatCurrency: fiat, side: side === "buy" ? "SELL" : "BUY", page, pageSize: 50 }),
    });
    const body = readJson(res.text) as { status?: string; data?: unknown } | null;
    return { res, list: body?.status === "SUCCESS" && Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : null };
  };
  // Wallet reports no total: read three pages at a time until one comes back short.
  for (let start = 1; start <= 10; start += 3) {
    const batch = await mapPool([start, start + 1, start + 2].filter((p) => p <= 10), 3, loadPage);
    let done = false;
    for (const [i, page] of batch.entries()) {
      if (!page.list) {
        if (start === 1 && i === 0) error = `Wallet ответил HTTP ${page.res.status || "нет ответа"}`;
        done = true;
        break;
      }
      rows.push(...page.list);
      if (page.list.length < 50) {
        done = true;
        break;
      }
    }
    if (done) break;
  }
  const ads = rows.flatMap((row) => {
    const id = str(row.id) || str(row.number);
    const price = num(row.price);
    if (!id || price === null) return [];
    const rate = num(row.executeRate);
    return [
      finish({
        venue: "wallet",
        id,
        side,
        fiat,
        price,
        availableUsdt: num(row.lastQuantity) ?? 0,
        minFiat: num(row.minAmount),
        maxFiat: num(row.maxAmount),
        labels: Array.isArray(row.payments) ? [...new Set((row.payments as unknown[]).map(str).filter(Boolean))] : [],
        nick: str(row.nickname),
        orders: num(row.orderNum),
        completion: rate === null ? null : Math.round(rate * 1000) / 10,
        online: typeof row.isOnline === "boolean" ? row.isOnline : null,
        merchant: str(row.merchantLevel).toUpperCase() === "MERCHANT",
        remarks: "",
        remarksLoaded: false,
        requirements: [],
        link: null,
      }),
    ];
  });
  return {
    error,
    notes: ["Wallet не отдаёт текст условий: третьи лица и ограничения по банкам из текста для него не определяются. Объявление открывается в @wallet → P2P по нику продавца."],
    ads,
  };
}

/* ---------------- entry ---------------- */

const cache = new Map<string, { at: number; value: AdSearchResult }>();
const TTL = 60_000;

export async function searchAds(venue: LiveVenueId, fiat: FiatId, side: AdSide, fresh = false): Promise<AdSearchResult> {
  const key = `${venue}:${fiat}:${side}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.value;
  const fetchedAt = new Date().toISOString();
  if (!supportsFiat(venue, fiat)) {
    return { venue, fiat, side, fetchedAt, error: "Эта валюта на площадке не подключена.", notes: [], ads: [] };
  }
  try {
    const part =
      venue === "binance" ? await collectBinance(fiat, side) : venue === "bybit" ? await collectBybit(fiat, side) : await collectWallet(fiat, side);
    const ads = part.ads.sort((a, b) => (side === "buy" ? a.price - b.price : b.price - a.price));
    const value: AdSearchResult = { venue, fiat, side, fetchedAt, ...part, ads };
    if (!part.error) cache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    return { venue, fiat, side, fetchedAt, error: error instanceof Error ? error.message : "Источник не ответил", notes: [], ads: [] };
  }
}
