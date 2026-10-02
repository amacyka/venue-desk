import { after } from "next/server";
import { runFullBook } from "@/lib/full-book";
import { loadVenueBooks } from "@/lib/p2p-feed";
import { storeReady } from "@/lib/store";
import { runSnapshot } from "@/lib/volume";

// Called about once a minute by an external scheduler (cron-job.org) to keep the volume estimate going.
// It only reads public order books; a lock inside runSnapshot ignores calls that come too often.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Answers at once (always 200, so the scheduler neither times out nor switches the job off)
// and takes the snapshot in the background. Add ?wait=1 to wait for the result.
export async function GET(request: Request) {
  const at = new Date().toISOString();
  if (!storeReady()) return Response.json({ ok: false, error: "Хранилище не подключено", at });
  const job = () => runSnapshot((id) => loadVenueBooks(id, true));
  if (new URL(request.url).searchParams.get("wait")) return Response.json({ ...(await job()), at });
  after(job);
  // The slow whole-book pass rides on the same call; its own lock keeps it to once per 15 minutes.
  after(() => runFullBook().catch(() => undefined));
  return Response.json({ ok: true, started: true, at });
}
