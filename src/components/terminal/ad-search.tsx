"use client";

import { Button } from "@/components/ui/button";
import { FIATS, FIAT_META, LIVE_VENUES, SOURCE_META, isLiveVenue, supportsFiat, type LiveVenueId } from "@/config/sources";
import { normalize } from "@/lib/ads/analyze";
import type { AdSearchResult, AdSide, SearchAd } from "@/lib/ads/collect";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMarket } from "./market";
import { PageIntro, Panel, StateBlock } from "./widgets";

type ThirdFilter = "any" | "accepted" | "not-rejected" | "rejected";
type FixedMode = "all" | "fixed" | "free";
type SortKey = "price" | "available" | "orders" | "completion";

type Filters = {
  amount: string;
  fixedMode: FixedMode;
  sort: SortKey;
  priceMin: string;
  priceMax: string;
  third: ThirdFilter;
  bank: string;
  include: string;
  exclude: string;
  minOrders: string;
  minCompletion: string;
  onlineOnly: boolean;
  merchantOnly: boolean;
  hideReceipt: boolean;
  hideVideo: boolean;
  hideKyc: boolean;
};

const START: Filters = {
  amount: "",
  fixedMode: "all",
  sort: "price",
  priceMin: "",
  priceMax: "",
  third: "any",
  bank: "",
  include: "",
  exclude: "",
  minOrders: "",
  minCompletion: "",
  onlineOnly: false,
  merchantOnly: false,
  hideReceipt: false,
  hideVideo: false,
  hideKyc: false,
};

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const toNum = (value: string): number | null => {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return value.trim() && Number.isFinite(n) ? n : null;
};
const terms = (value: string) =>
  value
    .split(/[,;\n]+/)
    .map((part) => normalize(part.trim()))
    .filter(Boolean);

function haystack(ad: SearchAd): string {
  return normalize([ad.remarks, ad.nick, ...ad.payments, ...ad.analysis.banksMentioned].join(" \n "));
}

function allBanks(ad: SearchAd): string[] {
  return [...new Set([...ad.payments, ...ad.analysis.banksMentioned])];
}

const STORE_KEY = "srez.search";

function readStored(): Filters {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...START, ...(JSON.parse(raw) as Partial<Filters>) };
  } catch {
    // private window or blocked storage: start clean
  }
  return START;
}

// The amount the user wants must fit the ad's limits and whatever the terms say about amounts.
function amountFits(ad: SearchAd, amount: number): boolean {
  if (ad.minFiat !== null && amount < ad.minFiat) return false;
  if (ad.maxFiat !== null && amount > ad.maxFiat) return false;
  if (amount / ad.price > ad.availableUsdt + 1e-9) return false;
  const terms = ad.analysis.amounts;
  if (terms.fixed.length && !terms.fixed.some((value) => Math.abs(value - amount) <= Math.max(1, value * 0.005))) return false;
  if (terms.multipleOf && amount % terms.multipleOf !== 0) return false;
  if (terms.minAmount && amount < terms.minAmount) return false;
  return true;
}

function sortAds(list: SearchAd[], key: SortKey, side: AdSide): SearchAd[] {
  const byPrice = (a: SearchAd, b: SearchAd) => (side === "buy" ? a.price - b.price : b.price - a.price);
  return list.sort((a, b) => {
    if (key === "available") return b.availableUsdt - a.availableUsdt || byPrice(a, b);
    if (key === "orders") return (b.orders ?? 0) - (a.orders ?? 0) || byPrice(a, b);
    if (key === "completion") return (b.completion ?? 0) - (a.completion ?? 0) || byPrice(a, b);
    return byPrice(a, b);
  });
}

function amountLabel(ad: SearchAd): string | null {
  const t = ad.analysis.amounts;
  if (t.fixed.length) return `Сумма строго: ${t.fixed.map((v) => nf.format(v)).join(" / ")} ${ad.fiat}`;
  if (t.multipleOf) return `Сумма кратна ${nf.format(t.multipleOf)} ${ad.fiat}`;
  if (t.minAmount) return `Сумма от ${nf.format(t.minAmount)} ${ad.fiat}`;
  return null;
}

function matches(ad: SearchAd, f: Filters): boolean {
  const amount = toNum(f.amount);
  if (amount !== null && !amountFits(ad, amount)) return false;
  const hasFixed = ad.analysis.amounts.fixed.length > 0;
  if (f.fixedMode === "fixed" && !hasFixed) return false;
  if (f.fixedMode === "free" && hasFixed) return false;
  const pMin = toNum(f.priceMin);
  const pMax = toNum(f.priceMax);
  if (pMin !== null && ad.price < pMin) return false;
  if (pMax !== null && ad.price > pMax) return false;
  const tp = ad.analysis.thirdParty;
  if (f.third === "accepted" && tp !== "accepted") return false;
  if (f.third === "rejected" && tp !== "rejected") return false;
  if (f.third === "not-rejected" && tp === "rejected") return false;
  if (f.bank) {
    if (ad.analysis.banksExcluded.includes(f.bank)) return false;
    if (!allBanks(ad).includes(f.bank)) return false;
  }
  const text = haystack(ad);
  for (const word of terms(f.include)) if (!text.includes(word)) return false;
  for (const word of terms(f.exclude)) if (text.includes(word)) return false;
  const minOrders = toNum(f.minOrders);
  if (minOrders !== null && (ad.orders ?? 0) < minOrders) return false;
  const minCompletion = toNum(f.minCompletion);
  if (minCompletion !== null && (ad.completion ?? 0) < minCompletion) return false;
  if (f.onlineOnly && ad.online === false) return false;
  if (f.merchantOnly && !ad.merchant) return false;
  const flags = new Set(ad.analysis.flags.map((flag) => flag.id));
  if (f.hideReceipt && flags.has("receipt")) return false;
  if (f.hideVideo && flags.has("video")) return false;
  if (f.hideKyc && (flags.has("kyc") || ad.requirements.some((r) => r.includes("KYC") || r.includes("верификац")))) return false;
  return true;
}

export function AdSearchScreen() {
  const { filters: market, setFilter } = useMarket();
  const side: AdSide = market.side === "sell" ? "sell" : "buy";
  const chosen = market.venues.filter(isLiveVenue);
  const venues = chosen.filter((id) => supportsFiat(id, market.fiat));
  const skipped = chosen.filter((id) => !supportsFiat(id, market.fiat));
  const [f, setF] = useState<Filters>(START);

  // Stored filters are read after mount so the server-rendered page and the first client render match.
  useEffect(() => {
    setF(readStored());
  }, []);

  const update = useCallback((next: Filters) => {
    setF(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable: filters just won't be remembered
    }
  }, []);

  function toggleVenue(id: LiveVenueId) {
    const others = market.venues.filter((v) => v !== id);
    const next = market.venues.includes(id) ? others : [...market.venues, id];
    if (!next.some(isLiveVenue)) return;
    setFilter({ venues: next });
  }
  const [results, setResults] = useState<AdSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(40);
  const venueKey = venues.join(",");
  const request = useRef(0);

  const load = useCallback(
    async (fresh = false) => {
      if (!venueKey) {
        setResults([]);
        return;
      }
      setLoading(true);
      const id = ++request.current;
      const list = await Promise.all(
        venueKey.split(",").map(async (venue) => {
          const q = new URLSearchParams({ venue, fiat: market.fiat, side });
          if (fresh) q.set("fresh", "1");
          try {
            const res = await fetch(`/api/ads?${q.toString()}`);
            return (await res.json()) as AdSearchResult;
          } catch {
            return {
              venue: venue as LiveVenueId,
              fiat: market.fiat,
              side,
              fetchedAt: new Date().toISOString(),
              error: "Не удалось загрузить",
              notes: [],
              ads: [],
            } satisfies AdSearchResult;
          }
        }),
      );
      if (id !== request.current) return; // a newer search replaced this one
      setResults(list);
      setLoading(false);
      setShown(40);
    },
    [venueKey, market.fiat, side],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => results.flatMap((r) => r.ads), [results]);
  const found = useMemo(() => sortAds(all.filter((ad) => matches(ad, f)), f.sort, side), [all, f, side]);
  const fixedCount = useMemo(() => all.filter((ad) => ad.analysis.amounts.fixed.length > 0).length, [all]);
  const banks = useMemo(() => {
    const list = new Set(all.flatMap(allBanks));
    if (f.bank) list.add(f.bank); // keep a remembered choice visible even if today's list lacks it
    return [...list].sort((a, b) => a.localeCompare(b, "ru"));
  }, [all, f.bank]);
  const stats = useMemo(() => {
    const s = { accepted: 0, rejected: 0, unknown: 0 };
    for (const ad of found) s[ad.analysis.thirdParty] += 1;
    return s;
  }, [found]);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => update({ ...f, [key]: value });

  return (
    <div className="grid gap-5">
      <PageIntro
        eyebrow="Поиск"
        title="Поиск объявлений"
        text="Все объявления выбранных бирж с разбором условий: третьи лица, банки, сумма, чек, требования к покупателю."
      />

      <Panel className="grid gap-4 p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-[auto_auto_1fr] md:items-end">
          <div className="grid gap-1 text-xs text-muted-foreground">
            Биржи
            <div className="flex flex-wrap gap-1.5">
              {LIVE_VENUES.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={market.venues.includes(id)}
                  onClick={() => toggleVenue(id)}
                  className={cn(
                    "min-h-11 rounded-[12px] border px-3 text-sm",
                    market.venues.includes(id) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {SOURCE_META[id].short}
                </button>
              ))}
            </div>
          </div>
          <Field label="Валюта">
            <select value={market.fiat} onChange={(e) => setFilter({ fiat: e.target.value as typeof market.fiat })} className={inputCls}>
              {FIATS.map((fiat) => (
                <option key={fiat} value={fiat}>
                  {FIAT_META[fiat].name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {(["buy", "sell"] as AdSide[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={side === s}
                onClick={() => setFilter({ side: s })}
                className={cn(
                  "min-h-11 rounded-[12px] border px-4 text-sm",
                  side === s ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {s === "buy" ? "Я покупаю USDT" : "Я продаю USDT"}
              </button>
            ))}
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void load(true)} disabled={loading}>
              {loading ? "Загружаю…" : "Обновить"}
            </Button>
          </div>
        </div>
        {skipped.length ? (
          <p className="text-xs text-muted-foreground">
            {skipped.map((id) => SOURCE_META[id].short).join(", ")}: валюта «{FIAT_META[market.fiat].name}» на этой площадке не подключена.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={`Моя сумма, ${market.fiat} (лимиты + сумма из условий)`}>
            <input inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="например 50000" className={inputCls} />
          </Field>
          <Field label="Сумма в условиях">
            <select value={f.fixedMode} onChange={(e) => set("fixedMode", e.target.value as FixedMode)} className={inputCls}>
              <option value="all">Все объявления</option>
              <option value="fixed">Только со строгой суммой ({fixedCount})</option>
              <option value="free">Без строгой суммы</option>
            </select>
          </Field>
          <Field label="Сортировка">
            <select value={f.sort} onChange={(e) => set("sort", e.target.value as SortKey)} className={inputCls}>
              <option value="price">Лучшая цена</option>
              <option value="available">Больше доступно USDT</option>
              <option value="orders">Больше сделок у продавца</option>
              <option value="completion">Выше % выполнения</option>
            </select>
          </Field>
          <Field label="Цена от">
            <input inputMode="decimal" value={f.priceMin} onChange={(e) => set("priceMin", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Цена до">
            <input inputMode="decimal" value={f.priceMax} onChange={(e) => set("priceMax", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Третьи лица">
            <select value={f.third} onChange={(e) => set("third", e.target.value as ThirdFilter)} className={inputCls}>
              <option value="any">Все объявления</option>
              <option value="accepted">Принимает от третьих лиц</option>
              <option value="not-rejected">Не запрещает явно</option>
              <option value="rejected">Только своя карта / не принимает</option>
            </select>
          </Field>
          <Field label="Банк / способ оплаты">
            <select value={f.bank} onChange={(e) => set("bank", e.target.value)} className={inputCls}>
              <option value="">Любой</option>
              {banks.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ключевые слова (через запятую)">
            <input value={f.include} onChange={(e) => set("include", e.target.value)} placeholder="сбп, быстро" className={inputCls} />
          </Field>
          <Field label="Исключить слова">
            <input value={f.exclude} onChange={(e) => set("exclude", e.target.value)} placeholder="видео, скрин" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Сделок от">
              <input inputMode="numeric" value={f.minOrders} onChange={(e) => set("minOrders", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Выполнение от %">
              <input inputMode="numeric" value={f.minCompletion} onChange={(e) => set("minCompletion", e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Check label="Только онлайн" value={f.onlineOnly} onChange={(v) => set("onlineOnly", v)} />
          <Check label="Только мерчанты" value={f.merchantOnly} onChange={(v) => set("merchantOnly", v)} />
          <Check label="Скрыть, где нужен чек" value={f.hideReceipt} onChange={(v) => set("hideReceipt", v)} />
          <Check label="Скрыть видео / скрин ЛК" value={f.hideVideo} onChange={(v) => set("hideVideo", v)} />
          <Check label="Скрыть требующих KYC" value={f.hideKyc} onChange={(v) => set("hideKyc", v)} />
          <button type="button" className="min-h-9 text-primary" onClick={() => update(START)}>
            Сбросить фильтры
          </button>
        </div>
      </Panel>

      {venues.length === 0 ? (
        <StateBlock title="Нет площадки для этой валюты" text="Выберите выше биржу, на которой есть эта валюта: рубль — Bybit и Wallet, лира и рупия — все три." />
      ) : null}

      {results.map((r) =>
        r.error ? (
          <p key={`e-${r.venue}`} className="text-sm text-destructive">
            {SOURCE_META[r.venue].name}: {r.error}
          </p>
        ) : null,
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          Найдено <span className="font-mono">{found.length}</span> из <span className="font-mono">{all.length}</span> ·{" "}
          <span className="text-primary">принимают третьих лиц: {stats.accepted}</span> ·{" "}
          <span className="text-destructive">не принимают: {stats.rejected}</span> · <span className="text-muted-foreground">не указано: {stats.unknown}</span>
        </p>
        <p className="text-xs text-muted-foreground">{FIAT_META[market.fiat].name} · со строгой суммой: {fixedCount}</p>
      </div>

      {loading && !all.length ? <Panel className="p-5 text-sm text-muted-foreground">Загружаю объявления и условия… Binance может отвечать до 20 секунд.</Panel> : null}

      <div className="grid gap-3">
        {found.slice(0, shown).map((ad) => (
          <AdCard key={`${ad.venue}-${ad.id}`} ad={ad} />
        ))}
      </div>
      {found.length > shown ? (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setShown((n) => n + 40)}>
          Показать ещё ({found.length - shown})
        </Button>
      ) : null}

      <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
        {results.flatMap((r) => r.notes).map((note) => (
          <p key={note}>{note}</p>
        ))}
        <p>Разбор условий автоматический, по словам в тексте объявления. Спорные случаи проверяйте по цитате в карточке.</p>
      </div>
    </div>
  );
}

const inputCls = "h-11 w-full rounded-[12px] border border-border bg-background px-3 text-sm text-foreground";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-9 items-center gap-2">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--primary)]" />
      {label}
    </label>
  );
}

function Chip({ tone = "muted", children }: { tone?: "good" | "bad" | "muted" | "warn"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
        tone === "good" && "border-primary/40 bg-primary/10 text-primary",
        tone === "bad" && "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "warn" && "border-amber-500/40 bg-amber-500/10 text-amber-500",
        tone === "muted" && "border-border text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function AdCard({ ad }: { ad: SearchAd }) {
  const [open, setOpen] = useState(false);
  const a = ad.analysis;
  const third =
    a.thirdParty === "accepted" ? (
      <Chip tone="good">3-и лица: принимает</Chip>
    ) : a.thirdParty === "rejected" ? (
      <Chip tone="bad">3-и лица: не принимает</Chip>
    ) : (
      <Chip>3-и лица: {ad.remarksLoaded ? "не указано" : "нет текста условий"}</Chip>
    );
  const limits =
    ad.minFiat !== null || ad.maxFiat !== null
      ? `${ad.minFiat !== null ? nf.format(ad.minFiat) : "…"} – ${ad.maxFiat !== null ? nf.format(ad.maxFiat) : "…"} ${ad.fiat}`
      : "лимиты не указаны";

  return (
    <Panel className="grid gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-7 place-items-center rounded-[8px] border border-border font-mono text-xs">{SOURCE_META[ad.venue].mark}</span>
            <span className="truncate text-sm font-medium">{ad.nick || "без ника"}</span>
            {ad.merchant ? <Chip>мерчант</Chip> : null}
            {ad.online === true ? <Chip tone="good">онлайн</Chip> : ad.online === false ? <Chip>офлайн</Chip> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {SOURCE_META[ad.venue].short} · сделок {ad.orders ?? "—"} · выполнение {ad.completion !== null ? `${nf.format(ad.completion)}%` : "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xl">
            {nf.format(ad.price)} <span className="text-sm text-muted-foreground">{ad.fiat}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {limits} · доступно {nf.format(ad.availableUsdt)} USDT
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {third}
        {amountLabel(ad) ? <Chip tone="warn">{amountLabel(ad)}</Chip> : null}
        {ad.amountConflict ? <Chip tone="bad">Сумма в условиях вне лимитов объявления</Chip> : null}
        {a.banksOnly ? <Chip tone="warn">только указанные банки</Chip> : null}
        {a.minOrders ? <Chip tone="warn">покупатель от {a.minOrders} сделок</Chip> : null}
        {a.flags.map((flag) => (
          <Chip key={flag.id} tone={flag.id === "no-refund" || flag.id === "video" ? "warn" : "muted"}>
            {flag.label}
          </Chip>
        ))}
        {ad.requirements.map((req) => (
          <Chip key={req} tone="warn">
            {req}
          </Chip>
        ))}
      </div>

      <div className="grid gap-1 text-xs">
        {ad.payments.length ? (
          <p>
            <span className="text-muted-foreground">Банки в объявлении: </span>
            {ad.payments.join(", ")}
          </p>
        ) : null}
        {ad.methods.length ? (
          <p>
            <span className="text-muted-foreground">Способ на {SOURCE_META[ad.venue].short}: </span>
            {ad.methods.join(", ")}
          </p>
        ) : null}
        {a.amounts.quote ? <p className="text-muted-foreground">Про сумму: «{a.amounts.quote}»</p> : null}
        {a.banksMentioned.length ? (
          <p>
            <span className="text-muted-foreground">Банки в условиях: </span>
            {a.banksMentioned.join(", ")}
          </p>
        ) : null}
        {a.banksExcluded.length ? (
          <p className="text-destructive">
            <span>Не принимает: </span>
            {a.banksExcluded.join(", ")}
          </p>
        ) : null}
        {a.thirdPartyQuote ? <p className="text-muted-foreground">«{a.thirdPartyQuote}»</p> : null}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {ad.remarks ? (
          <button type="button" className="min-h-9 text-primary" onClick={() => setOpen((v) => !v)}>
            {open ? "Скрыть условия" : "Полные условия"}
          </button>
        ) : null}
        {ad.link ? (
          <a href={ad.link} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-primary">
            Открыть на {SOURCE_META[ad.venue].short} ↗
          </a>
        ) : ad.venue === "wallet" ? (
          <span className="inline-flex min-h-9 items-center text-xs text-muted-foreground">Открыть: @wallet → P2P, продавец «{ad.nick}»</span>
        ) : null}
      </div>
      {open ? <pre className="max-h-80 overflow-auto rounded-[10px] bg-background p-3 text-xs leading-5 whitespace-pre-wrap">{ad.remarks}</pre> : null}
    </Panel>
  );
}
