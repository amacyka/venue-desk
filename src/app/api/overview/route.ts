import { isLiveVenue, isPeriod, SOURCE_META, type LiveVenueId, type PeriodId } from "@/config/sources";
import { presentBook, venueStatus, withinPeriod, type OverviewResponse } from "@/lib/overview";
import { loadVenueBooks } from "@/lib/p2p-feed";
import { readHistory } from "@/lib/p2p-history";

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
  const history = withinPeriod(await readHistory(), period).filter((point) => venues.includes(point.venue));
  const notes = [
    "Средняя цена — весь стакан: каждое объявление входит пропорционально остатку USDT. На Bybit первая страница списка в эту среднюю не входит. Если у рынка только одна страница, она остаётся в расчёте.",
    "Ликвидность — объём в пределах 1% от лучшей цены. С каждого объявления в эту сумму входит не больше 100 USDT и только если оно принимает такой набор. Число объявлений без фильтра оплаты — размер всего списка.",
    "Оборот завершённых сделок эти списки не отдают. Разница цен между площадками не гарантирует исполнение.",
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
    venues: loaded.map((venue) => {
      const markets = venue.books.flatMap((book) => {
        const market = presentBook(book, payment);
        return market ? [market] : [];
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
