"use client";

import { formatPct, formatPrice, formatQty, formatUsdt } from "@/lib/format";
import { paymentLabel } from "@/lib/overview";
import { DEPTH_BANDS, LADDER_USDT, type SideBook } from "@/lib/p2p-view";
import { Panel } from "./widgets";

export function BookReading({
  fiat,
  buy,
  sell,
}: {
  fiat: string;
  buy: SideBook;
  sell: SideBook;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <SideSheet title="Покупка" fiat={fiat} book={buy} worse="дороже лучшей" />
      <SideSheet title="Продажа" fiat={fiat} book={sell} worse="дешевле лучшей" />
    </div>
  );
}

function SideSheet({ title, fiat, book, worse }: { title: string; fiat: string; book: SideBook; worse: string }) {
  return (
    <Panel className="p-4 md:p-5">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Набор идёт от лучшей цены. С одного объявления берётся не больше лимита сделки. Отклонение — насколько набор {worse}.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Набор</th>
              <th className="py-2 pr-3 font-medium">Цена</th>
              <th className="py-2 pr-3 font-medium">К лучшей</th>
              <th className="py-2 font-medium">Сделок</th>
            </tr>
          </thead>
          <tbody>
            {LADDER_USDT.map((size) => {
              const step = book.steps.find((item) => item.size === size);
              return (
                <tr key={size} className="border-t border-border">
                  <td className="py-2 pr-3 font-mono">{size} USDT</td>
                  <td className="py-2 pr-3 font-mono">{step?.average == null ? "—" : `${formatPrice(String(step.average))} ${fiat}`}</td>
                  <td className="py-2 pr-3 font-mono">{step?.slippagePct == null ? "—" : formatPct(step.slippagePct)}</td>
                  <td className="py-2 font-mono">{step ? step.deals : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        {DEPTH_BANDS.map((band) => {
          const row = book.bands.find((item) => item.band === band);
          const pct = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(band * 100);
          return (
            <div key={band} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">В пределах {pct}%</dt>
              <dd className="font-mono">
                {row
                  ? `${usdt(row.usdt)} USDT · ${row.deals} объявл.${row.lockedDeals > 0 ? ` · ещё ${row.lockedDeals} с минимумом выше 100 USDT` : ""}`
                  : "—"}
              </dd>
            </div>
          );
        })}
      </dl>
      {book.payments.length ? (
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          В наборе 100 USDT:{" "}
          {book.payments.map((item) => `${paymentLabel(item.id)} ${usdt(item.usdt)} USDT`).join(" · ")}. Объявление с несколькими способами учитывается в каждом.
        </p>
      ) : (
        <p className="mt-4 text-xs leading-5 text-muted-foreground">В наборе 100 USDT способы оплаты не отмечены.</p>
      )}
    </Panel>
  );
}

function usdt(value: number): string {
  return value < 100 ? formatQty(String(value)) : formatUsdt(value);
}
