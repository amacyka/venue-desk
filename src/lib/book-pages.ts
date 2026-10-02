import type { P2pAd, P2pPage } from "./p2p-view";

const MAX_PAGES = 260;

export async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return out;
}

export function mergeBook(pages: P2pPage[], total: number, complete: boolean): P2pPage {
  const seen = new Set<string>();
  const ads: P2pAd[] = [];
  for (const page of pages) {
    for (const ad of page.ads) {
      if (ad.id) {
        if (seen.has(ad.id)) continue;
        seen.add(ad.id);
      }
      ads.push(ad);
    }
  }
  return { total, ads, truncated: !complete };
}

export async function loadWholeBook(
  load: (page: number) => Promise<P2pPage | string>,
  pageSize: number,
  concurrency = 6,
  maxPages = MAX_PAGES,
): Promise<P2pPage | string> {
  const first = await load(1);
  if (typeof first === "string") return first;
  const step =
    first.ads.length > 0 && first.ads.length < pageSize && first.total > first.ads.length ? first.ads.length : pageSize;
  const needed = Math.max(1, Math.ceil(first.total / step));
  const pages = Math.min(maxPages, MAX_PAGES, needed);
  if (pages === 1) return { ...first, truncated: false };
  const rest = await mapPool(
    Array.from({ length: pages - 1 }, (_, index) => index + 2),
    concurrency,
    load,
  );
  const ok: P2pPage[] = [first];
  let failed = false;
  for (const page of rest) {
    if (typeof page === "string") {
      failed = true;
      continue;
    }
    ok.push(page);
  }
  return mergeBook(ok, first.total, !failed && needed <= pages);
}
