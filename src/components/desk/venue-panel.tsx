"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatClock } from "@/lib/format";

export function VenuePanel({
  id,
  title,
  accent,
  kicker,
  description,
  fetchedAt,
  loading,
  refreshing,
  error,
  onRefresh,
  children,
}: {
  id: string;
  title: string;
  accent: string;
  kicker: string;
  description: string;
  fetchedAt?: string;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card className={accent}>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{kicker}</p>
              <CardTitle className="mt-1 text-xl">{title}</CardTitle>
              <CardDescription className="mt-1 max-w-xl">{description}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {fetchedAt ? <Badge variant="outline">{formatClock(fetchedAt)}</Badge> : null}
              <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
                {refreshing ? "Обновляю" : "Обновить"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {error ? (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (
            children
          )}
        </CardContent>
      </Card>
    </section>
  );
}
