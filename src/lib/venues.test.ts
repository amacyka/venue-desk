import assert from "node:assert/strict";
import test from "node:test";
import { parseBinanceBook, parseBinanceInr, parseBinanceTickers } from "./binance";
import { parseBybitBook, parseBybitTicker } from "./bybit";
import { parseCryptobotRates } from "./cryptobot";
import { parseXrocketBook, parseXrocketRate } from "./xrocket";

test("Binance depth stays a USDTTRY book", () => {
  const book = parseBinanceBook({
    bids: [["48.83", "100"]],
    asks: [["48.84", "80"]],
  });
  assert.equal(book?.symbol, "USDTTRY");
  assert.equal(book?.bids[0]?.price, "48.83");
  assert.equal(parseBinanceBook({ rate: "48.85" }), null);
});

test("Binance INR 400 means the pair is absent", () => {
  assert.deepEqual(parseBinanceInr(400, { code: -1121, msg: "Invalid symbol." }), {
    listed: false,
    status: null,
    bid: null,
    ask: null,
  });
});

test("Binance tickers ignore a foreign rate object", () => {
  assert.deepEqual(parseBinanceTickers({ USDT: { rate: "84.8" } }), []);
  const rows = parseBinanceTickers({
    symbol: "BTCTRY",
    bidPrice: "1",
    askPrice: "2",
    bidQty: "3",
    askQty: "4",
  });
  assert.equal(rows[0]?.symbol, "BTCTRY");
});

test("Bybit ticker requires retCode 0", () => {
  assert.equal(parseBybitTicker({ error: "blocked" }), null);
  const ticker = parseBybitTicker({
    retCode: 0,
    result: { list: [{ symbol: "BTCUSDT", bid1Price: "1", ask1Price: "2", bid1Size: "3", ask1Size: "4" }] },
  });
  assert.equal(ticker?.symbol, "BTCUSDT");
  const book = parseBybitBook("BTCUSDT", {
    retCode: 0,
    result: { b: [["1", "2"]], a: [["3", "4"]] },
  });
  assert.equal(book?.asks[0]?.price, "3");
});

test("xRocket book and fiat rate stay on their own shapes", () => {
  const book = parseXrocketBook("BTC-USDT", { bids: [["1", "2"]], asks: [["3", "4"]] });
  assert.equal(book?.symbol, "BTC-USDT");
  assert.equal(parseXrocketBook("BTC-USDT", { symbol: "USDTTRY", bidPrice: "1" }), null);
  const rate = parseXrocketRate("TRY", { USDT: { rate: "48.85", rateChangePercent24h: "0.04" } });
  assert.equal(rate?.fiat, "TRY");
  assert.equal(rate?.rate, "48.85");
  assert.equal(parseXrocketRate("INR", { bids: [], asks: [] }), null);
});

test("Crypto Bot rates come only from its result list", () => {
  assert.equal(parseCryptobotRates({ USDT: { rate: "84" } }), null);
  const rates = parseCryptobotRates({
    ok: true,
    result: [{ source: "USDT", target: "RUB", rate: "84.5", is_valid: true, is_fiat: true }],
  });
  assert.equal(rates?.[0]?.target, "RUB");
  assert.equal(rates?.[0]?.isValid, true);
});
