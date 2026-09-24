export type Level = { price: string; qty: string };

export function parseLevels(rows: unknown, limit = 8): Level[] {
  if (!Array.isArray(rows)) return [];
  const out: Level[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const price = String(row[0] ?? "");
    const qty = String(row[1] ?? "");
    if (!price || !qty) continue;
    out.push({ price, qty });
    if (out.length >= limit) break;
  }
  return out;
}
