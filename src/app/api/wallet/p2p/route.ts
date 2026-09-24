import { loadWalletP2p } from "@/lib/wallet-p2p";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await loadWalletP2p());
}
