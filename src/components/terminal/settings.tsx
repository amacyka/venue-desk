"use client";

import { SOURCE_META } from "@/config/sources";
import { useProfileName } from "./storage";
import { PageIntro, Panel } from "./widgets";

export function SettingsScreen() {
  const [name, setName, ready] = useProfileName();

  return (
    <div className="grid max-w-3xl gap-6">
      <PageIntro eyebrow="Настройки" title="Настройки" text="Терминал читает публичные списки объявлений. Ключи бирж в браузер не кладутся." />
      <Panel className="p-4 md:p-5">
        <h2 className="text-sm font-medium">Профиль</h2>
        <p className="mt-2 text-sm text-muted-foreground">Имя видно только на этом устройстве. Учётной записи нет.</p>
        <label className="mt-4 grid gap-1 text-xs text-muted-foreground">
          Как к вам обращаться
          <input
            value={ready ? name : ""}
            disabled={!ready}
            onChange={(event) => setName(event.target.value.slice(0, 40))}
            className="h-11 rounded-[12px] border border-border bg-background px-3 text-sm text-foreground"
          />
        </label>
      </Panel>
      <Panel id="sources" className="scroll-mt-28 p-4 md:p-5">
        <h2 className="text-sm font-medium">Источники</h2>
        <div className="mt-4 grid gap-4">
          <SourceCopy name={SOURCE_META.binance.name} text="Публичный список P2P USDT к лире и рупии. Рубль с Bybit сюда не подставляется. Ключ не нужен." />
          <SourceCopy name={SOURCE_META.bybit.name} text="Публичный список объявлений USDT к лире, рупии и рублю. Способы оплаты приходят кодами, без названий банков." />
          <SourceCopy name={SOURCE_META.cryptobot.name} text={SOURCE_META.cryptobot.reason ?? ""} />
          <SourceCopy name={SOURCE_META.xrocket.name} text={SOURCE_META.xrocket.reason ?? ""} />
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Токен Crypto Pay, если его добавить на сервер, откроет справочные курсы, не P2P-объявления. В терминал такие курсы не выводятся, чтобы не смешать их со стаканом.
        </p>
      </Panel>
      <Panel className="p-4 md:p-5">
        <h2 className="text-sm font-medium">Данные</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Срез обновляется примерно раз в минуту. История средних пишется на сервере не чаще раза в минуту по каждой паре и не попадает в репозиторий. Случайные котировки не генерируются.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Бот с тем же срезом:{" "}
          <a className="text-primary" href="https://t.me/AMACY_Analytics_bot">
            @AMACY_Analytics_bot
          </a>
          . Кнопка «Терминал» в чате открывает этот экран внутри Telegram. Адрес задаётся на сервере в WEBAPP_URL.
        </p>
      </Panel>
    </div>
  );
}

function SourceCopy({ name, text }: { name: string; text: string }) {
  return (
    <div>
      <h3 className="text-sm">{name}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}
