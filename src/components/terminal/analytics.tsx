"use client";

import { FIAT_META, isLiveVenue, supportsFiat, unsupportedFiatCopy } from "@/config/sources";
import { useMarket } from "./market";
import { BookReading } from "./reading";
import { CardSkeleton, PageIntro, Panel, SeriesChart, StateBlock, focusHistory } from "./widgets";

export function AnalyticsScreen() {
  const { data, status, error, reload, filters } = useMarket();
  const venues = filters.venues.filter(isLiveVenue);

  return (
    <div className="grid gap-6">
      <PageIntro
        eyebrow="Аналитика"
        title="Рыночная динамика"
        text={`Срезы ${filters.asset}/${filters.fiat}, ${FIAT_META[filters.fiat].name}. Линии строятся только из сохранённых ответов.`}
      />
      {filters.payment ? (
        <p className="text-sm text-muted-foreground">Фильтр оплаты на график не влияет: история копится по всему доступному списку.</p>
      ) : null}
      {status === "loading" && !data ? <CardSkeleton /> : null}
      {status === "error" && !data ? (
        <StateBlock title="Ошибка API" text={error ?? "История не загрузилась."} action={{ label: "Повторить", onClick: reload }} />
      ) : null}
      {venues.length === 0 ? <StateBlock title="Нет живой площадки" text="В фильтре «Биржа» включите Binance или Bybit." /> : null}
      {data
        ? venues.map((id) => {
            const venue = data.venues.find((item) => item.id === id);
            if (!supportsFiat(id, filters.fiat)) {
              return <StateBlock key={id} title={venue?.name ?? id} text={unsupportedFiatCopy(id, filters.fiat)} />;
            }
            const market = venue?.markets.find((item) => item.fiat === filters.fiat);
            const points = focusHistory(data.history, id, filters.fiat);
            const times = points.map((point) => point.at);
            return (
              <section key={id} className="grid gap-3">
                <h2 className="text-sm font-medium">{venue?.name ?? id}</h2>
                {venue?.status === "error" ? <p className="text-sm text-destructive">{venue.error ?? "Источник недоступен. Старые срезы, если они есть, остаются на графике."}</p> : null}
                {market ? <BookReading fiat={filters.fiat} buy={market.view.buyBook} sell={market.view.sellBook} /> : <CardSkeleton />}
                <div className="grid gap-3 xl:grid-cols-2">
                  <SeriesChart title="Средняя цена покупки" caption="Весь стакан продавцов, вес по остатку USDT. На Bybit первая страница не входит." unit={filters.fiat} period={filters.period} times={times} series={[{ name: "Покупка", color: "#3ecf8e", values: points.map((point) => point.averageBuy) }]} />
                  <SeriesChart title="Средняя цена продажи" caption="Весь стакан покупателей, вес по остатку USDT. На Bybit первая страница не входит." unit={filters.fiat} period={filters.period} times={times} series={[{ name: "Продажа", color: "#9aa3ab", values: points.map((point) => point.averageSell) }]} />
                  <SeriesChart
                    title="Разница средних"
                    caption="Покупка минус продажа по средней всего стакана. Это не обещание сделки."
                    unit={filters.fiat}
                    period={filters.period}
                    times={times}
                    series={[{ name: "Разница", color: "#d7f7e8", values: points.map((point) => (point.averageBuy === null || point.averageSell === null ? null : point.averageBuy - point.averageSell)) }]}
                  />
                  <SeriesChart
                    title="Отклонение от лучшей цены"
                    caption="Насколько набор 100 USDT хуже лучшего объявления. Покупка дорожает, продажа дешевеет."
                    unit="%"
                    period={filters.period}
                    times={times}
                    series={[
                      { name: "Покупка", color: "#3ecf8e", values: points.map((point) => point.slippageBuy ?? null) },
                      { name: "Продажа", color: "#8b939c", values: points.map((point) => point.slippageSell ?? null) },
                    ]}
                  />
                  <SeriesChart
                    title="Ликвидность"
                    caption="USDT в пределах 1% от лучшей цены, отдельно к покупке и к продаже."
                    unit="USDT"
                    period={filters.period}
                    times={times}
                    series={[
                      { name: "К покупке", color: "#3ecf8e", values: points.map((point) => point.liquidityUsdt) },
                      { name: "К продаже", color: "#8b939c", values: points.map((point) => point.liquiditySellUsdt) },
                    ]}
                  />
                </div>
                <Panel className="p-4 md:p-5">
                  <h3 className="text-sm font-medium">Объём торгов</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Публичный список объявлений не отдаёт фактический оборот завершённых сделок. График объёма не строится и не заполняется ликвидностью объявлений.
                  </p>
                </Panel>
              </section>
            );
          })
        : null}
    </div>
  );
}
