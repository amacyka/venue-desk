// TEMPORARY: shows which per-ad fields each P2P API returns. Remove after the ad search is built.
import { fetchText, postJson, readJson } from "@/lib/http";
import { walletKey } from "@/lib/wallet-p2p";

export const dynamic = "force-dynamic";

export async function GET() {
  const [binance, bybit, wallet] = await Promise.all([
    postJson("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      asset: "USDT", fiat: "TRY", tradeType: "BUY", page: 1, rows: 3, payTypes: [],
    }),
    postJson("https://api2.bybit.com/fiat/otc/item/online", {
      tokenId: "USDT", currencyId: "RUB", side: "1", page: "1", size: "3",
    }),
    fetchText("https://p2p.walletbot.me/p2p/integration-api/v1/item/online", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": walletKey() },
      body: JSON.stringify({ cryptoCurrency: "USDT", fiatCurrency: "RUB", side: "SELL", page: 1, pageSize: 3 }),
    }),
  ]);
  const b = readJson(binance.text) as { data?: unknown[] } | null;
  const y = readJson(bybit.text) as { result?: { items?: unknown[] } } | null;
  const w = readJson(wallet.text) as { data?: unknown[] } | null;
  return Response.json({
    binance: { status: binance.status, sample: b?.data?.slice(0, 3) ?? binance.text.slice(0, 500) },
    bybit: { status: bybit.status, sample: y?.result?.items?.slice(0, 3) ?? bybit.text.slice(0, 500) },
    wallet: { status: wallet.status, sample: w?.data?.slice(0, 3) ?? wallet.text.slice(0, 500) },
  });
}
