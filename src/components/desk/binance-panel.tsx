"use client";

import type { P2pSnapshot } from "@/lib/p2p-view";
import { P2pBlock } from "./p2p-block";
import { useVenue } from "./use-venue";
import { VenuePanel } from "./venue-panel";

export function BinancePanel() {
  const p2p = useVenue<P2pSnapshot>("/api/binance/p2p", 60000);
  return (
    <VenuePanel
      id="binance"
      title="Binance P2P"
      accent="venue-binance"
      kicker="Только объявления Binance"
      description="USDT к лире и рупии. Ликвидность, трафик объявлений, средняя покупка и активность мерчантов. Спотовый стакан и спред не считаются."
      fetchedAt={p2p.data?.fetchedAt}
      loading={p2p.loading}
      refreshing={p2p.refreshing}
      error={p2p.error}
      onRefresh={() => void p2p.reload()}
    >
      <P2pBlock data={p2p.data} loading={false} error={null} />
    </VenuePanel>
  );
}
