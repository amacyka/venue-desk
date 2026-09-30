// TEMPORARY: inspects Binance ad-detail remarks and the Bybit payment-name list. Remove after the ad search is built.
import { fetchText, postJson, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const UA = { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Mozilla/5.0" };

export async function GET() {
  const list = await postJson("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    asset: "USDT", fiat: "TRY", tradeType: "BUY", page: 1, rows: 5, payTypes: [],
  });
  const advNos = ((readJson(list.text) as { data?: { adv?: { advNo?: string } }[] } | null)?.data ?? [])
    .map((row) => row.adv?.advNo ?? "")
    .filter(Boolean);
  const details = await Promise.all(
    advNos.map(async (no) => {
      const res = await fetchText(`https://p2p.binance.com/bapi/c2c/v2/public/c2c/adv/detail?advNo=${encodeURIComponent(no)}`, { headers: UA });
      const data = (readJson(res.text) as { data?: Record<string, unknown> } | null)?.data ?? {};
      return { no, status: res.status, remarks: data.remarks, autoReplyMsg: data.autoReplyMsg, keys: Object.keys(data) };
    }),
  );
  const pay = await fetchText("https://api2.bybit.com/fiat/otc/configuration/queryAllPaymentList", { method: "POST", headers: UA, body: "{}" });
  const result = ((readJson(pay.text) as { result?: Record<string, unknown> } | null)?.result ?? {}) as Record<string, unknown>;
  const shapes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (Array.isArray(value)) shapes[key] = { length: value.length, first: value.slice(0, 3) };
    else if (typeof value === "string") shapes[key] = value.slice(0, 300);
    else shapes[key] = value;
  }
  const rub = typeof result.currencyPaymentIdMap === "string"
    ? (readJson(result.currencyPaymentIdMap) as Record<string, unknown> | null)?.RUB
    : null;
  return Response.json({ details, bybitKeys: Object.keys(result), shapes, rub });
}
