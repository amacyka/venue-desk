import { after } from "next/server";
import { runFullBook } from "@/lib/full-book";
import { storeReady } from "@/lib/store";

// Called every ~15 minutes by cron-job.org: one slow pass over every page of the order books.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Answers at once (always 200) and works in the background. Add ?wait=1 to wait for the result.
export async function GET(request: Request) {
  const at = new Date().toISOString();
  if (!storeReady()) return Response.json({ ok: false, error: "Хранилище не подключено", at });
  if (new URL(request.url).searchParams.get("wait")) return Response.json({ ...(await runFullBook()), at });
  after(() => runFullBook().catch(() => undefined));
  return Response.json({ ok: true, started: true, at });
}
