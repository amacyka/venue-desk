"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { periodById, type FiatId, type LiveVenueId, type PeriodId } from "@/config/sources";
import { formatAxis, formatPct } from "@/lib/format";
import { baseline, changePct, type HistoryPoint } from "@/lib/overview";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function Panel({ id, className, children }: { id?: string; className?: string; children?: React.ReactNode }) {
  return (
    <section id={id} className={cn("rounded-[14px] border border-border bg-card shadow-[0_16px_40px_rgba(0,0,0,0.22)]", className)}>
      {children}
    </section>
  );
}

export function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">{eyebrow}</p>
      <h1 className="mt-2 text-[1.7rem] leading-tight font-medium tracking-tight text-foreground md:text-[2rem]">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground md:text-[15px]">{text}</p>
    </div>
  );
}

export function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">нет предыдущего среза</span>;
  return <span className={cn("font-mono text-xs", value < 0 ? "text-destructive" : "text-primary")}>{formatPct(value)}</span>;
}

export function Sparkline({ values }: { values: Array<number | null> }) {
  const nums = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (nums.length < 2) {
    return <div className="mt-4 h-8 border-t border-dashed border-border" aria-hidden="true" />;
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const last = nums[nums.length - 1] ?? min;
  const first = nums[0] ?? min;
  const color = last < first ? "#e15b64" : "#3ecf8e";
  const d = nums
    .map((value, index) => {
      const x = (index / (nums.length - 1)) * 100;
      const y = 28 - ((value - min) / span) * 22;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" className="mt-4 h-8 w-full" preserveAspectRatio="none" role="img" aria-label="Динамика срезов">
      <path d={d} fill="none" stroke={color} strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MetricCard({
  label,
  period,
  value,
  unit,
  hint,
  rows,
  delta,
  series,
  active = false,
}: {
  label: string;
  period: string;
  value: string;
  unit?: string;
  hint: string;
  rows: { label: string; value: string }[];
  delta?: number | null;
  series: Array<number | null>;
  active?: boolean;
}) {
  return (
    <Panel className={cn("p-4 md:p-5", active && "ring-1 ring-primary/50")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
        <p className="text-xs text-muted-foreground">{period}</p>
      </div>
      <div className="mt-4 flex items-end gap-2">
        <p className="font-mono text-[1.85rem] leading-none tracking-tight text-foreground md:text-[2.1rem]">{value}</p>
        {unit ? <p className="pb-0.5 text-sm text-muted-foreground">{unit}</p> : null}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
      {delta === undefined ? null : (
        <div className="mt-3">
          <Delta value={delta} />
        </div>
      )}
      <dl className="mt-4 grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right font-mono text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
      <Sparkline values={series} />
    </Panel>
  );
}

export function StateBlock({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: { label: string; onClick?: () => void; href?: string };
}) {
  return (
    <Panel className="p-5">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{text}</p>
      {action?.onClick ? (
        <Button type="button" className="mt-4 min-h-11" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
      {action?.href ? (
        <a href={action.href} className="mt-4 inline-flex min-h-11 items-center text-sm text-primary">
          {action.label}
        </a>
      ) : null}
    </Panel>
  );
}

export function CardSkeleton() {
  return (
    <Panel className="space-y-3 p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-16 w-full" />
    </Panel>
  );
}

export function changeFor(points: HistoryPoint[], key: keyof Pick<HistoryPoint, "averageBuy" | "averageSell" | "liquidityUsdt" | "liquiditySellUsdt" | "trafficAds">, current: number | null) {
  return changePct(current, baseline(points.map((point) => point[key]), current));
}

export function liquiditySeries(points: HistoryPoint[]): Array<number | null> {
  return points.map((point) => point.liquidityUsdt + point.liquiditySellUsdt);
}

export function SeriesChart({
  title,
  caption,
  unit,
  series,
  times,
  period,
}: {
  title: string;
  caption: string;
  unit: string;
  series: { name: string; color: string; values: Array<number | null> }[];
  times: string[];
  period: PeriodId;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const finite = series.flatMap((item) => item.values.filter((value): value is number => value !== null && Number.isFinite(value)));
  const ready = times.length >= 2 && finite.length >= 2;
  const width = 640;
  const height = 220;
  const left = 58;
  const right = 12;
  const top = 16;
  const bottom = 28;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const min = ready ? Math.min(...finite) : 0;
  const max = ready ? Math.max(...finite) : 1;
  const span = max - min || 1;
  const dense = period === "1h" || period === "24h";

  function xAt(index: number) {
    if (times.length <= 1) return left;
    return left + (index / (times.length - 1)) * innerW;
  }
  function yAt(value: number) {
    return top + (1 - (value - min) / span) * innerH;
  }
  function line(values: Array<number | null>) {
    let path = "";
    let drawing = false;
    values.forEach((value, index) => {
      if (value === null || !Number.isFinite(value)) {
        drawing = false;
        return;
      }
      path += `${drawing ? "L" : "M"}${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)} `;
      drawing = true;
    });
    return path.trim();
  }

  const ticks = [max, min + span / 2, min];
  const labelIndex = hover ?? times.length - 1;

  return (
    <Panel className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{caption}</p>
        </div>
        <p className="text-xs text-muted-foreground">{periodById(period).label}</p>
      </div>
      {ready ? (
        <div className="relative mt-4">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-56 w-full touch-none"
            role="img"
            aria-label={title}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / rect.width;
              const index = Math.round(ratio * (times.length - 1));
              setHover(Math.min(times.length - 1, Math.max(0, index)));
            }}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (touch.clientX - rect.left) / rect.width;
              const index = Math.round(ratio * (times.length - 1));
              setHover(Math.min(times.length - 1, Math.max(0, index)));
            }}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={left} x2={width - right} y1={yAt(tick)} y2={yAt(tick)} stroke="rgba(255,255,255,0.06)" />
                <text x={left - 8} y={yAt(tick) + 4} textAnchor="end" fill="#8b939c" fontSize="11">
                  {compact(tick)}
                </text>
              </g>
            ))}
            {series.map((item) => (
              <path key={item.name} d={line(item.values)} fill="none" stroke={item.color} strokeWidth="2" />
            ))}
            {hover !== null ? <line x1={xAt(hover)} x2={xAt(hover)} y1={top} y2={height - bottom} stroke="rgba(255,255,255,0.2)" /> : null}
            {[0, Math.floor((times.length - 1) / 2), times.length - 1].map((index) => (
              <text key={index} x={xAt(index)} y={height - 8} textAnchor={index === 0 ? "start" : index === times.length - 1 ? "end" : "middle"} fill="#8b939c" fontSize="11">
                {formatAxis(times[index] ?? "", dense)}
              </text>
            ))}
          </svg>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {series.map((item) => (
              <span key={item.name} className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full" style={{ background: item.color }} />
                {item.name}
              </span>
            ))}
            <span className="font-mono text-foreground">
              {formatAxis(times[labelIndex] ?? "", dense)}
              {series.map((item) => {
                const value = item.values[labelIndex];
                return value === null || value === undefined ? ` · ${item.name} —` : ` · ${item.name} ${compact(value)} ${unit}`;
              })}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm leading-6 text-muted-foreground">История копится. Нужны хотя бы два реальных среза. Линия не заполняется оценками.</p>
      )}
    </Panel>
  );
}

function compact(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: value >= 100 ? 2 : 4 }).format(value);
}

export function focusHistory(points: HistoryPoint[], venue: LiveVenueId, fiat: FiatId) {
  return points.filter((point) => point.venue === venue && point.fiat === fiat);
}
