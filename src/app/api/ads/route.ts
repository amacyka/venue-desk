import { isFiat, isLiveVenue } from "@/config/sources";
import { searchAds, type AdSide } from "@/lib/ads/collect";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const venue = url.searchParams.get("venue") ?? "bybit";
  const fiat = url.searchParams.get("fiat") ?? "RUB";
  const side: AdSide = url.searchParams.get("side") === "sell" ? "sell" : "buy";
  if (!isLiveVenue(venue) || !isFiat(fiat)) {
    return Response.json({ error: "Неизвестная площадка или валюта" }, { status: 400 });
  }
  return Response.json(await searchAds(venue, fiat, side, url.searchParams.get("fresh") === "1"));
}
