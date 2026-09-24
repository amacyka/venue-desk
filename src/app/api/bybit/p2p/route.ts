import { loadBybitP2p } from "@/lib/bybit-p2p";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await loadBybitP2p());
}
