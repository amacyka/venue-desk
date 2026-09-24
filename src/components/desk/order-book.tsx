import { formatPrice, formatQty, formatSpread } from "@/lib/format";
import type { Level } from "@/lib/levels";

export function OrderBook({
  bids,
  asks,
}: {
  bids: Level[];
  asks: Level[];
}) {
  const bid = bids[0]?.price;
  const ask = asks[0]?.price;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span>Лучшие уровни этой книги</span>
        <span className="font-mono">{bid && ask ? `спред ${formatSpread(bid, ask)}` : "спред —"}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Side title="Покупка" rows={bids} tone="bid" />
        <Side title="Продажа" rows={asks} tone="ask" />
      </div>
    </div>
  );
}

function Side({ title, rows, tone }: { title: string; rows: Level[]; tone: "bid" | "ask" }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <span>объём</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Уровней нет</p>
      ) : (
        <ul className="space-y-0.5 font-mono text-xs sm:text-sm">
          {rows.map((row) => (
            <li key={`${tone}-${row.price}`} className="flex justify-between gap-2">
              <span className={tone === "bid" ? "text-[#1f6b45]" : "text-[#9a3412]"}>{formatPrice(row.price)}</span>
              <span className="text-muted-foreground">{formatQty(row.qty)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
