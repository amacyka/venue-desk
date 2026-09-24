import { formatClock, formatPct, formatPrice, formatQty } from "../lib/format";
import { headline, type P2pFiatAnalytics, type P2pSnapshot } from "../lib/p2p-view";
import { esc } from "./html";

function money(value: number | null): string {
  return value === null ? "—" : formatPrice(String(value));
}

function gap(fiat: P2pFiatAnalytics, side: "buy" | "sell"): string {
  const step = headline(side === "buy" ? fiat.buyBook : fiat.sellBook);
  return step?.slippagePct == null ? "—" : formatPct(step.slippagePct);
}

function figure(value: string, label: string): string {
  return `<code>${esc(value)}</code>   ${esc(label)}`;
}

export function formatP2p(name: string, snapshot: P2pSnapshot): string {
  const lines = [
    `<b>${esc(name)}</b>`,
    `USDT  ·  ${esc(formatClock(snapshot.fetchedAt))}`,
  ];
  if (snapshot.error) lines.push("", esc(snapshot.error));

  for (const fiat of snapshot.fiats) {
    lines.push("", `<b>${esc(fiat.title)}</b>`);
    if (fiat.error) lines.push(esc(fiat.error));
    lines.push(figure(fiat.averageBuy === null ? "—" : formatPrice(String(fiat.averageBuy)), "средняя покупка"));
    lines.push(figure(money(fiat.minBuy), "лучшая покупка"));
    lines.push(figure(gap(fiat, "buy"), "покупка к лучшей"));
    lines.push(figure(fiat.averageSell === null ? "—" : formatPrice(String(fiat.averageSell)), "средняя продажа"));
    lines.push(figure(money(fiat.maxSell), "лучшая продажа"));
    lines.push(figure(gap(fiat, "sell"), "продажа к лучшей"));
    lines.push(figure(formatQty(String(fiat.liquidityUsdt)), "ликвидность, USDT"));
    lines.push(figure(formatQty(String(fiat.trafficAds)), "трафик, объявления"));
    lines.push(figure(formatQty(String(fiat.activity)), "активность"));
    lines.push(
      `<i>${esc(formatQty(String(fiat.sellAds)))} продажа  ·  ${esc(formatQty(String(fiat.buyAds)))} встречные</i>`,
    );
  }

  const note =
    snapshot.venue === "binance"
      ? "Средняя — весь стакан, вес по остатку USDT. Активность — заказы за 30 дней рядом с лучшей ценой."
      : "Средняя — весь стакан без первой страницы, вес по остатку USDT. Активность — недавние сделки рядом с лучшей ценой.";
  lines.push("", `<blockquote>${esc(note)}</blockquote>`);
  return lines.join("\n");
}

export function webAppUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("https://")) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function menuText(hasApp = false): string {
  const lines = ["<b>Срез P2P</b>", "", "USDT", "Ликвидность", "Трафик", "Покупка", "Активность"];
  if (hasApp) lines.push("", "Кнопка «Открыть терминал» открывает экран на телефоне.");
  lines.push("", "<blockquote>Две площадки, по отдельности.</blockquote>");
  return lines.join("\n");
}
