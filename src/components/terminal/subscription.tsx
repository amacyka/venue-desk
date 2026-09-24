"use client";

import { Button } from "@/components/ui/button";
import { PLANS } from "@/config/plans";
import { cn } from "@/lib/utils";
import { usePlanChoice } from "./storage";
import { PageIntro, Panel } from "./widgets";

export function SubscriptionScreen() {
  const [choice, setChoice, ready] = usePlanChoice();
  const selected = PLANS.find((plan) => plan.id === choice?.id);

  return (
    <div className="grid gap-6">
      <PageIntro
        eyebrow="Подписка"
        title="Подписка"
        text="Тариф описывает то, что уже работает, и то, что ещё не подключено. Оплаты в терминале нет."
      />
      <Panel className="p-4 md:p-5">
        <p className="text-sm font-medium">Активная подписка</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Оплаченной подписки нет, дата окончания не назначается.
          {selected ? ` Локально отмечен ${selected.name}. Это не включает списание и не открывает скрытые данные.` : " Тариф ещё не отмечен."}
        </p>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const current = choice?.id === plan.id;
          return (
            <Panel key={plan.id} className={cn("flex flex-col p-4 md:p-5", current && "ring-1 ring-primary/50")}>
              <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{plan.name}</p>
              <p className="mt-4 font-mono text-3xl">{plan.price}</p>
              <p className="mt-2 text-xs text-muted-foreground">{plan.priceNote}</p>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{plan.summary}</p>
              <ul className="mt-4 grid flex-1 gap-2">
                {plan.features.map((feature) => (
                  <li key={feature.label} className="flex items-start justify-between gap-3 text-sm">
                    <span>{feature.label}</span>
                    <span className={cn("shrink-0 text-xs", feature.state === "ready" ? "text-primary" : "text-muted-foreground")}>
                      {feature.state === "ready" ? "есть" : "запланировано"}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                className="mt-5 min-h-11"
                variant={current ? "outline" : "default"}
                disabled={!ready}
                onClick={() => setChoice({ id: plan.id, chosenAt: new Date().toISOString() })}
              >
                {current ? "Тариф отмечен" : "Выбрать тариф"}
              </Button>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
