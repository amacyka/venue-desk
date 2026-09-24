export function formatPrice(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatQty(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 }).format(n);
}

export function formatSpread(bid: string, ask: string): string {
  const b = Number(bid);
  const a = Number(ask);
  if (!(b > 0) || !(a > 0)) return "—";
  const pct = ((a - b) / b) * 100;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(pct)}%`;
}

export function formatUsdt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

export function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)}%`;
}

export function formatAge(iso: string, now = Date.now()): string {
  const delta = now - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < 0) return "—";
  const sec = Math.round(delta / 1000);
  if (sec < 10) return "только что";
  if (sec < 60) return `${sec} с назад`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

export function formatAxis(iso: string, dense: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  if (dense) return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
