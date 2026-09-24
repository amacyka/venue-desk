import { fetchText, readJson } from "./http";

const URL = "https://pay.crypt.bot/api/getExchangeRates";

export type CryptobotRate = {
  source: string;
  target: string;
  rate: string;
  isValid: boolean;
  isFiat: boolean;
};

export type CryptobotSnapshot = {
  venue: "cryptobot";
  fetchedAt: string;
  needsToken: boolean;
  error: string | null;
  rates: CryptobotRate[];
};

export function parseCryptobotRates(body: unknown): CryptobotRate[] | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  if (root.ok !== true || !Array.isArray(root.result)) return null;
  const out: CryptobotRate[] = [];
  for (const row of root.result) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const source = String(item.source ?? "");
    const target = String(item.target ?? "");
    const rate = String(item.rate ?? "");
    if (!source || !target || !rate) continue;
    out.push({
      source,
      target,
      rate,
      isValid: item.is_valid === true,
      isFiat: item.is_fiat === true,
    });
  }
  return out;
}

export async function loadCryptobot(token = process.env.CRYPTOBOT_API_TOKEN): Promise<CryptobotSnapshot> {
  const fetchedAt = new Date().toISOString();
  if (!token) {
    return { venue: "cryptobot", fetchedAt, needsToken: true, error: null, rates: [] };
  }

  const res = await fetchText(URL, { headers: { "Crypto-Pay-API-Token": token } });
  if (!res.ok) {
    return {
      venue: "cryptobot",
      fetchedAt,
      needsToken: false,
      error: res.status === 401 ? "Токен Крипто Бота отклонён" : `Крипто Бот ответил HTTP ${res.status || "нет ответа"}`,
      rates: [],
    };
  }

  const rates = parseCryptobotRates(readJson(res.text));
  if (!rates) {
    return {
      venue: "cryptobot",
      fetchedAt,
      needsToken: false,
      error: "Крипто Бот вернул ответ без списка курсов",
      rates: [],
    };
  }

  return { venue: "cryptobot", fetchedAt, needsToken: false, error: null, rates };
}
