import { loadVenueBooks } from "@/lib/p2p-feed";
import { runSnapshot } from "@/lib/volume";

// Called about once a minute by an external scheduler (cron-job.org) to keep the volume estimate going.
// It only reads public order books; a lock inside runSnapshot ignores calls that come too often.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const result = await runSnapshot((id) => loadVenueBooks(id, true));
  return Response.json({ ...result, at: new Date().toISOString() }, { status: result.ok ? 200 : 503 });
}
