"use client";

import { FIATS, SOURCE_IDS, SOURCE_META, FIAT_META, PERIODS, isFiat, isLiveVenue, periodById, type SourceId } from "@/config/sources";
import { formatAge, formatClock } from "@/lib/format";
import { paymentLabel } from "@/lib/overview";
import { cn } from "@/lib/utils";
import { Activity, ArrowLeftRight, Bell, CreditCard, Home, LineChart, RefreshCw, Settings, Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MarketProvider, useMarket } from "./market";
import { useAlerts, useProfileName } from "./storage";

const NAV = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/analytics", label: "Аналитика", icon: LineChart },
  { href: "/compare", label: "Сравнение", icon: ArrowLeftRight },
  { href: "/monitoring", label: "Мониторинг", icon: Activity },
  { href: "/favorites", label: "Избранное", icon: Star },
  { href: "/notifications", label: "Уведомления", icon: Bell },
  { href: "/subscription", label: "Подписка", icon: CreditCard },
  { href: "/settings", label: "Настройки", icon: Settings },
] as const;

const FILTERED = new Set(["/", "/analytics", "/compare", "/monitoring", "/favorites"]);

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      <Chrome>{children}</Chrome>
    </MarketProvider>
  );
}

function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { query } = useMarket();
  const [more, setMore] = useState(false);
  const [alerts] = useAlerts();
  const enabled = alerts.filter((rule) => rule.enabled).length;

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    if (webApp.initData) {
      webApp.setHeaderColor?.("#0e1114");
      webApp.setBackgroundColor?.("#0e1114");
    }
  }, []);

  useEffect(() => {
    setMore(false);
  }, [pathname]);

  function hrefFor(href: string) {
    return query ? `${href}?${query}` : href;
  }

  return (
    <div className="min-h-dvh bg-transparent text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-border bg-sidebar md:flex">
        <Link href={hrefFor("/")} className="flex items-center gap-3 px-5 pt-6 pb-5">
          <Mark />
          <span>
            <span className="block text-sm font-medium">Срез P2P</span>
            <span className="block text-xs text-muted-foreground">USDT</span>
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => (
            <NavLink key={item.href} href={hrefFor(item.href)} label={item.label} icon={item.icon} active={pathname === item.href} />
          ))}
        </nav>
        <p className="px-5 py-5 text-xs leading-5 text-muted-foreground">Binance и Bybit отдельно. Хрокет и Crypto Bot не смешиваются с их ценами.</p>
      </aside>

      <div className="md:pl-[232px]">
        <header className="sticky top-0 z-20 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-3 md:px-8">
            <Link href={hrefFor("/")} className="flex items-center gap-2 md:hidden">
              <Mark />
              <span className="text-sm font-medium">Срез</span>
            </Link>
            <StatusLine />
            <div className="ml-auto flex items-center gap-1.5">
              <RefreshButton />
              <Link
                href={hrefFor("/notifications")}
                aria-label="Уведомления"
                className="relative inline-flex size-11 items-center justify-center rounded-[12px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none"
              >
                <Bell className="size-4" />
                {enabled > 0 ? (
                  <span className="absolute top-2 right-2 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground">
                    {enabled}
                  </span>
                ) : null}
              </Link>
              <Profile />
            </div>
          </div>
          {FILTERED.has(pathname) ? <FilterBar /> : null}
        </header>
        <main className="px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-16">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5">
          {NAV.slice(0, 4).map((item) => (
            <Link
              key={item.href}
              href={hrefFor(item.href)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[10px]",
                pathname === item.href ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[10px]", more ? "text-primary" : "text-muted-foreground")}
            aria-expanded={more}
            onClick={() => setMore((open) => !open)}
          >
            <Settings className="size-4" />
            Ещё
          </button>
        </div>
        {more ? (
          <div className="grid gap-1 border-t border-border p-3">
            {NAV.slice(4).map((item) => (
              <Link key={item.href} href={hrefFor(item.href)} className="flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-sm hover:bg-muted">
                <item.icon className="size-4 text-muted-foreground" />
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
      </nav>
    </div>
  );
}

function Mark() {
  return <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-sm font-medium text-primary-foreground">С</span>;
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

function StatusLine() {
  const { data, filters, now, refreshing } = useMarket();
  const selected = (data?.venues ?? []).filter((venue) => filters.venues.includes(venue.id));
  const failed = selected.length > 0 && selected.every((venue) => venue.status === "error");
  const partial = selected.some((venue) => venue.status === "error") && selected.some((venue) => venue.status !== "error");
  const oldest = selected.reduce<string | null>((mark, venue) => {
    if (!mark || venue.fetchedAt < mark) return venue.fetchedAt;
    return mark;
  }, null);
  const stale = Boolean(oldest && now - new Date(oldest).getTime() > 120_000);
  const label = failed ? "Источник недоступен" : partial ? "Часть источников недоступна" : selected.length ? selected.map((venue) => venue.name).join(" · ") : "Живой источник не выбран";

  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-xs text-foreground">
        <span className={cn("size-1.5 shrink-0 rounded-full", failed ? "bg-destructive" : selected.length ? "bg-primary" : "bg-muted-foreground")} />
        <span className="truncate">{refreshing ? "Обновление" : label}</span>
      </p>
      <p className="truncate pl-3.5 text-[11px] text-muted-foreground">
        {oldest ? `${formatClock(oldest)} · ${formatAge(oldest, now)}` : "срез ещё не получен"}
        {stale ? " · данные устарели" : ""}
      </p>
    </div>
  );
}

function RefreshButton() {
  const { reload, refreshing } = useMarket();
  return (
    <button
      type="button"
      onClick={reload}
      aria-label="Обновить срез"
      className="inline-flex size-11 items-center justify-center rounded-[12px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none"
    >
      <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
    </button>
  );
}

function Profile() {
  const { query } = useMarket();
  const [name] = useProfileName();
  const letter = (name || "Гость").trim().slice(0, 1).toUpperCase() || "Г";
  const suffix = query ? `?${query}` : "";
  return (
    <details className="relative">
      <summary className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none">
        {letter}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-60 rounded-[14px] border border-border bg-popover p-2 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
        <p className="px-2 py-2 text-sm">{name || "Гость"}</p>
        <p className="px-2 pb-2 text-xs text-muted-foreground">Вход не подключён. Меню хранится в браузере.</p>
        <Link href={`/subscription${suffix}`} className="flex min-h-11 items-center rounded-[10px] px-2 text-sm hover:bg-muted">
          Подписка
        </Link>
        <Link href={`/settings${suffix}`} className="flex min-h-11 items-center rounded-[10px] px-2 text-sm hover:bg-muted">
          Настройки
        </Link>
        <a href="https://t.me/AMACY_Analytics_bot" className="flex min-h-11 items-center rounded-[10px] px-2 text-sm hover:bg-muted" target="_blank" rel="noreferrer">
          Бот в Telegram
        </a>
      </div>
    </details>
  );
}

function FilterBar() {
  const { filters, setFilter, data } = useMarket();
  const payments = new Set<string>();
  for (const venue of data?.venues ?? []) {
    if (!filters.venues.includes(venue.id)) continue;
    for (const name of venue.markets.find((market) => market.fiat === filters.fiat)?.payments ?? []) payments.add(name);
  }
  if (filters.payment) payments.add(filters.payment);
  const options = [...payments].sort((a, b) => a.localeCompare(b, "ru"));

  function toggleVenue(id: SourceId) {
    const exists = filters.venues.includes(id);
    if (exists && filters.venues.length === 1) return;
    setFilter({ venues: exists ? filters.venues.filter((item) => item !== id) : [...filters.venues, id] });
  }

  return (
    <div className="flex w-full max-w-full gap-2 overflow-x-auto px-4 pb-3 md:flex-wrap md:overflow-visible md:px-8">
      <fieldset className="min-w-[220px] shrink-0 rounded-[12px] border border-border px-2 py-1.5">
        <legend className="px-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Биржа</legend>
        <div className="flex gap-1">
          {SOURCE_IDS.map((id) => {
            const on = filters.venues.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleVenue(id)}
                className={cn(
                  "min-h-9 rounded-[10px] px-2.5 text-xs focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none",
                  on ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {SOURCE_META[id].short}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="flex min-w-[108px] shrink-0 flex-col gap-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        Актив
        <select
          value={filters.asset}
          disabled
          aria-label="Криптовалюта"
          className="h-11 rounded-[12px] border border-border bg-background px-3 text-sm tracking-normal text-foreground uppercase"
        >
          <option value="USDT">USDT</option>
        </select>
      </label>
      <label className="flex min-w-[150px] shrink-0 flex-col gap-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        Фиат
        <select
          value={filters.fiat}
          aria-label="Фиатная валюта"
          onChange={(event) => setFilter({ fiat: isFiat(event.target.value) ? event.target.value : "TRY", payment: "" })}
          className="h-11 rounded-[12px] border border-border bg-background px-3 text-sm tracking-normal text-foreground"
        >
          {FIATS.map((fiat) => (
            <option key={fiat} value={fiat}>
              {FIAT_META[fiat].name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[180px] shrink-0 flex-col gap-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        Оплата
        <select
          value={filters.payment}
          aria-label="Способ оплаты"
          onChange={(event) => setFilter({ payment: event.target.value })}
          className="h-11 rounded-[12px] border border-border bg-background px-3 text-sm tracking-normal text-foreground"
        >
          <option value="">Все способы</option>
          {options.map((name) => (
            <option key={name} value={name}>
              {paymentLabel(name)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="shrink-0 rounded-[12px] border border-border px-2 py-1.5">
        <legend className="px-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Направление</legend>
        <div className="flex gap-1">
          {(
            [
              ["buy", "Покупка"],
              ["sell", "Продажа"],
            ] as const
          ).map(([side, label]) => (
            <button
              key={side}
              type="button"
              aria-pressed={filters.side === side}
              onClick={() => setFilter({ side })}
              className={cn(
                "min-h-9 rounded-[10px] px-3 text-xs focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none",
                filters.side === side ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="shrink-0 rounded-[12px] border border-border px-2 py-1.5">
        <legend className="px-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Период</legend>
        <div className="flex gap-1">
          {PERIODS.map((period) => (
            <button
              key={period.id}
              type="button"
              aria-pressed={filters.period === period.id}
              onClick={() => setFilter({ period: period.id })}
              className={cn(
                "min-h-9 rounded-[10px] px-2.5 text-xs focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none",
                filters.period === period.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {period.label}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="sr-only">Период карточек: {periodById(filters.period).label}. Живые площадки: {filters.venues.filter(isLiveVenue).join(", ") || "нет"}.</p>
    </div>
  );
}
