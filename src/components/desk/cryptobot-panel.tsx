"use client";

import { Badge } from "@/components/ui/badge";
import type { CryptobotSnapshot } from "@/lib/cryptobot";
import { formatPrice } from "@/lib/format";
import { useVenue } from "./use-venue";
import { VenuePanel } from "./venue-panel";

export function CryptobotPanel() {
  const venue = useVenue<CryptobotSnapshot>("/api/cryptobot", 60000);
  const data = venue.data;
  const usdtFiat = data?.rates.filter((rate) => rate.source === "USDT" && rate.isFiat) ?? [];

  return (
    <VenuePanel
      id="cryptobot"
      title="Крипто Бот"
      accent="venue-cryptobot"
      kicker="Crypto Pay"
      description="Курсы только из getExchangeRates. Публичного стакана у этой площадки нет."
      fetchedAt={data?.fetchedAt}
      loading={venue.loading}
      refreshing={venue.refreshing}
      error={venue.error}
      onRefresh={() => void venue.reload()}
    >
      {data?.needsToken ? (
        <div className="space-y-2 text-sm">
          <Badge variant="outline">нужен токен</Badge>
          <p>
            В <span className="font-mono">venue-desk/.env</span> нужен{" "}
            <span className="font-mono">CRYPTOBOT_API_TOKEN</span>. Его выдаёт @CryptoBot → Crypto Pay → Create App.
            Для чтения курса торговля и переводы не нужны.
          </p>
          <p className="text-muted-foreground">
            Пока токена нет, здесь пусто. Курсы Хрокета сюда не копируются. P2P, ликвидности и сделок за 24 часа у
            Crypto Pay нет.
          </p>
        </div>
      ) : null}
      {data && !data.needsToken ? (
        <div className="space-y-3">
          {data.error ? <p className="text-sm text-destructive">{data.error}</p> : null}
          {usdtFiat.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Пара</th>
                    <th className="py-1 font-medium">Курс</th>
                    <th className="py-1 font-medium">Годность</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {usdtFiat.map((rate) => (
                    <tr key={`${rate.source}-${rate.target}`} className="border-t border-border">
                      <td className="py-1.5 font-sans">
                        {rate.source} → {rate.target}
                      </td>
                      <td className="py-1.5">{formatPrice(rate.rate)}</td>
                      <td className="py-1.5 font-sans">{rate.isValid ? "is_valid" : "недействителен"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : data.error ? null : (
            <p className="text-sm text-muted-foreground">В ответе нет фиатных курсов USDT.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Одна цена для счёта. Стакана, P2P-объявлений, ликвидности и сделок за 24 часа в этом API нет.
          </p>
        </div>
      ) : null}
    </VenuePanel>
  );
}
