"use client";

import { FIAT_META, SOURCE_META, isLiveVenue } from "@/config/sources";
import { formatPrice, formatUsdt } from "@/lib/format";
import { marketFailed } from "@/lib/overview";
import Link from "next/link";
import { useMarket } from "./market";
import { favoriteKey, useFavorites } from "./storage";
import { PageIntro, Panel, StateBlock } from "./widgets";

export function FavoritesScreen() {
  const { data, filters, setFilter, query } = useMarket();
  const [favorites, setFavorites, ready] = useFavorites();

  return (
    <div className="grid gap-6">
      <PageIntro eyebrow="Избранное" title="Избранное" text="Рынки, которые вы отметили на этом устройстве." />
      {!ready ? <Panel className="h-24 animate-pulse" /> : null}
      {ready && favorites.length === 0 ? (
        <StateBlock title="Пока пусто" text="Отметьте рынок звездой на главной или в мониторинге. Список хранится в браузере." />
      ) : null}
      <div className="grid gap-3">
        {favorites.map((item) => {
          const venue = data?.venues.find((entry) => entry.id === item.venue);
          const market = venue?.markets.find((entry) => entry.fiat === item.fiat);
          const visible = filters.venues.includes(item.venue);
          const failed = Boolean(market && marketFailed(market.view));
          const href = `/analytics?${new URLSearchParams({ ...(query ? Object.fromEntries(new URLSearchParams(query)) : {}), venues: item.venue, fiat: item.fiat }).toString()}`;
          return (
            <Panel key={favoriteKey(item)} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-medium">
                  {SOURCE_META[item.venue].name} · {FIAT_META[item.fiat].name}
                </h2>
                <button
                  type="button"
                  className="min-h-11 text-sm text-muted-foreground"
                  onClick={() => setFavorites((current) => current.filter((entry) => favoriteKey(entry) !== favoriteKey(item)))}
                >
                  Убрать
                </button>
              </div>
              {!visible || !isLiveVenue(item.venue) ? (
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground">Площадка выключена фильтром. Цифры не подменяются.</p>
                  <button type="button" className="mt-3 min-h-11 text-sm text-primary" onClick={() => setFilter({ venues: [...filters.venues, item.venue], fiat: item.fiat })}>
                    Показать в срезе
                  </button>
                </div>
              ) : failed || !market ? (
                <p className="mt-3 text-sm text-destructive">{market?.view.error || venue?.error || "Нет данных по этому рынку."}</p>
              ) : (
                <p className="mt-3 font-mono text-sm">
                  покупка {market.view.averageBuy === null ? "—" : formatPrice(String(market.view.averageBuy))} · продажа{" "}
                  {market.view.averageSell === null ? "—" : formatPrice(String(market.view.averageSell))} · {formatUsdt(market.view.liquidityUsdt)} USDT
                </p>
              )}
              <Link href={href} className="mt-3 inline-flex min-h-11 items-center text-sm text-primary">
                Открыть аналитику
              </Link>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
