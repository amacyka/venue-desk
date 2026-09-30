import assert from "node:assert/strict";
import test from "node:test";
import { emptySideBook, type P2pSnapshot } from "../lib/p2p-view";
import { formatP2p, menuText, webAppUrl } from "./messages";

function snapshot(venue: "binance" | "bybit", liquidity: number): P2pSnapshot {
  return {
    venue,
    fetchedAt: "2026-09-24T07:00:00.000Z",
    asset: "USDT",
    activityHint: venue === "binance" ? "30 дней" : "недавние сделки",
    error: null,
    fiats: [
      {
        fiat: "TRY",
        title: "Лира",
        error: null,
        liquidityUsdt: liquidity,
        sampleSize: 20,
        trafficAds: 300,
        sellAds: 100,
        buyAds: 200,
        averageBuy: 50.5,
        averageSell: null,
        minBuy: 50,
        maxBuy: 51,
        minSell: null,
        maxSell: null,
        liquiditySellUsdt: 0,
        activity: 12,
        activitySell: 0,
        filledBuy: 100,
        filledSell: 0,
        payments: [],
        trafficScope: "market",
        bookScope: "full",
        buyBook: emptySideBook(),
        sellBook: emptySideBook(),
        depthBuy: { within1: 0, within2: liquidity, within5: 0, total: 0, ads: 0 },
        depthSell: { within1: 0, within2: 0, within5: 0, total: 0, ads: 0 },
      },
    ],
  };
}

test("P2P message has the four metrics and no spread", () => {
  const text = formatP2p("Binance", snapshot("binance", 40000));
  assert.match(text, /ликвидность/);
  assert.match(text, /трафик/);
  assert.match(text, /средняя покупка/);
  assert.match(text, /средняя продажа/);
  assert.match(text, /активность/);
  assert.doesNotMatch(text, /спред/i);
  assert.doesNotMatch(text, /Bybit/);
});

test("mini app url accepts only https", () => {
  assert.equal(webAppUrl("http://127.0.0.1:44721"), "");
  assert.equal(webAppUrl("https://terminal.example/app/"), "https://terminal.example/app");
  assert.match(menuText(true), /Открыть терминал/);
  assert.doesNotMatch(menuText(false), /Открыть терминал/);
});

test("Bybit message does not reuse Binance liquidity", () => {
  const text = formatP2p("Bybit", snapshot("bybit", 900));
  assert.match(text, /900/);
  assert.doesNotMatch(text, /40/);
});
