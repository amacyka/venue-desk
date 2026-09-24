import { loadBinanceP2p } from "../lib/binance-p2p";
import { loadBybitP2p } from "../lib/bybit-p2p";
import { formatP2p, menuText } from "./messages";

export type VenueId = "binance" | "bybit";

const TTL_MS = 20_000;
const cache = new Map<VenueId, { at: number; text: string }>();

export async function renderVenue(id: VenueId, fresh = false): Promise<string> {
  const hit = cache.get(id);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.text;
  const text =
    id === "binance"
      ? formatP2p("Binance", await loadBinanceP2p())
      : formatP2p("Bybit", await loadBybitP2p());
  cache.set(id, { at: Date.now(), text });
  return text;
}

export function renderMenu(hasApp = false): string {
  return menuText(hasApp);
}

export function isVenueId(value: string): value is VenueId {
  return value === "binance" || value === "bybit";
}
