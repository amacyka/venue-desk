"use client";

import { BinancePanel } from "./binance-panel";
import { BybitPanel } from "./bybit-panel";

const LINKS = [
  { href: "#binance", label: "Binance P2P" },
  { href: "#bybit", label: "Bybit P2P" },
];

export function Desk() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">P2P · USDT · только чтение</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight sm:text-4xl">Аналитика P2P</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Две площадки отдельно: Binance и Bybit. На каждой — ликвидность USDT, общий трафик объявлений, средняя цена
          покупки и активность мерчантов. Спред не считается.
        </p>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-sm hover:bg-muted"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </header>
      <div className="space-y-6">
        <BinancePanel />
        <BybitPanel />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Хрокет и Крипто Бот в этот сервис не входят: у них нет публичного стакана P2P-объявлений. Ордера не отправляются.
      </p>
    </div>
  );
}
