export type FeatureState = "ready" | "planned";

export type PlanFeature = {
  label: string;
  state: FeatureState;
};

export type Plan = {
  id: "free" | "pro" | "premium";
  name: string;
  price: string;
  priceNote: string;
  summary: string;
  features: PlanFeature[];
};

/** Prices are placeholders. Billing is not connected. Edit this file to change the copy. */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "0",
    priceNote: "Заглушка. Оплата не подключена.",
    summary: "То, что терминал уже показывает по живым объявлениям.",
    features: [
      { label: "Срез Binance P2P и Bybit P2P по USDT", state: "ready" },
      { label: "Лира и рупия, по каждой площадке отдельно", state: "ready" },
      { label: "Короткая история срезов на диске сервера", state: "ready" },
      { label: "Доставка уведомлений", state: "planned" },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "—",
    priceNote: "Цену задайте в src/config/plans.ts",
    summary: "Сравнение, графики и правила. Отправка сообщений ещё не подключена.",
    features: [
      { label: "Сравнение средних цен предложений", state: "ready" },
      { label: "Графики по сохранённым срезам", state: "ready" },
      { label: "Правила уведомлений в этом браузере", state: "ready" },
      { label: "Отправка уведомлений в Telegram", state: "planned" },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "—",
    priceNote: "Цену задайте в src/config/plans.ts",
    summary: "Фильтры и несколько рынков. Чего нет в API, то остаётся в планах.",
    features: [
      { label: "Фильтр оплаты по всему списку", state: "ready" },
      { label: "Мониторинг нескольких рынков", state: "ready" },
      { label: "История длиннее текущих срезов", state: "planned" },
      { label: "Оборот завершённых сделок", state: "planned" },
    ],
  },
];
