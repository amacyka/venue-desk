"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatClock, formatPrice, formatQty } from "@/lib/format";
import type { P2pSnapshot } from "@/lib/p2p-view";

export function P2pBlock({
  data,
  loading,
  error,
}: {
  data: P2pSnapshot | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">USDT · только объявления этой площадки</p>
        {data ? <Badge variant="outline">{formatClock(data.fetchedAt)}</Badge> : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading && !data ? <Skeleton className="h-36 w-full" /> : null}
      {data?.error ? <p className="text-sm text-destructive">{data.error}</p> : null}
      {data
        ? data.fiats.map((fiat) => (
            <section key={fiat.fiat} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">{fiat.title}</h3>
                <Badge variant="secondary">{fiat.fiat}</Badge>
              </div>
              {fiat.error ? <p className="text-sm text-destructive">{fiat.error}</p> : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric
                  label="Ликвидность"
                  value={`${formatQty(String(fiat.liquidityUsdt))} USDT`}
                  hint="USDT в пределах 1% от лучшей цены покупки"
                />
                <Metric
                  label="Трафик"
                  value={`${formatQty(String(fiat.trafficAds))} объявл.`}
                  hint={`продажа ${formatQty(String(fiat.sellAds))} · встречные ${formatQty(String(fiat.buyAds))}`}
                />
                <Metric
                  label="Средняя покупка"
                  value={fiat.averageBuy === null ? "—" : formatPrice(String(fiat.averageBuy))}
                  hint="весь стакан, вес по остатку USDT"
                />
                <Metric
                  label="Активность"
                  value={formatQty(String(fiat.activity))}
                  hint="заказы мерчантов в этих объявлениях на продажу"
                />
              </div>
            </section>
          ))
        : null}
      {data ? <p className="text-xs leading-5 text-muted-foreground">{data.activityHint}</p> : null}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
