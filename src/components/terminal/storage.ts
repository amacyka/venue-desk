"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Plan } from "@/config/plans";
import type { FiatId, LiveVenueId } from "@/config/sources";

export type Favorite = { venue: LiveVenueId; fiat: FiatId };
export type AlertKind = "price" | "liquidity" | "ads" | "spread" | "threshold";
export type AlertRule = {
  id: string;
  enabled: boolean;
  kind: AlertKind;
  venue: LiveVenueId;
  fiat: FiatId;
  side: "buy" | "sell";
  threshold: string;
};
export type PlanChoice = { id: Plan["id"]; chosenAt: string };

export const STORAGE_KEYS = {
  favorites: "srez.favorites",
  alerts: "srez.alerts",
  plan: "srez.plan",
  name: "srez.name",
} as const;

const EMPTY_FAVORITES: Favorite[] = [];
const EMPTY_ALERTS: AlertRule[] = [];

export function favoriteKey(item: Favorite): string {
  return `${item.venue}:USDT:${item.fiat}`;
}

export function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    const read = () => {
      let next = fallbackRef.current;
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) next = JSON.parse(raw) as T;
      } catch {
        next = fallbackRef.current;
      }
      setValue((current) => (sameJson(current, next) ? current : next));
    };
    read();
    setReady(true);
    window.addEventListener("srez-storage", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("srez-storage", read);
      window.removeEventListener("storage", read);
    };
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    const raw = JSON.stringify(value);
    if (localStorage.getItem(key) === raw) return;
    localStorage.setItem(key, raw);
    window.dispatchEvent(new Event("srez-storage"));
  }, [key, ready, value]);

  const update = useCallback((next: T | ((current: T) => T)) => {
    setValue((current) => (typeof next === "function" ? (next as (current: T) => T)(current) : next));
  }, []);

  return [value, update, ready] as const;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useFavorites() {
  return useStored<Favorite[]>(STORAGE_KEYS.favorites, EMPTY_FAVORITES);
}

export function useAlerts() {
  return useStored<AlertRule[]>(STORAGE_KEYS.alerts, EMPTY_ALERTS);
}

export function usePlanChoice() {
  return useStored<PlanChoice | null>(STORAGE_KEYS.plan, null);
}

export function useProfileName() {
  return useStored<string>(STORAGE_KEYS.name, "Гость");
}
