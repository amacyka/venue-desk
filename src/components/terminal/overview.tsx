"use client";

import { Button } from "@/components/ui/button";
import { FIAT_META, SOURCE_IDS, SOURCE_META, isLiveVenue, periodById, supportsFiat, unsupportedFiatCopy, type LiveVenueId, type SourceId } from "@/config/sources";
import { formatCount, formatPrice, formatUsdt } from "@/lib/format";
import { marketFailed, paymentLabel, sideLiquidity, type VenuePayload } from "@/lib/overview";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import Link from "next/link";
import { useMarket } from "./market";
import { favoriteKey, useFavorites, type Favorite } from "./storage";
import { BookReading } from "./reading";
import { CardSkeleton, MetricCard, PageIntro, Panel, StateBlock, changeFor, focusHistory } from "./widgets";

export function OverviewScreen() {
  const { status, data, error, reload, filters } = useMarket();
  const live = filters.venues.filter(isLiveVenue);

  return (
    <div className="grid gap-6">
      <PageIntro eyebrow="Обзор" title="P2P Market Overview" text="Аналитика рынка в реальном времени" />
      {error ? (
        <p className="rounded-[12px] border border-destructive/40 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}
      {status === "loading" && !data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : null}
      {status === "error" && !data ? (
        <StateBlock title="Ошибка API" text={error ?? "Срез не загрузился."} action={{ label: "Повторить", onClick: reload }} />
      ) : null}
      {live.length > 1 ? (
        <p className="text-sm text-muted-foreground">Площадки не смешиваются. Ниже отдельный срез каждой выбранной.</p>
      ) : null}
      {data
        ? live.map((id) => {
            const venue = data.venues.find((item) => item.id === id);
            if (!venue) return <CardSkeleton key={id} />;
            return <VenueBlock key={id} venue={venue} />;
          })
        : null}
      {data ? <ExchangeBoard /> : null}
      {data?.notes.length ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer text-foreground">Как считаются цифры</summary>
          <ul className="mt-3 grid gap-2">
            {data.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function VenueBlock({ venue }: { venue: VenuePayload }) {
  const { filters, data, reload } = useMarket();
  const market = venue.markets.find((item) => item.fiat === filters.fiat);
  const period = periodById(filters.period).label;
  const points = focusHistory(data?.history ?? [], venue.id, filters.fiat);

  if (!supportsFiat(venue.id, filters.fiat)) {
    return <StateBlock title={`${venue.name} · ${FIAT_META[filters.fiat].name}`} text={unsupportedFiatCopy(venue.id, filters.fiat)} />;
  }

  if (!market || marketFailed(market.view) || (venue.status === "error" && market.view.averageBuy === null && market.view.averageSell === null)) {
    return (
      <StateBlock
        title={`${venue.name} · источник недоступен`}
        text={market?.view.error || venue.error || "Список объявлений не ответил. Предыдущие цифры не подменяются оценкой."}
        action={{ label: "Повторить", onClick: reload }}
      />
    );
  }

  const filteredEmpty =
    Boolean(data?.payment) && market.view.sampleSize === 0 && market.view.averageBuy === null && market.view.averageSell === null;
  if (filteredEmpty) {
    return (
      <StateBlock
        title={`${venue.name} · нет данных`}
        text={`В загруженном списке нет способа оплаты «${paymentLabel(data?.payment ?? "")}». Для Bybit в списке коды, не названия банков.`}
      />
    );
  }

  const view = market.view;
  const fiat = filters.fiat;
  const buyLiquidity = sideLiquidity(view, "buy");
  const sellLiquidity = sideLiquidity(view, "sell");
  const focusLiquidity = filters.side === "buy" ? buyLiquidity : sellLiquidity;
  const depth = (filters.side === "buy" ? view.depthBuy : view.depthSell) ?? { within1: 0, within2: 0, within5: 0, total: 0, ads: 0 };
  const day = (filters.side === "buy" ? market.liquidity24h?.buy : market.liquidity24h?.sell) ?? null;
  const dayDelta = day?.dayAgo ? ((focusLiquidity - day.dayAgo) / day.dayAgo) * 100 : null;
  const liquidityHint = day
    ? `Средняя за ${day.hours < 24 ? `${day.hours} ч — данные копятся до суток` : "последние 24 часа"}: ${
        filters.side === "buy" ? "USDT у продавцов" : "USDT у покупателей (до 10 000 с объявления)"
      } в пределах 2% от лучшей цены. Замер раз в 10 минут${data?.payment ? ", без фильтра оплаты" : ""}.`
    : filters.side === "buy"
      ? "Сколько USDT продавцы выставили в пределах 2% от лучшей цены. Средняя за сутки появится, когда накопятся замеры."
      : "Сколько USDT покупатели готовы купить в пределах 2% от лучшей цены (до 10 000 с одного объявления). Средняя за сутки появится, когда накопятся замеры.";
  const volume = filters.side === "buy" ? market.volume?.buy ?? null : market.volume?.sell ?? null;
  const otherVolume = filters.side === "buy" ? market.volume?.sell ?? null : market.volume?.buy ?? null;
  const volumeHint =
    data?.volumeTracking !== "on"
      ? "Биржи не отдают оборот. Чтобы сайт считал его сам по снимкам стакана, нужно подключить хранилище (Upstash в Vercel)."
      : volume
        ? `Оценка по снимкам стакана раз в минуту: на сколько уменьшились остатки в объявлениях, отмены вычтены.${volume.hours < 24 ? ` Данные пока за ${volume.hours} ч.` : ""}`
        : "Снимки стакана копятся — первые цифры появятся через пару минут.";
  const price = (value: number | null) => (value === null ? "—" : formatPrice(String(value)));

  return (
    <section className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">
          {venue.name} · {FIAT_META[fiat].name}
        </h2>
        <p className="text-xs text-muted-foreground">
          {view.trafficScope === "sample" ? "фильтр оплаты внутри списка" : "средняя — весь стакан, вес по остатку"}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Ликвидность"
          period="24 часа"
          value={formatUsdt(day ? day.avg : focusLiquidity)}
          unit="USDT"
          hint={liquidityHint}
          delta={day ? dayDelta : changeFor(points, filters.side === "buy" ? "liquidityUsdt" : "liquiditySellUsdt", focusLiquidity)}
          series={points.map((point) => (filters.side === "buy" ? point.liquidityUsdt : point.liquiditySellUsdt))}
          rows={[
            { label: "Сейчас", value: `${formatUsdt(focusLiquidity)} USDT` },
            { label: "Минимум за сутки", value: day ? `${formatUsdt(day.min)} USDT · ${clock(day.minAt)}` : "—" },
            { label: "Максимум за сутки", value: day ? `${formatUsdt(day.max)} USDT · ${clock(day.maxAt)}` : "—" },
            { label: "Сутки назад", value: day?.dayAgo != null ? `${formatUsdt(day.dayAgo)} USDT` : "ещё нет замера" },
            { label: "Сейчас в пределах 1% / 5%", value: `${formatUsdt(depth.within1)} / ${formatUsdt(depth.within5)}` },
            { label: "Весь стакан", value: `${formatUsdt(depth.total)} USDT` },
            {
              label: view.trafficScope === "sample" ? "Объявлений в выборке" : "Активных объявлений",
              value: formatCount(view.trafficAds),
            },
          ]}
        />
        <MetricCard
          label="Объём торгов"
          period="24 часа"
          value={volume ? formatUsdt(volume.usdt) : "—"}
          unit={volume ? "USDT" : undefined}
          hint={volumeHint}
          series={[]}
          rows={[
            { label: "В фиате", value: volume ? `${formatUsdt(volume.fiat)} ${fiat}` : "—" },
            { label: filters.side === "buy" ? "Продали покупателям" : "Купили у продавцов", value: otherVolume ? `${formatUsdt(otherVolume.usdt)} USDT` : "—" },
            { label: "Сделок (оценка)", value: volume ? formatCount(volume.fills) : "—" },
            { label: "Изменений объявлений", value: volume ? formatCount(volume.changes) : "—" },
            { label: "Активность мерчантов", value: formatCount(filters.side === "buy" ? view.activity : view.activitySell) },
          ]}
        />
        <MetricCard
          label="Средняя цена покупки"
          period={period}
          value={price(view.averageBuy)}
          unit={view.averageBuy === null ? undefined : fiat}
          hint="Весь стакан продавцов: цена умножается на остаток USDT. На Bybit первая страница в эту среднюю не входит."
          delta={changeFor(points, "averageBuy", view.averageBuy)}
          series={points.map((point) => point.averageBuy)}
          active={filters.side === "buy"}
          rows={[
            { label: "Лучшая", value: price(view.minBuy) },
            { label: "Край набора", value: price(view.maxBuy) },
          ]}
        />
        <MetricCard
          label="Средняя цена продажи"
          period={period}
          value={price(view.averageSell)}
          unit={view.averageSell === null ? undefined : fiat}
          hint="Весь стакан покупателей: цена умножается на остаток USDT. На Bybit первая страница в эту среднюю не входит."
          delta={changeFor(points, "averageSell", view.averageSell)}
          series={points.map((point) => point.averageSell)}
          active={filters.side === "sell"}
          rows={[
            { label: "Лучшая", value: price(view.maxSell) },
            { label: "Край набора", value: price(view.minSell) },
          ]}
        />
      </div>
      <BookReading fiat={fiat} buy={view.buyBook} sell={view.sellBook} />
      {view.error ? <p className="text-xs text-destructive">{view.error}</p> : null}
      <p className="text-xs leading-5 text-muted-foreground">{venue.activityHint}</p>
    </section>
  );
}

function ExchangeBoard() {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-base font-medium">Биржи и P2P-рынки</h2>
        <p className="mt-1 text-sm text-muted-foreground">Пять источников. Цифры есть только там, где подключён список объявлений.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {SOURCE_IDS.map((id) => (
          <SourceCard key={id} id={id} />
        ))}
      </div>
    </section>
  );
}

function SourceCard({ id }: { id: SourceId }) {
  const meta = SOURCE_META[id];
  const { data, filters, setFilter, query, reload } = useMarket();
  const [favorites, setFavorites] = useFavorites();
  const venue = isLiveVenue(id) ? data?.venues.find((item) => item.id === id) : undefined;
  const market = venue?.markets.find((item) => item.fiat === filters.fiat);
  const selected = filters.venues.includes(id);
  const favorite: Favorite | null = isLiveVenue(id) ? { venue: id, fiat: filters.fiat } : null;
  const saved = favorite ? favorites.some((item) => favoriteKey(item) === favoriteKey(favorite)) : false;
  const supported = !isLiveVenue(id) || supportsFiat(id, filters.fiat);
  const failed = Boolean(supported && venue && (venue.status === "error" || (market && marketFailed(market.view))));
  const analyticsHref = `/analytics?${new URLSearchParams({
    ...(query ? Object.fromEntries(new URLSearchParams(query)) : {}),
    venues: id,
    fiat: filters.fiat,
  }).toString()}`;

  return (
    <Panel className="p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-border bg-background font-mono text-sm">{meta.mark}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{meta.name}</h3>
            {favorite ? (
              <button
                type="button"
                aria-pressed={saved}
                aria-label={saved ? "Убрать из избранного" : "В избранное"}
                onClick={() =>
                  setFavorites((current) =>
                    saved ? current.filter((item) => favoriteKey(item) !== favoriteKey(favorite)) : [...current, favorite],
                  )
                }
                className="inline-flex size-11 items-center justify-center rounded-[12px] text-muted-foreground hover:text-foreground"
              >
                <Star className={cn("size-4", saved && "fill-primary text-primary")} />
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {!meta.connected ? "Источник не подключён" : !selected ? "Не в текущем срезе" : !supported ? "Этот фиат не подключён" : failed ? "Источник недоступен" : venue?.status === "empty" ? "Нет данных" : "Подключён"}
          </p>
        </div>
      </div>
      {!meta.connected ? (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{meta.reason}</p>
      ) : !selected ? (
        <p className="mt-4 text-sm text-muted-foreground">Цены этой площадки не подставляются из другой.</p>
      ) : isLiveVenue(id) && !supportsFiat(id, filters.fiat) ? (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{unsupportedFiatCopy(id, filters.fiat)}</p>
      ) : !market ? (
        <p className="mt-4 text-sm text-destructive">{venue?.error ?? "В ответе нет этого рынка."}</p>
      ) : failed ? (
        <p className="mt-4 text-sm text-destructive">{market.view.error || venue?.error}</p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Средняя покупка</dt>
            <dd className="mt-1 font-mono">{market.view.averageBuy === null ? "—" : `${formatPrice(String(market.view.averageBuy))} ${filters.fiat}`}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Средняя продажа</dt>
            <dd className="mt-1 font-mono">{market.view.averageSell === null ? "—" : `${formatPrice(String(market.view.averageSell))} ${filters.fiat}`}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Ликвидность</dt>
            <dd className="mt-1 font-mono">{formatUsdt(market.view.liquidityUsdt + market.view.liquiditySellUsdt)} USDT</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Объявления</dt>
            <dd className="mt-1 font-mono">{formatCount(market.view.trafficAds)}</dd>
          </div>
        </dl>
      )}
      <div className="mt-4">
        {!meta.connected ? (
          <Link href="/settings#sources" className="inline-flex min-h-11 items-center text-sm text-primary">
            Настроить
          </Link>
        ) : !selected ? (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setFilter({ venues: [...filters.venues, id as LiveVenueId] })}>
            Показать в срезе
          </Button>
        ) : isLiveVenue(id) && !supportsFiat(id, filters.fiat) ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setFilter({ venues: filters.venues.includes("bybit") ? filters.venues : [...filters.venues, "bybit"] })}
          >
            Смотреть на Bybit
          </Button>
        ) : failed || !market ? (
          <Button type="button" variant="outline" className="min-h-11" onClick={reload}>
            Повторить
          </Button>
        ) : (
          <Link href={analyticsHref} className="inline-flex min-h-11 items-center text-sm text-primary">
            Открыть аналитику
          </Link>
        )}
      </div>
    </Panel>
  );
}

// "14:20" for today, "вчера 14:20" for yesterday — in the viewer's own time zone.
function clock(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return at.toDateString() === new Date().toDateString() ? time : `вчера ${time}`;
}
