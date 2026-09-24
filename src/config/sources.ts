export const LIVE_VENUES = ["binance", "bybit"] as const;
export const SOURCE_IDS = ["binance", "bybit", "cryptobot", "xrocket"] as const;
export const FIATS = ["TRY", "INR", "RUB"] as const;
export const VENUE_FIATS = {
  binance: ["TRY", "INR"],
  bybit: ["TRY", "INR", "RUB"],
} as const;
export const PERIODS = [
  { id: "1h", label: "1 час", ms: 60 * 60 * 1000 },
  { id: "24h", label: "24 часа", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7 дней", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30 дней", ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

export type LiveVenueId = (typeof LIVE_VENUES)[number];
export type SourceId = (typeof SOURCE_IDS)[number];
export type FiatId = (typeof FIATS)[number];
export type PeriodId = (typeof PERIODS)[number]["id"];
export type SideId = "buy" | "sell";

export const SOURCE_META: Record<
  SourceId,
  { name: string; short: string; mark: string; connected: boolean; reason?: string }
> = {
  binance: { name: "Binance P2P", short: "Binance", mark: "B", connected: true },
  bybit: { name: "Bybit P2P", short: "Bybit", mark: "Y", connected: true },
  cryptobot: {
    name: "Crypto Bot",
    short: "Crypto Bot",
    mark: "C",
    connected: false,
    reason:
      "Публичного списка P2P-объявлений нет. Курсы Crypto Pay — не стакан объявлений, и без токена они не читаются.",
  },
  xrocket: {
    name: "Хрокет",
    short: "Хрокет",
    mark: "Х",
    connected: false,
    reason:
      "Хрокет в этом проекте — отдельный источник. Его публичный API отдаёт спот, не P2P-объявления. Цифры с других площадок сюда не подставляются.",
  },
};

export const FIAT_META: Record<FiatId, { title: string; name: string }> = {
  TRY: { title: "Лира", name: "Турецкая лира" },
  INR: { title: "Рупия", name: "Индийская рупия" },
  RUB: { title: "Рубль", name: "Российский рубль" },
};

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value);
}

export function isLiveVenue(value: string): value is LiveVenueId {
  return value === "binance" || value === "bybit";
}

export function isFiat(value: string): value is FiatId {
  return (FIATS as readonly string[]).includes(value);
}

export function supportsFiat(venue: LiveVenueId, fiat: FiatId): boolean {
  return (VENUE_FIATS[venue] as readonly string[]).includes(fiat);
}

export function unsupportedFiatCopy(venue: LiveVenueId, fiat: FiatId): string {
  if (venue === "binance" && fiat === "RUB") {
    return "На Binance рубль в этот терминал не входит. Рубль читается только из списка объявлений Bybit и не подменяется чужой ценой.";
  }
  return `${FIAT_META[fiat].name} на этой площадке не подключена.`;
}

export function isPeriod(value: string): value is PeriodId {
  return PERIODS.some((period) => period.id === value);
}

export function periodById(id: PeriodId) {
  return PERIODS.find((period) => period.id === id) ?? PERIODS[1];
}
