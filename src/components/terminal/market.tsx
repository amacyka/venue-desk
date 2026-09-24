"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isFiat, isLiveVenue, isPeriod, isSourceId, type FiatId, type PeriodId, type SideId, type SourceId } from "@/config/sources";
import type { OverviewResponse } from "@/lib/overview";

export type Filters = {
  venues: SourceId[];
  asset: "USDT";
  fiat: FiatId;
  payment: string;
  side: SideId;
  period: PeriodId;
};

type MarketValue = {
  filters: Filters;
  setFilter: (patch: Partial<Omit<Filters, "asset">>) => void;
  query: string;
  status: "loading" | "ready" | "error";
  refreshing: boolean;
  data: OverviewResponse | null;
  error: string | null;
  now: number;
  reload: () => void;
};

const MarketContext = createContext<MarketValue | null>(null);

function parseFilters(params: URLSearchParams): Filters {
  const venues = (params.get("venues") ?? "binance")
    .split(",")
    .map((item) => item.trim())
    .filter(isSourceId);
  const fiat = params.get("fiat") ?? "";
  const period = params.get("period") ?? "";
  return {
    venues: venues.length ? [...new Set(venues)] : ["binance"],
    asset: "USDT",
    fiat: isFiat(fiat) ? fiat : "TRY",
    payment: params.get("payment") ?? "",
    side: params.get("side") === "sell" ? "sell" : "buy",
    period: isPeriod(period) ? period : "24h",
  };
}

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo(() => parseFilters(params), [params]);
  const [status, setStatus] = useState<MarketValue["status"]>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const liveKey = filters.venues.filter(isLiveVenue).join(",");

  const run = useCallback(
    (fresh: boolean) => {
      if (!liveKey) {
        setData({
          ok: true,
          fetchedAt: new Date().toISOString(),
          asset: "USDT",
          payment: filters.payment,
          history: [],
          venues: [],
          notes: ["Живая площадка не выбрана. Binance и Bybit включаются в фильтре «Биржа»."],
        });
        setError(null);
        setStatus("ready");
        setRefreshing(false);
        return () => undefined;
      }
      const controller = new AbortController();
      setRefreshing(true);
      const search = new URLSearchParams({
        venues: liveKey,
        payment: filters.payment,
        period: filters.period,
      });
      if (fresh) search.set("fresh", "1");
      fetch(`/api/overview?${search.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Срез не загрузился: HTTP ${response.status}`);
          return (await response.json()) as OverviewResponse;
        })
        .then((body) => {
          setData(body);
          setError(null);
          setStatus("ready");
          setNow(Date.now());
        })
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить срез");
          setStatus((current) => (current === "ready" ? "ready" : "error"));
        })
        .finally(() => {
          if (!controller.signal.aborted) setRefreshing(false);
        });
      return () => controller.abort();
    },
    [filters.payment, filters.period, liveKey],
  );

  useEffect(() => {
    const stop = run(false);
    const timer = window.setInterval(() => run(false), 60_000);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      stop();
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [run]);

  const setFilter = useCallback(
    (patch: Partial<Omit<Filters, "asset">>) => {
      const next = { ...filters, ...patch };
      const venues = next.venues.length ? next.venues : filters.venues;
      const search = new URLSearchParams();
      search.set("venues", venues.join(","));
      search.set("fiat", next.fiat);
      if (next.payment) search.set("payment", next.payment);
      search.set("side", next.side);
      search.set("period", next.period);
      const query = search.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );

  const value = useMemo<MarketValue>(
    () => ({
      filters,
      setFilter,
      query: params.toString(),
      status,
      refreshing,
      data,
      error,
      now,
      reload: () => run(true),
    }),
    [data, error, filters, now, params, refreshing, run, setFilter, status],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketValue {
  const value = useContext(MarketContext);
  if (!value) throw new Error("Маркет недоступен");
  return value;
}
