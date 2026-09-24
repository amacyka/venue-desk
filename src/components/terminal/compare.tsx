"use client";

import { FIAT_META, isLiveVenue, supportsFiat, unsupportedFiatCopy } from "@/config/sources";
import { formatClock, formatCount, formatPct, formatPrice, formatUsdt } from "@/lib/format";
import { marketFailed, sideAds, sideBest, sideLiquidity, sidePrice, sideSlippage } from "@/lib/overview";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useMarket } from "./market";
import { CardSkeleton, PageIntro, Panel, StateBlock } from "./widgets";

type SortKey = "price" | "liquidity" | "ads";

export function CompareScreen() {
  const { data, status, error, reload, filters } = useMarket();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "price", dir: "asc" });
  const rows = useMemo(() => {
    return filters.venues.filter(isLiveVenue).map((id) => {
      const venue = data?.venues.find((item) => item.id === id);
      const market = venue?.markets.find((item) => item.fiat === filters.fiat);
      const unsupported = !supportsFiat(id, filters.fiat);
      const failed = unsupported || !venue || !market || marketFailed(market.view) || venue.status === "error";
      return {
        id,
        name: venue?.name ?? id,
        failed,
        error: unsupported ? unsupportedFiatCopy(id, filters.fiat) : market?.view.error || venue?.error || null,
        price: market && !failed ? sidePrice(market.view, filters.side) : null,
        best: market && !failed ? sideBest(market.view, filters.side) : null,
        slippage: market && !failed ? sideSlippage(market.view, filters.side) : null,
        liquidity: market && !failed ? sideLiquidity(market.view, filters.side) : null,
        ads: market && !failed ? sideAds(market.view, filters.side) : null,
        at: venue?.fetchedAt ?? null,
      };
    });
  }, [data, filters.fiat, filters.side, filters.venues]);

  const ordered = [...rows].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return sort.dir === "asc" ? left - right : right - left;
  });
  const prices = ordered.map((row) => row.price).filter((price): price is number => price !== null);
  const marked = prices.length < 2 ? null : filters.side === "buy" ? Math.min(...prices) : Math.max(...prices);
  const gap = prices.length < 2 ? null : Math.max(...prices) - Math.min(...prices);

  function toggle(key: SortKey) {
    setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="grid gap-6">
      <PageIntro
        eyebrow="Сравнение"
        title="Сравнение"
        text={`${filters.asset} · ${FIAT_META[filters.fiat].name} · ${filters.side === "buy" ? "покупка" : "продажа"}`}
      />
      {status === "loading" && !data ? <CardSkeleton /> : null}
      {status === "error" && !data ? (
        <StateBlock title="Ошибка API" text={error ?? "Сравнение не загрузилось."} action={{ label: "Повторить", onClick: reload }} />
      ) : null}
      {data ? (
        <Panel className="overflow-hidden">
          <div className="hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 font-medium">Биржа</th>
                  <SortHead label="Средняя цена" active={sort.key === "price"} onClick={() => toggle("price")} />
                  <th className="px-4 py-3 font-medium">Лучшая цена</th>
                  <th className="px-4 py-3 font-medium">К лучшей</th>
                  <SortHead label="Доступный объём" active={sort.key === "liquidity"} onClick={() => toggle("liquidity")} />
                  <SortHead label="Объявления" active={sort.key === "ads"} onClick={() => toggle("ads")} />
                  <th className="px-4 py-3 font-medium">Обновление</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-4">{row.name}</td>
                    <td className={cn("px-4 py-4 font-mono", row.price !== null && row.price === marked && "text-primary")}>
                      {row.failed ? "недоступна" : money(row.price, filters.fiat)}
                    </td>
                    <td className="px-4 py-4 font-mono">{row.failed ? "—" : money(row.best, filters.fiat)}</td>
                    <td className="px-4 py-4 font-mono">{row.slippage === null ? "—" : formatPct(row.slippage)}</td>
                    <td className="px-4 py-4 font-mono">{row.liquidity === null ? "—" : `${formatUsdt(row.liquidity)} USDT`}</td>
                    <td className="px-4 py-4 font-mono">{row.ads === null ? "—" : formatCount(row.ads)}</td>
                    <td className="px-4 py-4 text-muted-foreground">{row.at ? formatClock(row.at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 md:hidden">
            {ordered.map((row) => (
              <article key={row.id} className="rounded-[12px] border border-border p-3">
                <h2 className="text-sm font-medium">{row.name}</h2>
                <dl className="mt-3 grid gap-2 text-sm">
                  <Pair label="Средняя цена" value={row.failed ? "недоступна" : money(row.price, filters.fiat)} mark={row.price !== null && row.price === marked} />
                  <Pair label="Лучшая цена" value={row.failed ? "—" : money(row.best, filters.fiat)} />
                  <Pair label="К лучшей" value={row.slippage === null ? "—" : formatPct(row.slippage)} />
                  <Pair label="Доступный объём" value={row.liquidity === null ? "—" : `${formatUsdt(row.liquidity)} USDT`} />
                  <Pair label="Объявления" value={row.ads === null ? "—" : formatCount(row.ads)} />
                  <Pair label="Обновление" value={row.at ? formatClock(row.at) : "—"} />
                </dl>
                {row.error ? <p className="mt-2 text-xs text-destructive">{row.error}</p> : null}
              </article>
            ))}
          </div>
          <p className="border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground">
            {gap === null
              ? "Выберите две живые площадки, чтобы увидеть разницу средних."
              : `Разница средних всего стакана: ${formatPrice(String(gap))} ${filters.fiat}. На Bybit первая страница в среднюю не входит. Это не прибыль и не гарантия исполнения.`}
            {filters.side === "buy" ? " Зелёным отмечена более низкая средняя в этой таблице." : " Зелёным отмечена более высокая средняя в этой таблице."}
            {data.payment ? " Фильтр оплаты действует внутри загруженного списка." : ""}
          </p>
        </Panel>
      ) : null}
    </div>
  );
}

function SortHead({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th className="px-4 py-3 font-medium">
      <button type="button" onClick={onClick} className={cn("min-h-11 text-left", active && "text-foreground")}>
        {label}
      </button>
    </th>
  );
}

function Pair({ label, value, mark = false }: { label: string; value: string; mark?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-mono", mark && "text-primary")}>{value}</dd>
    </div>
  );
}

function money(value: number | null, fiat: string) {
  if (value === null) return "—";
  return `${formatPrice(String(value))} ${fiat}`;
}
