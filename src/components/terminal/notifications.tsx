"use client";

import { Button } from "@/components/ui/button";
import { FIAT_META, isLiveVenue, supportsFiat, type FiatId } from "@/config/sources";
import { useMarket } from "./market";
import { useAlerts, type AlertKind, type AlertRule } from "./storage";
import { PageIntro, Panel, StateBlock } from "./widgets";

const KINDS: { id: AlertKind; label: string; unit: string }[] = [
  { id: "price", label: "Изменение средней цены", unit: "%" },
  { id: "liquidity", label: "Резкое изменение ликвидности", unit: "%" },
  { id: "ads", label: "Появление новых объявлений", unit: "шт." },
  { id: "spread", label: "Изменение разницы средних", unit: "фиат" },
  { id: "threshold", label: "Порог цены", unit: "цена" },
];

export function NotificationsScreen() {
  const { filters } = useMarket();
  const [alerts, setAlerts, ready] = useAlerts();

  function add() {
    const rule: AlertRule = {
      id: crypto.randomUUID(),
      enabled: true,
      kind: "threshold",
      venue: supportsFiat("binance", filters.fiat) ? "binance" : "bybit",
      fiat: filters.fiat,
      side: filters.side,
      threshold: "",
    };
    setAlerts((current) => [rule, ...current]);
  }

  return (
    <div className="grid gap-6">
      <PageIntro eyebrow="Уведомления" title="Уведомления" text="Условия хранятся в этом браузере. Сообщения в Telegram не отправляются: доставка не подключена." />
      <div>
        <Button type="button" className="min-h-11" onClick={add} disabled={!ready}>
          Добавить условие
        </Button>
      </div>
      {ready && alerts.length === 0 ? <StateBlock title="Условий нет" text="Добавьте порог или изменение. Правило можно включить, но отправка от этого не появится." /> : null}
      <div className="grid gap-3">
        {alerts.map((rule) => {
          const kind = KINDS.find((item) => item.id === rule.kind) ?? KINDS[4];
          const invalid = rule.threshold.trim() !== "" && !Number.isFinite(Number(rule.threshold));
          return (
            <Panel key={rule.id} className="grid gap-3 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Условие
                  <select
                    value={rule.kind}
                    onChange={(event) => update(setAlerts, rule.id, { kind: event.target.value as AlertKind })}
                    className="h-11 rounded-[12px] border border-border bg-background px-3 text-sm text-foreground"
                  >
                    {KINDS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Порог, {kind?.unit}
                  <input
                    value={rule.threshold}
                    inputMode="decimal"
                    onChange={(event) => update(setAlerts, rule.id, { threshold: event.target.value })}
                    className="h-11 rounded-[12px] border border-border bg-background px-3 text-sm text-foreground"
                    placeholder="Например 50"
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Площадка
                  <select
                    value={rule.venue}
                    onChange={(event) => {
                      const venue = isLiveVenue(event.target.value) ? event.target.value : "binance";
                      update(setAlerts, rule.id, {
                        venue,
                        fiat: supportsFiat(venue, rule.fiat) ? rule.fiat : "TRY",
                      });
                    }}
                    className="h-11 rounded-[12px] border border-border bg-background px-3 text-sm text-foreground"
                  >
                    <option value="binance">Binance P2P</option>
                    <option value="bybit">Bybit P2P</option>
                    <option value="wallet">Wallet P2P</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Рынок
                  <select
                    value={`${rule.fiat}:${rule.side}`}
                    onChange={(event) => {
                      const [fiat, side] = event.target.value.split(":");
                      const nextFiat: FiatId = fiat === "INR" || fiat === "RUB" ? fiat : "TRY";
                      update(setAlerts, rule.id, {
                        fiat: supportsFiat(rule.venue, nextFiat) ? nextFiat : "TRY",
                        side: side === "sell" ? "sell" : "buy",
                      });
                    }}
                    className="h-11 rounded-[12px] border border-border bg-background px-3 text-sm text-foreground"
                  >
                    {(["TRY", "INR", "RUB"] as const)
                      .filter((fiat) => supportsFiat(rule.venue, fiat))
                      .flatMap((fiat) =>
                        (["buy", "sell"] as const).map((side) => (
                          <option key={`${fiat}:${side}`} value={`${fiat}:${side}`}>
                            {FIAT_META[fiat].name} · {side === "buy" ? "покупка" : "продажа"}
                          </option>
                        )),
                      )}
                  </select>
                </label>
              </div>
              {invalid ? <p className="text-xs text-destructive">Порог должен быть числом.</p> : null}
              <div className="flex items-center gap-2">
                <Button type="button" variant={rule.enabled ? "default" : "outline"} className="min-h-11" onClick={() => update(setAlerts, rule.id, { enabled: !rule.enabled })}>
                  {rule.enabled ? "Включено" : "Выключено"}
                </Button>
                <Button type="button" variant="ghost" className="min-h-11" onClick={() => setAlerts((current) => current.filter((item) => item.id !== rule.id))}>
                  Удалить
                </Button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function update(setAlerts: (next: AlertRule[] | ((current: AlertRule[]) => AlertRule[])) => void, id: string, patch: Partial<AlertRule>) {
  setAlerts((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
}
