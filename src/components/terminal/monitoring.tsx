"use client";

import { FIAT_META, SOURCE_META, isLiveVenue } from "@/config/sources";
import { formatCount, formatPct, formatPrice, formatUsdt } from "@/lib/format";
import { marketFailed, sideSlippage } from "@/lib/overview";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import Link from "next/link";
import { useMarket } from "./market";
import { favoriteKey, useFavorites } from "./storage";
import { CardSkeleton, PageIntro, Panel, StateBlock } from "./widgets";

export function MonitoringScreen() {
  const { data, status, error, reload, filters, query } = useMarket();
  const [favorites, setFavorites] = useFavorites();
  const venues = filters.venues.filter(isLiveVenue);

  return (
    <div className="grid gap-6">
      <PageIntro eyebrow="Мониторинг" title="Мониторинг рынка" text="Все рынки, которые площадка отдаёт: лира, рупия и, на Bybit, рубль. Это список объявлений, не лента сделок." />
      <p className="text-sm text-muted-foreground">Фильтр фиата сверху задаёт остальные экраны. Здесь видны рынки, которые площадка реально отдаёт: у Bybit есть и рубль.</p>
      {status === "loading" && !data ? <CardSkeleton /> : null}
      {status === "error" && !data ? <StateBlock title="Ошибка API" text={error ?? "Мониторинг не загрузился."} action={{ label: "Повторить", onClick: reload }} /> : null}
      {venues.length === 0 ? <StateBlock title="Нет живой площадки" text="Включите Binance или Bybit в фильтре биржи." /> : null}
      <div className="grid gap-3">
        {data
          ? venues.flatMap((id) => {
              const venue = data.venues.find((item) => item.id === id);
              if (!venue) return [<CardSkeleton key={id} />];
              if (venue.status === "error" && venue.markets.length === 0) {
                return [<StateBlock key={id} title={`${venue.name} недоступен`} text={venue.error ?? "Источник не ответил."} action={{ label: "Повторить", onClick: reload }} />];
              }
              return venue.markets.map((market) => {
                const favorite = { venue: id, fiat: market.fiat } as const;
                const saved = favorites.some((item) => favoriteKey(item) === favoriteKey(favorite));
                const failed = marketFailed(market.view);
                const href = `/analytics?${new URLSearchParams({ ...(query ? Object.fromEntries(new URLSearchParams(query)) : {}), venues: id, fiat: market.fiat }).toString()}`;
                return (
                  <Panel key={`${id}-${market.fiat}`} className={cn("p-4", market.fiat === filters.fiat && "ring-1 ring-primary/40")}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-medium">
                          {SOURCE_META[id].name} · {FIAT_META[market.fiat].name}
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">{failed ? "Источник недоступен" : venue.status === "empty" ? "Нет данных" : "Подключён"}</p>
                      </div>
                      <button
                        type="button"
                        aria-pressed={saved}
                        aria-label={saved ? "Убрать из избранного" : "В избранное"}
                        className="inline-flex size-11 items-center justify-center"
                        onClick={() =>
                          setFavorites((current) => (saved ? current.filter((item) => favoriteKey(item) !== favoriteKey(favorite)) : [...current, favorite]))
                        }
                      >
                        <Star className={cn("size-4", saved && "fill-primary text-primary")} />
                      </button>
                    </div>
                    {failed ? (
                      <p className="mt-3 text-sm text-destructive">{market.view.error || venue.error}</p>
                    ) : (
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                        <Field label="Средняя покупка" value={market.view.averageBuy === null ? "—" : `${formatPrice(String(market.view.averageBuy))}`} />
                        <Field label="К лучшей, покупка" value={slip(market.view, "buy")} />
                        <Field label="Средняя продажа" value={market.view.averageSell === null ? "—" : `${formatPrice(String(market.view.averageSell))}`} />
                        <Field label="К лучшей, продажа" value={slip(market.view, "sell")} />
                        <Field label="Ликвидность" value={`${formatUsdt(market.view.liquidityUsdt + market.view.liquiditySellUsdt)} USDT`} />
                        <Field label="Объявления" value={formatCount(market.view.trafficAds)} />
                      </dl>
                    )}
                    <Link href={href} className="mt-4 inline-flex min-h-11 items-center text-sm text-primary">
                      Открыть аналитику
                    </Link>
                  </Panel>
                );
              });
            })
          : null}
      </div>
    </div>
  );
}

function slip(view: Parameters<typeof sideSlippage>[0], side: "buy" | "sell") {
  const value = sideSlippage(view, side);
  return value === null ? "—" : formatPct(value);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono">{value}</dd>
    </div>
  );
}
