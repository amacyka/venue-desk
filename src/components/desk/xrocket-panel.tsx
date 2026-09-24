"use client";

import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
import type { XrocketSnapshot } from "@/lib/xrocket";
import { OrderBook } from "./order-book";
import { useVenue } from "./use-venue";
import { VenuePanel } from "./venue-panel";

const FIAT_NAME: Record<string, string> = {
  RUB: "рубль",
  TRY: "лира",
  INR: "рупия",
};

export function XrocketPanel() {
  const venue = useVenue<XrocketSnapshot>("/api/xrocket", 20000);
  const data = venue.data;

  return (
    <VenuePanel
      id="xrocket"
      title="Хрокет"
      accent="venue-xrocket"
      kicker="Биржа xRocket"
      description="Стаканы пар Хрокета и его же курсы USDT к фиату. Курс — одна цена, это не книга Binance и не курс Крипто Бота."
      fetchedAt={data?.fetchedAt}
      loading={venue.loading}
      refreshing={venue.refreshing}
      error={venue.error}
      onRefresh={() => void venue.reload()}
    >
      {data ? (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-medium">Курсы USDT на Хрокете</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {data.rates.map((rate) => (
                <div key={rate.fiat} className="rounded-lg bg-muted/60 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">{FIAT_NAME[rate.fiat] ?? rate.fiat}</span>
                    <Badge variant="outline">{rate.fiat}</Badge>
                  </div>
                  {rate.rate ? (
                    <>
                      <p className="mt-2 font-mono text-xl">{formatPrice(rate.rate)}</p>
                      <p className="text-xs text-muted-foreground">
                        24ч {rate.change24h || "—"}% · одна цена, без объёма
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-destructive">{rate.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.books.map((book) => (
              <div key={book.symbol} className="rounded-lg border border-border p-3">
                <h3 className="mb-2 font-medium">{book.symbol}</h3>
                {book.error ? <p className="text-sm text-destructive">{book.error}</p> : <OrderBook bids={book.bids} asks={book.asks} />}
              </div>
            ))}
          </div>
          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            P2P-объявлений в Exchange API Хрокета нет. Ликвидность, поток и активность P2P отсюда не считаются и не
            берутся у Binance или Bybit. Изменение курса за 24 часа выше — это справочная цена Хрокета, не объём сделок.
          </p>
        </div>
      ) : null}
    </VenuePanel>
  );
}
