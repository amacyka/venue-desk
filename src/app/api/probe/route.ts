// TEMPORARY: checks Binance ad-detail endpoints and the Bybit payment-name list. Remove after the ad search is built.
import { fetchText, postJson, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const UA = { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Mozilla/5.0" };

async function sample(label: string, url: string, init?: RequestInit) {
  const res = await fetchText(url, init);
  return { label, status: res.status, hasRemarks: /"remarks"\s*:\s*"/.test(res.text), body: res.text.slice(0, 700) };
}

export async function GET() {
  const list = await postJson("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    asset: "USDT", fiat: "TRY", tradeType: "BUY", page: 1, rows: 1, payTypes: [],
  });
  const first = (readJson(list.text) as { data?: { adv?: { advNo?: string } }[] } | null)?.data?.[0]?.adv?.advNo ?? "";
  const n = encodeURIComponent(first);
  const checks = await Promise.all([
    sample("selected-adv GET", `https://p2p.binance.com/bapi/c2c/v2/public/c2c/adv/selected-adv/${n}`, { headers: UA }),
    sample("selected-adv POST", `https://p2p.binance.com/bapi/c2c/v2/public/c2c/adv/selected-adv/${n}`, { method: "POST", headers: UA, body: "{}" }),
    sample("friendly detail GET", `https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/detail?adNo=${n}`, { headers: UA }),
    sample("public detail GET", `https://p2p.binance.com/bapi/c2c/v2/public/c2c/adv/detail?advNo=${n}`, { headers: UA }),
    sample("v1 detail POST", "https://p2p.binance.com/bapi/c2c/v1/public/c2c/adv/detail", { method: "POST", headers: UA, body: JSON.stringify({ advNo: first }) }),
    sample("bybit payments", "https://api2.bybit.com/fiat/otc/configuration/queryAllPaymentList", { method: "POST", headers: UA, body: "{}" }),
  ]);
  return Response.json({ listStatus: list.status, advNo: first, checks });
}
