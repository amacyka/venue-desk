export type HttpResult = {
  ok: boolean;
  status: number;
  text: string;
};

export async function fetchText(url: string, init?: RequestInit, timeoutMs = 12000): Promise<HttpResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : "сеть недоступна";
    return { ok: false, status: 0, text: message };
  } finally {
    clearTimeout(timer);
  }
}

export function postJson(url: string, payload: unknown, timeoutMs = 12000): Promise<HttpResult> {
  return fetchText(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );
}

export function readJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
