import { loadXrocket } from "@/lib/xrocket";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadXrocket();
  return Response.json(snapshot);
}
