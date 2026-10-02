import { after } from "next/server";
import { isLiveVenue, isPeriod, SOURCE_META, type LiveVenueId, type PeriodId } from "@/config/sources";
import { presentBook, venueStatus, withinPeriod, type OverviewResponse } from "@/lib/overview";
import { readFullHistory, summarizeFull } from "@/lib/full-book";
import { liquidityStats } from "@/lib/liquidity-stats";
import { loadVenueBooks } from "@/lib/p2p-feed";
import { readHistory } from "@/lib/p2p-history";
import { storeReady } from "@/lib/store";
import { marketKey, readAggregate, runSnapshot, summarize } from "@/lib/volume";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fresh = url.searchParams.get("fresh") === "1";
  const payment = (url.searchParams.get("payment") ?? "").trim();
  const period: PeriodId = isPeriod(url.searchParams.get("period") ?? "") ? (url.searchParams.get("period") as PeriodId) : "24h";
  const requested = (url.searchParams.get("venues") ?? "binance,bybit,wallet")
    .split(",")
    .map((item) => item.trim())
    .filter(isLiveVenue);
  const venues = requested.length ? [...new Set(requested)] : (["binance", "bybit", "wallet"] as LiveVenueId[]);

  const loaded = await Promise.all(venues.map((id) => loadVenueBooks(id, fresh)));
  const allHistory = (await readHistory(venues)).filter((point) => venues.includes(point.venue));
  const history = withinPeriod(allHistory, period);
  const tracking = storeReady();
  const [aggregate, fullHistory] = tracking ? await Promise.all([readAggregate(), readFullHistory()]) : ([null, null] as const);
  // Every visit also nudges the minute snapshot (a lock keeps it to one run per minute), so volume keeps
  // counting even between the external scheduler's calls.
  if (tracking) after(() => runSnapshot((id) => loadVenueBooks(id)).catch(() => undefined));
  const notes = [
    "Средняя цена — весь стакан: каждое объявление входит пропорционально остатку USDT. На Bybit первая страница списка в эту среднюю не входит. Если у рынка только одна страница, она остаётся в расчёте.",
    "Ликвидность — весь доступный USDT в объявлениях в пределах 2% от лучшей цены. У объявлений покупателей за каждым нет депозита, поэтому одно такое объявление считается не больше чем на 10 000 USDT. Число объявлений без фильтра оплаты — размер всего списка.",
    "Ликвидность за 24 часа — средняя, минимум и максимум по замерам раз в 10 минут за последние сутки (без фильтра оплаты). «Сутки назад» — замер ближе всего к этому же времени вчера.",
    tracking
      ? "Объём за 24 часа — оценка: сайт раз в минуту фотографирует стакан и складывает, насколько уменьшились остатки в объявлениях. Отменённые ордера (остаток вернулся в течение 30 минут) вычитаются, пополнения и удалённые объявления не считаются."
      : "Объём за 24 часа появится после подключения хранилища Upstash: сайту нужно где-то копить снимки стакана.",
    "Разница цен между площадками не гарантирует исполнение.",
  ];
  if (payment) {
    notes.push("Фильтр оплаты режет загруженный список. История графика копится без этого фильтра.");
  }

  const body: OverviewResponse = {
    ok: true,
    fetchedAt: new Date().toISOString(),
    asset: "USDT",
    payment,
    history,
    notes,
    volumeTracking: tracking ? "on" : "no-store",
    venues: loaded.map((venue) => {
      const markets = venue.books.flatMap((book) => {
        const market = presentBook(book, payment);
        if (!market) return [];
        const own = allHistory.filter((point) => point.venue === venue.id && point.fiat === market.fiat);
        market.liquidity24h = { buy: liquidityStats(own, "liquidityUsdt"), sell: liquidityStats(own, "liquiditySellUsdt") };
        market.fullBook = summarizeFull(fullHistory, `${venue.id}:${market.fiat}`);
        market.volume = {
          buy: summarize(aggregate, marketKey(venue.id, market.fiat, "buy")),
          sell: summarize(aggregate, marketKey(venue.id, market.fiat, "sell")),
        };
        return [market];
      });
      return {
        id: venue.id,
        name: SOURCE_META[venue.id].name,
        connected: true,
        status: venueStatus(markets, venue.error),
        error: venue.error,
        activityHint: venue.activityHint,
        fetchedAt: venue.fetchedAt,
        markets,
      };
    }),
  };

  return Response.json(body);
}
