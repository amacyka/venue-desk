import { loadBinance } from "@/lib/binance";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadBinance();
  return Response.json(snapshot);
}
