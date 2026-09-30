// Tiny client for Upstash Redis over its REST API (no extra npm package).
// Vercel's "Upstash for Redis" integration injects KV_REST_API_URL / KV_REST_API_TOKEN;
// a database created on upstash.com directly uses UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.

function creds(): { url: string; token: string } | null {
  const url = (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "").trim();
  const token = (process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export function storeReady(): boolean {
  return creds() !== null;
}

type Command = Array<string | number>;

// Runs several commands in one round trip. Returns each command's result (or null on error).
export async function pipeline(commands: Command[]): Promise<unknown[]> {
  const c = creds();
  if (!c || !commands.length) return commands.map(() => null);
  try {
    const res = await fetch(`${c.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!res.ok) return commands.map(() => null);
    const body = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    return body.map((item) => (item && !item.error ? (item.result ?? null) : null));
  } catch {
    return commands.map(() => null);
  }
}

export async function getJson<T>(keys: string[]): Promise<Array<T | null>> {
  const raw = await pipeline(keys.map((key) => ["GET", key]));
  return raw.map((value) => {
    if (typeof value !== "string") return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  });
}

export async function setJson(entries: Array<[string, unknown]>): Promise<void> {
  await pipeline(entries.map(([key, value]) => ["SET", key, JSON.stringify(value)]));
}
