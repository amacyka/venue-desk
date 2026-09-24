import { loadCryptobot } from "@/lib/cryptobot";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadCryptobot();
  return Response.json(snapshot);
}
