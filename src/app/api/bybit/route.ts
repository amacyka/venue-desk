import { loadBybit } from "@/lib/bybit";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadBybit();
  return Response.json(snapshot);
}
