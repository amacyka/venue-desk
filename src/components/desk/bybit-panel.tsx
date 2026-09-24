"use client";

import type { P2pSnapshot } from "@/lib/p2p-view";
import { P2pBlock } from "./p2p-block";
import { useVenue } from "./use-venue";
import { VenuePanel } from "./venue-panel";

export function BybitPanel() {
  const p2p = useVenue<P2pSnapshot>("/api/bybit/p2p", 60000);
  return (
    <VenuePanel
      id="bybit"
      title="Bybit P2P"
      accent="venue-bybit"
      kicker="Только объявления Bybit"
      description="USDT к лире и рупии со своего списка объявлений. Цифры Binance сюда не подставляются."
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
