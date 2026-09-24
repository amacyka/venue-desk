import { loadBinanceP2p } from "@/lib/binance-p2p";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await loadBinanceP2p());
}
