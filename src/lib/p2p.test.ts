import assert from "node:assert/strict";
import test from "node:test";
import { parseBinanceP2pPage } from "./binance-p2p";
import { parseBybitP2pPage } from "./bybit-p2p";
import { nextHistory } from "./p2p-history";
import { supportsFiat } from "@/config/sources";
import { baseline, changePct, presentBook, toHistoryPoint } from "./overview";
import { mergeBook } from "./book-pages";
import { QUOTE_USDT, averageBuyPrice, bookAverage, buildFiatAnalytics, executableQuote, headline, readSide, filterPage } from "./p2p-view";

test("buy quote fills 100 USDT from the best seller ads and ignores the other side", () => {
  const sell = parseBinanceP2pPage({
    code: "000000",
    total: 130,
    data: [
      { adv: { price: "50", surplusAmount: "100" }, advertiser: { monthOrderCount: 4 } },
      { adv: { price: "60", surplusAmount: "300" }, advertiser: { monthOrderCount: 6 } },
    ],
  });
  const buy = parseBybitP2pPage({
    ret_code: 0,
    result: { count: 10, items: [{ price: "1", lastQuantity: "1", recentOrderNum: 99 }] },
  });
  assert.ok(sell);
  assert.equal(averageBuyPrice(sell.ads), 57.5);
  const row = buildFiatAnalytics("TRY", "Лира", sell, buy, null);
  assert.equal(row.liquidityUsdt, 100);
  assert.equal(row.trafficAds, 140);
  assert.equal(row.averageBuy, 57.5);
  assert.equal(row.filledBuy, QUOTE_USDT);
  assert.equal(row.bookScope, "full");
  assert.equal(row.activity, 4);
  assert.equal(parseBinanceP2pPage({ ret_code: 0, result: { items: [] } }), null);
});

test("payment filter stays inside the top sample and does not invent a market total", () => {
  const sell = parseBinanceP2pPage({
    code: "000000",
    total: 130,
    data: [
      {
        adv: { price: "50", surplusAmount: "100", tradeMethods: [{ tradeMethodName: "Papara" }] },
        advertiser: { monthOrderCount: 4 },
      },
      {
        adv: { price: "70", surplusAmount: "50", tradeMethods: [{ tradeMethodName: "Ziraat" }] },
        advertiser: { monthOrderCount: 1 },
      },
    ],
  });
  assert.ok(sell);
  assert.deepEqual(sell.ads[0]?.payments, ["Papara"]);
  const filtered = filterPage(sell, "Papara");
  assert.equal(filtered?.ads.length, 1);
  const market = presentBook(
    { fiat: "TRY", title: "Лира", error: null, sell, buy: { total: 10, ads: [] } },
    "Papara",
  );
  assert.ok(market);
  assert.equal(market.view.trafficScope, "sample");
  assert.equal(market.view.sellAds, 1);
  assert.equal(market.view.averageBuy, 50);
  assert.equal(market.payments.includes("Ziraat"), true);
});

test("Bybit keeps payment codes and rejects a Binance page", () => {
  assert.equal(parseBybitP2pPage({ code: "000000", total: 3, data: [] }), null);
  const page = parseBybitP2pPage({
    ret_code: 0,
    result: {
      count: 99,
      items: [
        { price: "40", lastQuantity: "10", recentOrderNum: 2, payments: [14, 14] },
        { price: "80", lastQuantity: "30", recentOrderNum: 5, payments: [15] },
      ],
    },
  });
  assert.ok(page);
  assert.equal(averageBuyPrice(page.ads), 70);
  assert.deepEqual(page.ads[0]?.payments, ["14"]);
});

test("Bybit first sheet stays out of the book average when later sheets exist", () => {
  const average = bookAverage([
    { price: "10", quantity: 1000, activity: 0, sheet: 1 },
    { price: "40", quantity: 100, activity: 0, sheet: 2 },
    { price: "60", quantity: 100, activity: 0, sheet: 2 },
  ]);
  assert.equal(average, 50);
  assert.equal(bookAverage([{ price: "10", quantity: 5, activity: 0, sheet: 1 }]), 10);
});

test("a 100 USDT quote walks the best ads and respects one-trade limits", () => {
  const quote = executableQuote(
    [
      { price: "100", quantity: 1000, minQty: 10, maxQty: 40, activity: 3 },
      { price: "101", quantity: 1000, minQty: 10, maxQty: 1000, activity: 1 },
      { price: "130", quantity: 5000, minQty: 1, maxQty: 5000, activity: 9 },
    ],
    "buy",
  );
  assert.equal(quote.best, 100);
  assert.equal(quote.filled, 100);
  assert.equal(quote.average, 100.6);
  assert.equal(quote.marginal, 101);
  assert.equal(quote.depth, 1040);
  assert.equal(quote.activity, 4);
  const book = readSide(
    [
      { price: "100", quantity: 1000, minQty: 10, maxQty: 40, activity: 3, payments: ["14"] },
      { price: "101", quantity: 1000, minQty: 10, maxQty: 1000, activity: 1, payments: ["15"] },
      { price: "130", quantity: 5000, minQty: 1, maxQty: 5000, activity: 9 },
    ],
    "buy",
  );
  assert.equal(headline(book)?.slippagePct, 0.6);
  assert.equal(book.steps.find((step) => step.size === 50)?.average, 100.2);
  assert.equal(book.steps.find((step) => step.size === 500)?.average, 100.92);
  assert.equal(book.bands.find((band) => band.band === 0.02)?.usdt, 140);
  assert.equal(book.payments[0]?.id, "15");
  assert.equal(book.payments[0]?.usdt, 60);
  assert.equal(book.payments[1]?.usdt, 40);
});

test("merged pages keep one copy of an ad and mark a short read", () => {
  const page = mergeBook(
    [
      { total: 3, ads: [{ id: "a", price: "10", quantity: 1, activity: 1 }, { id: "b", price: "30", quantity: 1, activity: 1 }] },
      { total: 3, ads: [{ id: "b", price: "30", quantity: 1, activity: 1 }, { id: "c", price: "20", quantity: 2, activity: 1 }] },
    ],
    3,
    false,
  );
  assert.equal(page.ads.length, 3);
  assert.equal(page.truncated, true);
  const row = buildFiatAnalytics("RUB", "Рубль", page, { total: 1, ads: [{ price: "40", quantity: 1, activity: 0 }] }, null);
  assert.equal(row.bookScope, "partial");
  assert.equal(row.averageBuy, 20);
});

test("Bybit ruble stays ruble and Binance does not receive it", () => {
  assert.equal(supportsFiat("bybit", "RUB"), true);
  assert.equal(supportsFiat("binance", "RUB"), false);
  const book = {
    fiat: "RUB",
    title: "Рубль",
    error: null,
    sell: { total: 3, ads: [{ price: "83", quantity: 10, activity: 1 }] },
    buy: { total: 2, ads: [{ price: "90", quantity: 5, activity: 1 }] },
  };
  const market = presentBook(book, "");
  assert.ok(market);
  assert.equal(market.fiat, "RUB");
  assert.equal(market.title, "Рубль");
  assert.equal(market.view.averageBuy, 83);
  const point = toHistoryPoint("bybit", book, "2026-09-24T09:00:00.000Z");
  assert.equal(point?.fiat, "RUB");
  assert.equal(point?.venue, "bybit");
  const stored = nextHistory([], point ? [point] : [], Date.parse("2026-09-24T09:00:00.000Z"));
  assert.equal(stored[0]?.fiat, "RUB");
});

test("history keeps the first cut and skips a repeat inside a minute", () => {
  const first = {
    at: "2026-09-24T08:00:00.000Z",
    venue: "binance" as const,
    fiat: "TRY" as const,
    method: "book" as const,
    averageBuy: 50,
    averageSell: 49,
    liquidityUsdt: 10,
    liquiditySellUsdt: 4,
    trafficAds: 8,
  };
  const again = { ...first, at: "2026-09-24T08:00:30.000Z", averageBuy: 51 };
  const later = { ...first, at: "2026-09-24T08:02:00.000Z", averageBuy: 52 };
  const stored = nextHistory([first], [again, later], Date.parse("2026-09-24T08:02:00.000Z"));
  assert.equal(stored.length, 2);
  assert.equal(stored[1]?.averageBuy, 52);
  assert.equal(baseline([50], 52), null);
  assert.equal(baseline([50, 52], 52), 50);
  assert.equal(changePct(52, 50), 4);
});
